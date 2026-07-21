import { wrapCode } from '@tanstack/ai-code-mode'
import {
  isFatalQuickJSLimitError,
  memoryLimitError,
  normalizeError,
} from './error-normalizer'
import type {
  ExecutionResult,
  IsolateContext,
  NormalizedError,
  ToolBinding,
} from '@tanstack/ai-code-mode'
import type * as QuickJSBun from 'quickjs-bun'
import type { Deferred, JSContext, JSRuntime, JSValue } from 'quickjs-bun'

/**
 * The `quickjs-bun` module namespace. The module is imported dynamically by
 * the driver (it only loads under the Bun runtime), so the classes and enums
 * it exports are threaded through here instead of being imported statically.
 */
export type QuickJSBunModule = typeof QuickJSBun

/**
 * An in-flight host tool call. The sandbox holds a QuickJS promise that is
 * resolved from the host once the binding's `execute` settles; `settled`
 * lets the execution loop wait for host work without polling.
 */
interface HostTask {
  deferred: Deferred
  settle: () => void
  settled: Promise<void>
}

/**
 * Result envelope passed across the sandbox boundary as a JSON string.
 */
interface ToolResultEnvelope {
  success: boolean
  value?: unknown
  error?: string
}

/**
 * Caps on captured console output. Logs are held on the host and flow back
 * to the model, so an unbounded `while (true) console.log(...)` loop in
 * untrusted code could grow host memory without ever tripping the sandbox
 * heap limit (the sandbox only holds one string at a time). Once either cap
 * is reached a single truncation marker is appended and further output is
 * dropped for the rest of the execution.
 */
const MAX_LOG_ENTRIES = 10_000
const MAX_LOG_BYTES = 1_000_000

/** Default ceiling on host tool-call invocations per execution. */
export const DEFAULT_MAX_TOOL_CALLS = 1000

/** Placeholder used when a console argument cannot be coerced to a string. */
const UNPRINTABLE_LOG_VALUE = '[unprintable]'

/**
 * Rebuild a throwable carrying a normalized error's name/message/stack so it
 * round-trips through `normalizeError` (which preserves the name, keeping
 * fatal-limit classification intact).
 */
function normalizedErrorToThrowable(error: NormalizedError): Error {
  const throwable = new Error(error.message)
  throwable.name = error.name
  if (error.stack !== undefined) throwable.stack = error.stack
  return throwable
}

/**
 * Generic wrapper factory evaluated once per context. Tool functions are
 * created by calling it with the host implementation and installed on the
 * global object with `setGlobal`, so binding names are never interpolated
 * into evaluated source code.
 */
const TOOL_WRAPPER_FACTORY = `(function (impl) {
  return async function (input) {
    const resultJson = await impl(JSON.stringify(input ?? {}));
    const result = JSON.parse(resultJson);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.value;
  };
})`

/**
 * IsolateContext implementation backed by a dedicated native QuickJS
 * runtime + context pair (via `quickjs-bun`).
 */
export class QuickJSBunIsolateContext implements IsolateContext {
  private readonly quickjs: QuickJSBunModule
  private readonly runtime: JSRuntime
  private readonly vm: JSContext
  private readonly timeout: number
  private readonly maxToolCalls: number
  private readonly logs: Array<string> = []
  private logBytes = 0
  private logTruncated = false
  private readonly tasks = new Set<HostTask>()
  private toolCallsUsed = 0
  private disposed = false
  /**
   * A VM-level failure raised while settling a host tool call (e.g. the
   * sandbox heap was exhausted when allocating the result string). It is
   * surfaced through the execution loop rather than left to escape the
   * floating settle callback as an unhandled rejection.
   */
  private hostSettleError: NormalizedError | undefined
  /**
   * Serializes executions on this context. A context only ever runs one
   * program at a time; QuickJS contexts are single-threaded and the
   * execution loop drives the runtime's job queue.
   */
  private execQueue: Promise<void> = Promise.resolve()

