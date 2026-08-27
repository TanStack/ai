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

export interface ExecState {
  deadline: number
  pendingCancels: Set<() => void>
}

/** Grace window for cancellation continuations after a timeout. */
const CANCEL_GRACE_MS = 100

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

    let guestSettled = true

    const releaseVmAfterFatalError = async () => {
      if (this.disposed) return
      try {
        this.vm.runtime.setInterruptHandler(() => false)
      } catch {
        // ignore if runtime is already torn down
      }
      this.disposed = true

      for (const cancel of [...this.execState.pendingCancels]) {
        cancel()
      }
      this.execState.pendingCancels.clear()
      await new Promise((r) => setTimeout(r, 0))

      this.vm.dispose()
    }

    const releaseAfterUnsettledExecution = async () => {
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

    const fail = async (
      error: unknown,
      cleanup: 'reusable' | 'terminal' = 'reusable',
    ) => {
      const normalized = normalizeError(error)
      if (normalized.name === TIMEOUT_ERROR) {
        await releaseAfterUnsettledExecution()
      } else if (isFatalQuickJSLimitError(normalized)) {
        // Memory/stack limits leave the heap in an unknown state.
        await releaseVmAfterFatalError()
      } else if (cleanup === 'terminal') {
        await releaseAfterUnsettledExecution()
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
            return await fail(dumped, 'terminal')
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

    if (this.executing) {
      await this.execQueue
      // The execution may have disposed the VM, or intentionally retained an
      // unsettled VM, while dispose() was waiting for the queue.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- execution cleanup may set disposed while awaiting
      if (this.disposed) return
    }

    this.disposed = true

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
