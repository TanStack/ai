import { wrapCode } from '@tanstack/ai-code-mode'
import { isFatalQuickJSLimitError, normalizeError } from './error-normalizer'
import type { QuickJSAsyncContext } from 'quickjs-emscripten'
import type { ExecutionResult, IsolateContext } from '@tanstack/ai-code-mode'

/**
 * Serializes all QuickJS evalCodeAsync calls across contexts.
 * Required because newAsyncContext() reuses a singleton WASM module
 * whose asyncify stack can only handle one suspension at a time.
 */
let globalExecQueue: Promise<void> = Promise.resolve()

/** Sentinel resolved by the wall-clock deadline race. */
const TIMED_OUT = Symbol('quickjs-isolate-timeout')

/**
 * Grace window granted, after the wall-clock timer fires, for the in-VM
 * interrupt handler to settle a CPU-bound run before it is treated as a host
 * call still suspended in asyncify. A CPU-bound loop trips the interrupt at
 * (almost) the same instant the timer fires; the grace keeps that path on the
 * normal, reusable-context branch instead of orphaning the VM.
 */
const TIMEOUT_INTERRUPT_GRACE_MS = 10

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * IsolateContext implementation using QuickJS WASM
 */
export class QuickJSIsolateContext implements IsolateContext {
  private readonly vm: QuickJSAsyncContext
  private readonly logs: Array<string>
  private readonly timeout: number
  private disposed = false
  private executing = false
  private timedOut = false
  /**
   * A run that timed out while a host call was suspended in asyncify. The VM
   * cannot be disposed until this settles, so disposal and the global-queue
   * turn are handed off to a continuation on it. `null` when no run is orphaned.
   */
  private orphanedRun: Promise<void> | null = null

  constructor(vm: QuickJSAsyncContext, logs: Array<string>, timeout: number) {
    this.vm = vm
    this.logs = logs
    this.timeout = timeout
  }

