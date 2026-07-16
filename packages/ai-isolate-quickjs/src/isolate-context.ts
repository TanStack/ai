import { wrapCode } from '@tanstack/ai-code-mode'
import {
  TIMEOUT_ERROR,
  isFatalQuickJSLimitError,
  normalizeError,
} from './error-normalizer'
import type {
  QuickJSContext,
  QuickJSHandle,
  VmCallResult,
} from 'quickjs-emscripten'
import type { ExecutionResult, IsolateContext } from '@tanstack/ai-code-mode'

/**
 * Execution state shared with the tool bindings created in the driver.
 * `deadline === 0` means no execution is active, so any guest job that runs
 * outside execute() is interrupted immediately. `pendingCancels` holds one
 * cancel callback per tool call still awaiting its host promise; a timed-out
 * execution invokes them to settle the guest program so the VM can be
 * disposed safely.
 */
export interface ExecState {
  deadline: number
  pendingCancels: Set<() => void>
}

/** Grace window for cancellation continuations after a timeout. */
const CANCEL_GRACE_MS = 100

/**
 * Await the guest program's promise, but give up at `deadline`. Host tool
 * calls are bridged as QuickJS promises, so a guest program that is stuck
 * waiting (e.g. its continuation was interrupted) would otherwise never
 * settle. A timeout is terminal for the context (see `fail()` in execute):
 * the timed-out program's interrupted jobs stay queued in the VM and must
 * never run inside a later execution. If the guest settles after the
 * deadline, its result handle is disposed to avoid leaking it into the
 * context's lifetime.
 */
