import { wrapCode } from '@tanstack/ai-code-mode'
import { isFatalQuickJSLimitError, normalizeError } from './error-normalizer'
import type {
  QuickJSContext,
  QuickJSHandle,
  VmCallResult,
} from 'quickjs-emscripten'
import type { ExecutionResult, IsolateContext } from '@tanstack/ai-code-mode'

/**
 * Preserves the driver's existing execution ordering across contexts.
 */
let globalExecQueue: Promise<void> = Promise.resolve()

function awaitWithDeadline(
  promise: Promise<VmCallResult<QuickJSHandle>>,
  pendingJobFailure: Promise<never>,
  deadline: number,
): Promise<VmCallResult<QuickJSHandle>> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(
      () => {
        settled = true
        const error = new Error('Code execution timed out')
        error.name = 'TimeoutError'
        reject(error)
      },
      Math.max(0, deadline - Date.now()),
    )

    promise.then(
      (result) => {
        if (settled) {
          try {
            if (result.error) result.error.dispose()
            else result.value.dispose()
          } catch {
            // The context may have been disposed after a timeout.
          }
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(result)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )

    void pendingJobFailure.catch((error: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
  })
}

/**
 * IsolateContext implementation using QuickJS WASM
 */
export class QuickJSIsolateContext implements IsolateContext {
  private readonly vm: QuickJSContext
  private readonly logs: Array<string>
  private readonly timeout: number
  private rejectPendingJobFailure?: (error: unknown) => void
  private pendingHostCalls = 0
  private disposeRequested = false
  private disposed = false
  private executing = false

  constructor(vm: QuickJSContext, logs: Array<string>, timeout: number) {
    this.vm = vm
    this.logs = logs
    this.timeout = timeout
  }

  runPendingJobs(): void {
    try {
      const result = this.vm.runtime.executePendingJobs()
      if (!result.error) {
        result.dispose()
        return
      }

      let error: unknown
      try {
        error = result.error.context.dump(result.error)
      } finally {
        result.dispose()
      }
      this.rejectPendingJobFailure?.(error)
    } catch (error) {
      this.rejectPendingJobFailure?.(error)
    }
  }

  beginHostCall(): () => void {
    this.pendingHostCalls += 1
    let completed = false

    return () => {
      if (completed) return
      completed = true
      this.pendingHostCalls -= 1
      if (this.disposeRequested && this.pendingHostCalls === 0) {
        this.vm.dispose()
      }
    }
  }

  private requestVmDispose(): void {
    if (this.disposeRequested) return
    this.disposeRequested = true
    this.disposed = true
    if (this.pendingHostCalls === 0) {
      this.vm.dispose()
    }
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

    // Preserve the driver's existing cross-context execution ordering.
    let resolve!: () => void
    const myTurn = new Promise<void>((r) => {
      resolve = r
    })
    const waitForPrev = globalExecQueue
    globalExecQueue = myTurn

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
    const pendingJobFailure = new Promise<never>((_, reject) => {
      this.rejectPendingJobFailure = reject
    })

    const releaseVmAfterTerminalError = () => {
      if (this.disposed) return
      try {
        this.vm.runtime.setInterruptHandler(() => false)
      } catch {
        // ignore if runtime is already torn down
      }
      this.requestVmDispose()
    }

    const fail = (error: unknown) => {
      const normalized = normalizeError(error)
      if (
        normalized.name === 'TimeoutError' ||
        isFatalQuickJSLimitError(normalized)
      ) {
        releaseVmAfterTerminalError()
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
      this.vm.runtime.setInterruptHandler(() => {
        return Date.now() > deadline
      })

      try {
        const result = this.vm.evalCode(wrappedCode)

        let parsedResult: T
        try {
          const promiseHandle = this.vm.unwrapResult(result)

          // wrapCode returns an async IIFE, so evalCode yields a QuickJS promise.
          const nativePromise = this.vm.resolvePromise(promiseHandle)
          promiseHandle.dispose()
          this.runPendingJobs()
          const resolvedResult = await awaitWithDeadline(
            nativePromise,
            pendingJobFailure,
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
        // fail() may dispose the VM after a timeout or fatal resource limit.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- disposed set in fail()
        if (!this.disposed) {
          this.vm.runtime.setInterruptHandler(() => false)
        }
      }
    } catch (error) {
      return fail(error)
    } finally {
      this.rejectPendingJobFailure = undefined
      this.executing = false
      resolve()
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return

    // If an execution is in flight, wait for the global queue to drain so
    // pending host callbacks cannot access a disposed context.
    if (this.executing) {
      await globalExecQueue
    }

    this.requestVmDispose()
  }
}
