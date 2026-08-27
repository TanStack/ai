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

export type QuickJSBunModule = typeof QuickJSBun

interface HostTask {
  deferred: Deferred
  settle: () => void
  settled: Promise<void>
}

interface ToolResultEnvelope {
  success: boolean
  value?: unknown
  error?: string
}

const MAX_LOG_ENTRIES = 10_000
const MAX_LOG_CHARS = 1_000_000

/** Default ceiling on host tool-call invocations per execution. */
export const DEFAULT_MAX_TOOL_CALLS = 1000

const MAX_STALE_JOB_DRAIN = 10_000

/** Placeholder used when a console argument cannot be coerced to a string. */
const UNPRINTABLE_LOG_VALUE = '[unprintable]'

function normalizedErrorToThrowable(error: NormalizedError): Error {
  const throwable = new Error(error.message)
  throwable.name = error.name
  if (error.stack !== undefined) throwable.stack = error.stack
  return throwable
}

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

export class QuickJSBunIsolateContext implements IsolateContext {
  private readonly quickjs: QuickJSBunModule
  private readonly runtime: JSRuntime
  private readonly vm: JSContext
  private readonly timeout: number
  private readonly maxToolCalls: number
  private readonly logs: Array<string> = []
  private logChars = 0
  private logTruncated = false
  private readonly tasks = new Set<HostTask>()
  private toolCallsUsed = 0
  private disposed = false
  private hostSettleError: NormalizedError | undefined
  private execQueue: Promise<void> = Promise.resolve()

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

    this.drainStaleJobs()
    this.abortTasks()

    this.logs.length = 0
    this.logChars = 0
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

  private async runToCompletion(wrappedCode: string): Promise<unknown> {
    const { QuickJSPromiseState, JSException } = this.quickjs
    const deadline = performance.now() + this.timeout

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
    const overLogCap =
      this.logs.length >= MAX_LOG_ENTRIES ||
      this.logChars + msg.length > MAX_LOG_CHARS
    if (overLogCap) {
      this.logTruncated = true
      this.logs.push('[log output truncated]')
      return
    }
    this.logs.push(msg)
    this.logChars += msg.length
  }

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

  private runBinding(
    binding: ToolBinding,
    argsHandle: JSValue | undefined,
  ): JSValue {
    const { vm } = this

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
      const taskAbandoned = this.disposed || !this.tasks.has(task)
      if (taskAbandoned) return
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
        this.hostSettleError ??= this.toNormalizedError(error)
      } finally {
        deferred.dispose()
        task.settle()
      }
    }

    let argsJson = '{}'
    try {
      const dumped = vm.dump(argsHandle ?? vm.undefined)
      if (typeof dumped === 'string') {
        argsJson = dumped
      }
    } catch (error) {
      this.hostSettleError ??= this.toNormalizedError(error)
      this.tasks.delete(task)
      deferred.dispose()
      task.settle()
      return promise
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

  private drainStaleJobs(): void {
    for (let i = 0; i < MAX_STALE_JOB_DRAIN; i++) {
      try {
        if (!this.runtime.executePendingJob(1)) return
      } catch {
        // A stale reaction threw; discard it and keep draining the rest.
      }
    }
  }

  /** Abandon all in-flight host tool calls and release their VM handles. */
  private abortTasks(): void {
    for (const task of this.tasks) {
      task.deferred.dispose()
      task.settle()
    }
    this.tasks.clear()
  }

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

  private toNormalizedError(error: unknown): NormalizedError {
    const { JSException } = this.quickjs
    if (error instanceof JSException) {
      try {
        const value = error.value
        if (value.type === 'null') {
          return memoryLimitError(error.stack)
        }
        const isStructured = value.type === 'object' || value.type === 'array'
        if (isStructured) {
          const message = this.readValueProp(value, 'message')
          if (message !== undefined) {
            const recovered = new Error(message)
            recovered.name = this.readValueProp(value, 'name') ?? error.name
            if (error.stack !== undefined) recovered.stack = error.stack
            return normalizeError(recovered)
          }
        }
        return normalizeError(error)
      } finally {
        error.dispose()
      }
    }
    return normalizeError(error)
  }

  private readValueProp(value: JSValue, name: string): string | undefined {
    try {
      return value.errorProperty(name)
    } catch (error) {
      if (error instanceof this.quickjs.JSException) error.dispose()
      return undefined
    }
  }

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