function awaitWithDeadline(
  promise: Promise<VmCallResult<QuickJSHandle>>,
  deadline: number,
): Promise<VmCallResult<QuickJSHandle>> {
  return new Promise((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(
      () => {
        timedOut = true
        const timeoutError = new Error('Code execution timed out')
        timeoutError.name = TIMEOUT_ERROR
        reject(timeoutError)
      },
      Math.max(0, deadline - Date.now()),
    )

    promise.then(
      (result) => {
        if (timedOut) {
          try {
            if ('error' in result && result.error) {
              result.error.dispose()
            } else {
              result.value.dispose()
            }
          } catch {
            // context may already be disposed
          }
          return
        }
        clearTimeout(timer)
        resolve(result)
      },
      (error) => {
        if (timedOut) return
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * IsolateContext implementation using QuickJS WASM
 */
export class QuickJSIsolateContext implements IsolateContext {
  private readonly vm: QuickJSContext
  private readonly logs: Array<string>
  private readonly timeout: number
  private readonly execState: ExecState
  /** Serializes execute() calls so evaluations on this VM never interleave. */
  private execQueue: Promise<void> = Promise.resolve()
  private disposed = false
  private executing = false

  constructor(
    vm: QuickJSContext,
    logs: Array<string>,
    timeout: number,
    execState: ExecState,
  ) {
    this.vm = vm
    this.logs = logs
    this.timeout = timeout
    this.execState = execState
  }

  async execute<T = unknown>(code: string): Promise<ExecutionResult<T>> {
    if (this.disposed) {
      return {
        success: false,
        error: {
          name: 'DisposedError',
          message: 'Context has been disposed',
        },
        logs: [],
      }
    }

    // Serialize through the queue so concurrent execute() calls on this
    // context never interleave their pending jobs.
    let resolve!: () => void
    const myTurn = new Promise<void>((r) => {
      resolve = r
    })
    const waitForPrev = this.execQueue
    this.execQueue = myTurn

    await waitForPrev

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() may be called concurrently while awaiting the queue
    if (this.disposed) {
      resolve()
      return {
        success: false,
        error: {
          name: 'DisposedError',
          message: 'Context has been disposed',
        },
        logs: [],
      }
    }

    this.executing = true
    this.logs.length = 0

    // True until a program promise is in flight; sync failure paths (parse
    // errors, interrupted straight-line code) leave no unsettled guest state.
    let guestSettled = true

    const releaseVmAfterFatalError = () => {
      if (this.disposed) return
      try {
        this.vm.runtime.setInterruptHandler(() => false)
      } catch {
        // ignore if runtime is already torn down
      }
      this.disposed = true
      this.vm.dispose()
    }

    // A timed-out program's interrupted jobs stay queued in the VM, where
    // they would run inside the next execution's deadline — so a timeout is
    // terminal for the context. Disposal needs care: freeing a runtime that
    // still holds an unsettled program promise aborts the shared WASM
    // module. Cancel every outstanding tool call (settling the guest
    // program), then dispose once the guest has settled; if it cannot
    // settle (e.g. an interrupted infinite loop), leak the VM instead.
    const releaseAfterTimeout = async () => {
      if (this.disposed) return
      this.disposed = true
      this.execState.deadline = Date.now() + CANCEL_GRACE_MS
      for (const cancel of [...this.execState.pendingCancels]) {
        cancel()
      }
      this.execState.pendingCancels.clear()
      // Cancellation continuations run as microtasks; one macrotask tick
      // lets the guest program settle and its result handles be reclaimed.
      await new Promise((r) => setTimeout(r, 0))
      this.execState.deadline = 0
      if (guestSettled) {
        this.vm.dispose()
      }
    }

    const fail = async (error: unknown) => {
      const normalized = normalizeError(error)
      if (normalized.name === TIMEOUT_ERROR) {
        await releaseAfterTimeout()
      } else if (isFatalQuickJSLimitError(normalized)) {
        // Memory/stack limits leave the heap in an unknown state.
        releaseVmAfterFatalError()
      }
      return {
        success: false as const,
        error: normalized,
        logs: [...this.logs],
      }
    }

    try {
      const wrappedCode = wrapCode(code)

      const deadline = Date.now() + this.timeout
      this.execState.deadline = deadline

      try {
        const result = this.vm.evalCode(wrappedCode)

        let parsedResult: T
        try {
          const promiseHandle = this.vm.unwrapResult(result)

          // evalCode returns a Promise handle (our wrapper is an async IIFE).
          // Await it via resolvePromise; guest continuations run when the
          // tool bindings' promise-settled pumps call executePendingJobs.
          const nativePromise = this.vm.resolvePromise(promiseHandle)
          promiseHandle.dispose()
          guestSettled = false
          void nativePromise.then(
            () => {
              guestSettled = true
            },
            () => {
              guestSettled = true
            },
          )
          const jobs = this.vm.runtime.executePendingJobs()
          if (jobs.error) {
            const dumped: unknown = this.vm.dump(jobs.error)
            jobs.error.dispose()
            return await fail(dumped)
          }
          const resolvedResult = await awaitWithDeadline(
            nativePromise,
            deadline,
          )

          const valueHandle = this.vm.unwrapResult(resolvedResult)
          const dumpedResult = this.vm.dump(valueHandle)
          valueHandle.dispose()

          if (typeof dumpedResult === 'string') {
            try {
              parsedResult = JSON.parse(dumpedResult) as T
            } catch {
              parsedResult = dumpedResult as T
            }
          } else {
            parsedResult = dumpedResult as T
          }

          return {
            success: true,
            value: parsedResult,
            logs: [...this.logs],
          }
        } catch (unwrapError) {
          return await fail(unwrapError)
        }
      } finally {
        // fail() may set disposed when releasing the VM after memory/stack
        // limit errors or timeouts
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- disposed set in fail()
        if (!this.disposed) {
          this.execState.deadline = 0
        }
      }
    } catch (error) {
      return await fail(error)
    } finally {
      this.executing = false
      resolve()
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return

    // If an execution is in flight, wait for the queue to drain before
    // disposing the VM. Otherwise a pending tool-binding callback would
    // try to access a freed context.
    if (this.executing) {
      await this.execQueue
      // The execution may have disposed the VM, or intentionally retained an
      // unsettled VM, while dispose() was waiting for the queue.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- execution cleanup may set disposed while awaiting
      if (this.disposed) return
    }

    this.disposed = true

    // A completed execution can leave tool calls still awaiting their host
    // promise (e.g. a Promise.race loser abandoned by the guest program).
    // Each holds an unsettled QuickJS deferred, and freeing a runtime with
    // live deferred handles aborts the shared WASM module
    // (`Assertion failed: list_empty(&rt->gc_obj_list)` in JS_FreeRuntime),
    // poisoning every later context in this process. Settle them exactly like
    // the timeout path does, then give the settled pumps one macrotask tick
    // to dispose their deferreds before the VM goes away.
    if (this.execState.pendingCancels.size > 0) {
      this.execState.deadline = Date.now() + CANCEL_GRACE_MS
      for (const cancel of [...this.execState.pendingCancels]) {
        cancel()
      }
      this.execState.pendingCancels.clear()
      await new Promise((r) => setTimeout(r, 0))
      this.execState.deadline = 0
    }

    this.vm.dispose()
  }
}
