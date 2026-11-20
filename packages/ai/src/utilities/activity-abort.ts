/**
 * Shared abort/timeout composition for media (and summarize) activities.
 *
 * Callers pass optional `timeout` and/or `abortSignal` on activity options.
 * Core composes them into one effective signal, races the adapter call so a
 * hung provider still rejects, clears timeout resources on settle, and
 * classifies aborts so lifecycle middleware gets `onAbort` rather than
 * `onError`.
 */

const ABORT_ERROR_NAMES = new Set([
  'AbortError',
  'TimeoutError',
  'APIUserAbortError',
  'RequestAbortedError',
])

export interface CombinedAbortSignal {
  signal: AbortSignal | undefined
  dispose: () => void
}

/**
 * Combine two optional AbortSignals into one that aborts when either does.
 * Returns the other signal directly when one is absent or already aborted.
 * First abort wins and preserves its reason.
 *
 * Manual implementation — `AbortSignal.any` requires Node >= 20.3.
 */
export function combineAbortSignals(
  a: AbortSignal | undefined,
  b: AbortSignal | undefined,
): CombinedAbortSignal {
  const noDispose = () => {}
  if (!a) return { signal: b, dispose: noDispose }
  if (!b) return { signal: a, dispose: noDispose }
  if (a.aborted) return { signal: a, dispose: noDispose }
  if (b.aborted) return { signal: b, dispose: noDispose }

  const controller = new AbortController()
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    a.removeEventListener('abort', onAbortA)
    b.removeEventListener('abort', onAbortB)
  }
  const abort = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason)
    dispose()
  }
  const onAbortA = () => abort(a)
  const onAbortB = () => abort(b)
  a.addEventListener('abort', onAbortA, { once: true })
  b.addEventListener('abort', onAbortB, { once: true })

  return { signal: controller.signal, dispose }
}

function createTimeoutReason(ms: number): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(`Activity timed out after ${ms}ms`, 'TimeoutError')
  }
  const err = new Error(`Activity timed out after ${ms}ms`)
  err.name = 'TimeoutError'
  return err
}

/** Normalize an abort reason into an Error the activity can reject with. */
export function toAbortError(reason: unknown): Error {
  if (reason instanceof Error) return reason
  if (typeof reason === 'string' && reason.length > 0) {
    const err = new Error(reason)
    err.name = 'AbortError'
    return err
  }
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

export interface ActivityAbortControls {
  /** Effective signal, or `undefined` when neither timeout nor caller signal. */
  signal: AbortSignal | undefined
  /** Clear the timeout timer if one was set. Idempotent. */
  clear: () => void
}

/**
 * Compose an activity-level timeout with a caller AbortSignal.
 *
 * - No SDK-wide default timeout; omit both for unlimited wait.
 * - First of caller cancellation or timeout wins and keeps its reason.
 * - Call `clear()` when the activity settles (success or failure) so timers
 *   do not leak.
 */
export function createActivityAbortControls(options: {
  abortSignal?: AbortSignal
  timeout?: number
}): ActivityAbortControls {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let timeoutSignal: AbortSignal | undefined

  if (options.timeout !== undefined) {
    if (!Number.isFinite(options.timeout) || options.timeout < 0) {
      throw new Error(
        `Invalid activity timeout: expected a non-negative finite number, got ${String(options.timeout)}`,
      )
    }
    const controller = new AbortController()
    timeoutSignal = controller.signal
    const ms = options.timeout
    timeoutId = setTimeout(() => {
      controller.abort(createTimeoutReason(ms))
    }, ms)
  }

  const combined = combineAbortSignals(options.abortSignal, timeoutSignal)

  return {
    signal: combined.signal,
    clear: () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
      combined.dispose()
    },
  }
}

/**
 * Reject when `signal` aborts, even if the underlying promise ignores it.
 * Ensures activity-level timeouts work for adapters that do not yet forward
 * the signal to the provider SDK.
 *
 * When the signal wins, the adapter promise is observed with an empty handler
 * so a later settle cannot surface as an unhandled rejection.
 */
export function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return promise

  const swallow = () => {
    // Observe the adapter promise without acting on its outcome so a late
    // reject after we already aborted cannot become an unhandled rejection.
    promise.then(
      () => undefined,
      () => undefined,
    )
  }

  if (signal.aborted) {
    swallow()
    return Promise.reject(toAbortError(signal.reason))
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      swallow()
      reject(toAbortError(signal.reason))
    }
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      },
    )
  })
}

/**
 * Whether a thrown value (and optional effective signal) should route to
 * middleware `onAbort` instead of `onError`.
 */
export function isActivityAbortError(
  error: unknown,
  signal?: AbortSignal,
): boolean {
  if (signal?.aborted) return true
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  return typeof name === 'string' && ABORT_ERROR_NAMES.has(name)
}

/** Best-effort string reason for {@link GenerationAbortInfo}. */
export function abortReasonMessage(
  error: unknown,
  signal?: AbortSignal,
): string | undefined {
  if (signal?.reason !== undefined) {
    if (typeof signal.reason === 'string') return signal.reason
    if (signal.reason instanceof Error) return signal.reason.message
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return undefined
}

/**
 * Wait `ms` milliseconds. Rejects with an abort error as soon as `signal`
 * aborts, so a polling loop stops at once.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
  if (signal.aborted) {
    return Promise.reject(toAbortError(signal.reason))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(toAbortError(signal.reason))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
