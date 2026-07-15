import { wrapCode } from '@tanstack/ai-code-mode'
import { isFatalQuickJSLimitError, normalizeError } from './error-normalizer'
import type { QuickJSContext } from 'quickjs-emscripten'
import type { ExecutionResult, IsolateContext } from '@tanstack/ai-code-mode'

/**
 * Preserves the driver's existing execution ordering across contexts.
 */
let globalExecQueue: Promise<void> = Promise.resolve()

/**
 * IsolateContext implementation using QuickJS WASM
 */
export class QuickJSIsolateContext implements IsolateContext {
  private readonly vm: QuickJSContext
  private readonly logs: Array<string>
  private readonly timeout: number
  private disposed = false
  private executing = false

  constructor(vm: QuickJSContext, logs: Array<string>, timeout: number) {
    this.vm = vm
    this.logs = logs
    this.timeout = timeout
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
          this.vm.runtime.executePendingJobs()
          const resolvedResult = await nativePromise

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
          this.vm.runtime.setInterruptHandler(() => false)
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

    // If an execution is in flight, wait for the global queue to drain so
    // pending host callbacks cannot access a disposed context.
    if (this.executing) {
      await globalExecQueue
    }

    this.disposed = true
    this.vm.dispose()
  }
}