  /**
   * Wrap a live `quickjs-bun` runtime + context pair, then install the captured
   * `console` and the host tool bindings on the sandbox global before the first
   * `execute`. Takes ownership of `runtime`/`vm`; `dispose()` frees them.
   */
  constructor(options: {
    quickjs: QuickJSBunModule
    runtime: JSRuntime
    vm: JSContext
    timeout: number
    maxToolCalls: number
    bindings: Record<string, ToolBinding>
  }) {
    this.quickjs = options.quickjs
    this.runtime = options.runtime
    this.vm = options.vm
    this.timeout = options.timeout
    this.maxToolCalls = options.maxToolCalls
    this.installConsole()
    this.installBindings(options.bindings)
  }

  /**
   * Run `code` to completion inside the sandbox and return its result.
   * Executions are serialized through a per-context queue, so a second
   * `execute` (or a concurrent `dispose`) waits for the in-flight run rather
   * than interleaving. Console output produced during the run is captured and
   * returned in `logs`. Never throws: tool errors, timeouts, and limit
   * violations come back as a failed `ExecutionResult` with a normalized error.
   */
  async execute<T = unknown>(code: string): Promise<ExecutionResult<T>> {
    if (this.disposed) {
      return this.disposedResult()
    }

    // Serialize through the per-context queue so a second execute (or a
    // concurrent dispose) never interleaves with an in-flight run.
    let release!: () => void
    const myTurn = new Promise<void>((resolve) => {
      release = resolve
    })
    const waitForPrev = this.execQueue
    this.execQueue = myTurn

    await waitForPrev

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() may run while awaiting the queue
    if (this.disposed) {
      release()
      return this.disposedResult()
    }

    this.logs.length = 0
    this.logBytes = 0
    this.logTruncated = false
    this.toolCallsUsed = 0
    this.hostSettleError = undefined

    try {
      const value = await this.runToCompletion(wrapCode(code))
      return {
        success: true,
        value: value as T,
        logs: [...this.logs],
      }
    } catch (error) {
      return this.fail(error)
    } finally {
      // Abandon host tool calls that are still in flight (e.g. after a
      // timeout) so a late completion cannot touch the VM.
      this.abortTasks()
      release()
    }
  }

  /**
   * Release the underlying QuickJS runtime and abandon any in-flight host tool
   * calls. Waits for a running execution to finish first (the execution loop
   * touches native handles throughout). Idempotent.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return

    // Wait for any in-flight execution to finish before freeing the
    // runtime; the execution loop touches native handles throughout.
    await this.execQueue

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a fatal limit error may dispose the VM while awaiting the queue
    if (this.disposed) return
    this.disposed = true
    this.abortTasks()
    this.runtime.dispose()
  }

  /**
   * Evaluate the wrapped program and drive the QuickJS job queue (and any
   * in-flight host tool calls) until the program's promise settles or the
   * deadline passes. Returns the parsed result value.
   */
  private async runToCompletion(wrappedCode: string): Promise<unknown> {
    const { QuickJSPromiseState, JSException } = this.quickjs
    const deadline = performance.now() + this.timeout

    // The synchronous portion of the program is bounded by the QuickJS
    // interrupt handler; async continuations are bounded by the deadline
    // checks in the loop below.
    const resultHandle = this.vm.evalCode(wrappedCode, {
      filename: '<code-mode>',
      timeoutMs: this.timeout,
    })

    let settledHandle: JSValue
    try {
      if (resultHandle.promiseState === QuickJSPromiseState.NOT_PROMISE) {
        // wrapCode always produces an async IIFE, but stay defensive.
        settledHandle = resultHandle.dup()
      } else {
        for (;;) {
          const state = resultHandle.promiseState
          if (state === QuickJSPromiseState.FULFILLED) {
            settledHandle = resultHandle.promiseResult()
            break
          }
          if (state === QuickJSPromiseState.REJECTED) {
            throw new JSException(resultHandle.promiseResult())
          }

          // A host tool call failed to settle the sandbox promise because
          // the VM itself errored (e.g. OOM allocating the result string).
          // Surface it here so fail() can classify it and release the VM if
          // it was fatal, rather than letting it escape as an unhandled
          // rejection from the floating settle callback.
          if (this.hostSettleError !== undefined) {
            throw normalizedErrorToThrowable(this.hostSettleError)
          }

          const remainingMs = deadline - performance.now()
          if (remainingMs <= 0) {
            throw this.timeoutError()
          }

          // Run one queued microtask (promise reaction) if there is one...
          if (this.runtime.executePendingJob(Math.max(1, remainingMs))) {
            continue
          }

          // ...otherwise the program is waiting on host work. A settle
          // failure raised while draining the last task is caught by the
          // hostSettleError check at the top of the next iteration before we
          // ever reach this branch.
          if (this.tasks.size === 0) {
            throw new Error(
              'Code execution is pending on a promise that no host work will ever resolve',
            )
          }
          await this.waitForAnyTask(remainingMs)
        }
      }
    } finally {
      resultHandle.dispose()
    }

    try {
      const dumped = this.vm.dump(settledHandle)

      // The wrapper returns JSON.stringify(userResult) — parse it back.
      // A bare string that isn't valid JSON is returned as-is, and code
      // that returned nothing yields undefined.
      if (typeof dumped === 'string') {
        try {
          return JSON.parse(dumped)
        } catch {
          return dumped
        }
      }
      return dumped
    } finally {
      settledHandle.dispose()
    }
  }