  async execute<T = unknown>(code: string): Promise<ExecutionResult<T>> {
    if (this.disposed) {
      return this.disposedResult<T>()
    }

    // Serialize through the global queue to prevent concurrent
    // WASM asyncify suspensions across contexts.
    let releaseTurn!: () => void
    const myTurn = new Promise<void>((r) => {
      releaseTurn = r
    })
    const waitForPrev = globalExecQueue
    globalExecQueue = myTurn

    await waitForPrev

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() may be called concurrently while awaiting the queue
    if (this.disposed) {
      releaseTurn()
      return this.disposedResult<T>()
    }

    this.executing = true
    this.logs.length = 0

    // Set when a wall-clock timeout leaves a host call suspended in asyncify:
    // interrupt-handler reset, VM disposal, and the queue-turn release are then
    // owned by the orphaned-run continuation rather than the finally block.
    let deferredToOrphan = false

    const fail = (error: unknown): ExecutionResult<T> => {
      const normalized = normalizeError(error)
      if (isFatalQuickJSLimitError(normalized)) {
        this.disposeVm()
      }
      return {
        success: false,
        error: normalized,
        logs: [...this.logs],
      }
    }

    // Drives the wrapped code to completion and marshals its result. On a
    // deadline interrupt `evalCodeAsync` resolves with an error result, which
    // `unwrapResult` throws and `fail` normalizes.
    const runToSettled = async (): Promise<ExecutionResult<T>> => {
      const result = await this.vm.evalCodeAsync(wrapCode(code))

      try {
        const promiseHandle = this.vm.unwrapResult(result)

        // evalCodeAsync returns a Promise handle (our wrapper is an async IIFE).
        // Use resolvePromise + executePendingJobs to properly await the
        // QuickJS promise without re-entering the WASM asyncify state.
        const nativePromise = this.vm.resolvePromise(promiseHandle)
        promiseHandle.dispose()
        this.vm.runtime.executePendingJobs()
        const resolvedResult = await nativePromise

        const valueHandle = this.vm.unwrapResult(resolvedResult)
        const dumpedResult = this.vm.dump(valueHandle)
        valueHandle.dispose()

        let parsedResult: T
        if (typeof dumpedResult === 'string') {
          try {
            parsedResult = JSON.parse(dumpedResult) as T
          } catch {
            parsedResult = dumpedResult as T
          }
        } else {
          parsedResult = dumpedResult as T
        }

        // The wall-clock deadline may have fired while this run was suspended in
        // a host call; the caller already received the timeout result, so a late
        // success must not be surfaced as if the execution had finished in time.
        if (this.timedOut) {
          return this.timeoutResult<T>()
        }

        return {
          success: true,
          value: parsedResult,
          logs: [...this.logs],
        }
      } catch (unwrapError) {
        return fail(unwrapError)
      }
    }

    try {
      // The interrupt handler only fires while the VM is stepping bytecode, so
      // it cannot preempt a host binding whose Promise is awaited via asyncify.
      // Keep it for CPU-bound loops, but also race the run against a wall-clock
      // timer so `timeout` bounds the whole execution, host suspensions included.
      const deadline = Date.now() + this.timeout
      this.vm.runtime.setInterruptHandler(() => Date.now() > deadline)

      const run = runToSettled()

      let timeoutTimer: ReturnType<typeof setTimeout> | undefined
      const wallClock = new Promise<typeof TIMED_OUT>((resolve) => {
        timeoutTimer = setTimeout(() => resolve(TIMED_OUT), this.timeout)
      })

      const outcome = await Promise.race([run, wallClock])
      if (timeoutTimer !== undefined) {
        clearTimeout(timeoutTimer)
      }

      if (outcome !== TIMED_OUT) {
        return outcome
      }

      // The interrupt fires at (almost) the same instant for a CPU-bound loop;
      // give the in-VM interrupt a brief window to settle the run before
      // treating this as a host call still suspended in asyncify.
      const graced = await Promise.race([
        run,
        delay(TIMEOUT_INTERRUPT_GRACE_MS).then(
          (): typeof TIMED_OUT => TIMED_OUT,
        ),
      ])
      if (graced !== TIMED_OUT) {
        return graced
      }

      // Still suspended in a host call. The VM cannot be disposed now (freeing
      // it mid-asyncify corrupts the stack the suspended call resumes into) and
      // the host Promise cannot be cancelled. Leave the interrupt handler armed
      // so the VM aborts the instant the host Promise resolves and it resumes
      // stepping, then dispose the VM and release the queue turn once the
      // orphaned run unwinds. This keeps the single-asyncify-suspension
      // invariant that the global queue exists to protect.
      this.timedOut = true
      deferredToOrphan = true
      this.orphanedRun = run
        .catch(() => undefined)
        .then(() => {
          this.disposeVm()
          releaseTurn()
        })

      return this.timeoutResult<T>()
    } catch (error) {
      return fail(error)
    } finally {
      // On the orphan path the continuation owns interrupt-handler reset, VM
      // disposal, and the queue-turn release; the still-armed handler is what
      // lets the suspended run abort when it resumes.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- disposed may be set by fail() after a fatal limit error
      if (!deferredToOrphan && !this.disposed) {
        this.vm.runtime.setInterruptHandler(() => false)
      }
      this.executing = false
      if (!deferredToOrphan) {
        releaseTurn()
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return

    // A timed-out execution may have left a host call suspended in asyncify.
    // Its continuation disposes the VM once the call unwinds; wait for that
    // rather than freeing the VM out from under the suspended call.
    if (this.orphanedRun) {
      await this.orphanedRun
      return
    }

    // If an execution is in flight, wait for the global queue to drain
    // before disposing the VM. Otherwise the asyncified callback would
    // try to access a freed context.
    if (this.executing) {
      await globalExecQueue
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the orphaned continuation may have disposed while we awaited the queue
    if (this.disposed) return

    this.disposed = true
    this.vm.dispose()
  }

  /** Reset the interrupt handler and tear the VM down exactly once. */
  private disposeVm(): void {
    if (this.disposed) return
    try {
      this.vm.runtime.setInterruptHandler(() => false)
    } catch {
      // ignore if the runtime is already torn down
    }
    this.disposed = true
    this.vm.dispose()
  }

  private disposedResult<T>(): ExecutionResult<T> {
    return {
      success: false,
      error: {
        name: 'DisposedError',
        message: 'Context has been disposed',
      },
      logs: [],
    }
  }

  private timeoutResult<T>(): ExecutionResult<T> {
    return {
      success: false,
      error: {
        name: 'TimeoutError',
        message: `Code execution exceeded timeout of ${this.timeout}ms`,
      },
      logs: [...this.logs],
    }
  }
}
