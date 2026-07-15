import { wrapCode } from '@tanstack/ai-code-mode'
import { isFatalQuickJSLimitError, normalizeError } from './error-normalizer'
import type {
  QuickJSContext,
  QuickJSHandle,
  VmCallResult,
} from 'quickjs-emscripten'
import type { ExecutionResult, IsolateContext } from '@tanstack/ai-code-mode'

/**
 * Interrupt deadline shared with the tool-binding job pumps created in
 * the driver. `deadline === 0` means no execution is active, so any guest
 * job that runs outside execute() is interrupted immediately.
 */
export interface ExecState {
  deadline: number
}

/**
 * Await the guest program's promise, but give up at `deadline`. Host tool
 * calls are bridged as QuickJS promises, so a guest program that is stuck
 * waiting (e.g. its continuation was interrupted) would otherwise never
 * settle. If the guest settles after the deadline, its result handle is
 * disposed to avoid leaking it into the context's lifetime.
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
        timeoutError.name = 'TimeoutError'
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

    const releaseVmAfterFatalLimit = () => {
      if (this.disposed) return
      try {
        this.vm.runtime.setInterruptHandler(() => false)
      } catch {
        // ignore if runtime is already torn down
      }
      this.disposed = true
      this.vm.dispose()
    }

    const fail = (error: unknown) => {
      const normalized = normalizeError(error)
      if (isFatalQuickJSLimitError(normalized)) {
        releaseVmAfterFatalLimit()
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
          this.vm.runtime.executePendingJobs()
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
          return fail(unwrapError)
        }
      } finally {
        // fail() may set disposed when releasing the VM after memory/stack limit errors
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- disposed set in fail()
        if (!this.disposed) {
          this.execState.deadline = 0
        }
      }
    } catch (error) {
      return fail(error)
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
    }

    this.disposed = true
    this.vm.dispose()
  }
}