  /** Wait until any in-flight host tool call settles, or `timeoutMs` passes. */
  private async waitForAnyTask(timeoutMs: number): Promise<void> {
    const settled = Array.from(this.tasks, (task) => task.settled)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.race(settled),
        new Promise<void>((resolve) => {
          // Resolve (not reject): the execution loop re-checks the deadline.
          timer = setTimeout(resolve, Math.max(1, timeoutMs))
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Install a `console` object on the sandbox global whose `log`/`error`/
   * `warn`/`info` methods funnel into the host log buffer. Non-`log` levels are
   * prefixed (e.g. `ERROR: …`) to mirror the other drivers' capture format.
   */
  private installConsole(): void {
    const { vm } = this
    const methods: Array<[name: string, prefix: string]> = [
      ['log', ''],
      ['error', 'ERROR'],
      ['warn', 'WARN'],
      ['info', 'INFO'],
    ]

    const consoleObj = vm.newObject()
    try {
      for (const [method, prefix] of methods) {
        const fn = vm.newFunction((...args) => {
          const parts = args.map((arg) => this.stringifyConsoleArg(arg))
          const msg = prefix ? `${prefix}: ${parts.join(' ')}` : parts.join(' ')
          this.pushLog(msg)
        })
        try {
          consoleObj.setProp(method, fn)
        } finally {
          fn.dispose()
        }
      }
      vm.setGlobal('console', consoleObj)
    } finally {
      consoleObj.dispose()
    }
  }

  /**
   * Coerce a console argument to a string. quickjs-bun's `JSValue.toString()`
   * asserts the value is already a string and throws for numbers, objects,
   * booleans, etc.; `coerceToString()` performs a real `ToString` (matching
   * the WASM driver's `getString`). A coercion that throws (e.g. a symbol or
   * a `toString` that throws) degrades to a placeholder rather than aborting
   * the whole execution.
   */
  private stringifyConsoleArg(arg: JSValue): string {
    const { JSException } = this.quickjs
    try {
      const coerced = arg.coerceToString()
      try {
        return coerced.toString()
      } finally {
        coerced.dispose()
      }
    } catch (error) {
      if (error instanceof JSException) error.dispose()
      return UNPRINTABLE_LOG_VALUE
    }
  }

  /** Append a captured log line, enforcing the entry-count and byte caps. */
  private pushLog(msg: string): void {
    if (this.logTruncated) return
    if (
      this.logs.length >= MAX_LOG_ENTRIES ||
      this.logBytes + msg.length > MAX_LOG_BYTES
    ) {
      this.logTruncated = true
      this.logs.push('[log output truncated]')
      return
    }
    this.logs.push(msg)
    this.logBytes += msg.length
  }

  /**
   * Install each host tool `binding` as an async function on the sandbox
   * global. Wrappers are produced by evaluating `TOOL_WRAPPER_FACTORY` once and
   * calling it per binding, so binding names are never interpolated into
   * evaluated source. No-op when there are no bindings.
   */
  private installBindings(bindings: Record<string, ToolBinding>): void {
    const { vm } = this
    const entries = Object.entries(bindings)
    if (entries.length === 0) return

    const factory = vm.evalCode(TOOL_WRAPPER_FACTORY, {
      filename: '<tool-wrapper>',
    })
    try {
      for (const [name, binding] of entries) {
        const impl = vm.newFunction((argsHandle) =>
          this.runBinding(binding, argsHandle),
        )
        try {
          const wrapped = vm.callFunction(factory, vm.undefined, impl)
          try {
            vm.setGlobal(name, wrapped)
          } finally {
            wrapped.dispose()
          }
        } finally {
          impl.dispose()
        }
      }
    } finally {
      factory.dispose()
    }
  }

  /**
   * Host side of a tool call. Invoked synchronously from inside the VM;
   * returns a QuickJS promise immediately and settles it from the host
   * once `binding.execute` finishes. Never rejects the promise for tool
   * errors — failures travel in the JSON envelope so the sandbox wrapper
   * can rethrow them as regular errors.
   */
  private runBinding(
    binding: ToolBinding,
    argsHandle: JSValue | undefined,
  ): JSValue {
    const { vm } = this

    // Bound the number of host tool calls per execution. Untrusted sandbox
    // code can otherwise fan out (e.g. `Promise.all` over a huge array) into
    // unbounded concurrent host work — the deadline only bounds wall-clock,
    // not the burst. Throwing here surfaces as a catchable error at the call
    // site inside the sandbox.
    if (this.toolCallsUsed >= this.maxToolCalls) {
      throw new Error(
        `Exceeded the maximum of ${this.maxToolCalls} tool calls per execution`,
      )
    }
    this.toolCallsUsed++

    const deferred = vm.newPromise()
    const promise = deferred.promise.dup()

    let settle: () => void = () => undefined
    const settledPromise = new Promise<void>((resolve) => {
      settle = resolve
    })
    const task: HostTask = { deferred, settle, settled: settledPromise }
    this.tasks.add(task)

    const settleWith = (envelope: ToolResultEnvelope): void => {
      // The task may have been abandoned by a timeout or dispose — never
      // touch the VM in that case.
      if (this.disposed || !this.tasks.has(task)) return
      this.tasks.delete(task)
      try {
        let json: string
        try {
          json = JSON.stringify(envelope)
        } catch (error) {
          json = JSON.stringify({
            success: false,
            error: `Tool result is not JSON-serializable: ${
              error instanceof Error ? error.message : String(error)
            }`,
          })
        }
        const handle = vm.newString(json)
        try {
          deferred.resolve(handle)
        } finally {
          handle.dispose()
        }
      } catch (error) {
        // Allocating the result string or resolving the promise can fail if
        // the sandbox heap is exhausted. Record it so the execution loop can
        // classify it (and release the VM if fatal) instead of letting it
        // escape the floating async callback as an unhandled rejection.
        this.hostSettleError ??= this.toNormalizedError(error)
      } finally {
        deferred.dispose()
        task.settle()
      }
    }

    // The wrapper always passes a JSON string, but degrade gracefully if
    // the handle dumps to something else.
    let argsJson = '{}'
    try {
      const dumped = vm.dump(argsHandle ?? vm.undefined)
      if (typeof dumped === 'string') {
        argsJson = dumped
      }
    } catch (error) {
      // Fall through with empty args (JSON.parse below cannot fail on '{}').
      // dump() rethrows VM failures as a JSException whose owned value must
      // be released.
      if (error instanceof this.quickjs.JSException) error.dispose()
    }

    void (async () => {
      let envelope: ToolResultEnvelope
      try {
        const args: unknown = JSON.parse(argsJson)
        const value = await binding.execute(args)
        envelope = { success: true, value }
      } catch (error) {
        envelope = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      settleWith(envelope)
    })()

    return promise
  }

  /** Abandon all in-flight host tool calls and release their VM handles. */
  private abortTasks(): void {
    for (const task of this.tasks) {
      task.deferred.dispose()
      task.settle()
    }
    this.tasks.clear()
  }

  /**
   * Build a failed `ExecutionResult` from a thrown value, attaching the
   * captured logs. If the error is a fatal QuickJS limit (memory/stack), the
   * runtime is released first since it may be left unusable.
   */
  private fail(error: unknown): ExecutionResult<never> {
    const normalized = this.toNormalizedError(error)
    if (isFatalQuickJSLimitError(normalized)) {
      this.releaseVmAfterFatalLimit()
    }
    return {
      success: false,
      error: normalized,
      logs: [...this.logs],
    }
  }

  /**
   * Convert any thrown value into a `NormalizedError`, unwrapping a quickjs-bun
   * `JSException`: a bare `null` exception value (heap too exhausted to
   * allocate an Error) becomes a `MemoryLimitError`, and a thrown plain
   * object/array has its `message`/`name` recovered so the model still gets
   * useful feedback — parity with the WASM driver. Always disposes the owned
   * exception value.
   */
  private toNormalizedError(error: unknown): NormalizedError {
    const { JSException } = this.quickjs
    if (error instanceof JSException) {
      try {
        const value = error.value
        // QuickJS throws a bare `null` exception value when the heap is too
        // exhausted to allocate an Error object. (A literal `throw null` in
        // sandbox code is indistinguishable and is treated the same way.)
        if (value.type === 'null') {
          return memoryLimitError(error.stack)
        }
        // A thrown plain object/array surfaces through quickjs-bun's
        // JSException as the generic "QuickJS object was thrown"; recover its
        // `message` (and `name`) so the model still gets useful feedback for
        // self-correction — parity with the WASM driver.
        if (value.type === 'object' || value.type === 'array') {
          const message = this.readValueProp(value, 'message')
          if (message !== undefined) {
            return {
              name: this.readValueProp(value, 'name') ?? error.name,
              message,
              ...(error.stack !== undefined && { stack: error.stack }),
            }
          }
        }
        return normalizeError(error)
      } finally {
        error.dispose()
      }
    }
    return normalizeError(error)
  }

  /**
   * Read a string property from a thrown QuickJS value, tolerating throwing
   * getters (the value is attacker-controlled). Returns undefined on any
   * failure and releases the owned exception in that case.
   */
  private readValueProp(value: JSValue, name: string): string | undefined {
    try {
      return value.errorProperty(name)
    } catch (error) {
      if (error instanceof this.quickjs.JSException) error.dispose()
      return undefined
    }
  }

  /**
   * After a memory/stack limit error the QuickJS runtime may be left in an
   * unusable state — release it eagerly so the host process reclaims the
   * native memory. Matches the QuickJS WASM driver's behavior.
   */
  private releaseVmAfterFatalLimit(): void {
    if (this.disposed) return
    this.disposed = true
    this.abortTasks()
    try {
      this.runtime.dispose()
    } catch {
      // ignore if the runtime is already torn down
    }
  }

  /** Construct the `TimeoutError` thrown when an execution exceeds its deadline. */
  private timeoutError(): Error {
    const error = new Error(`Code execution timed out after ${this.timeout}ms`)
    error.name = 'TimeoutError'
    return error
  }

  /** The failed `ExecutionResult` returned once the context has been disposed. */
  private disposedResult(): ExecutionResult<never> {
    return {
      success: false,
      error: {
        name: 'DisposedError',
        message: 'Context has been disposed',
      },
      logs: [],
    }
  }
}
