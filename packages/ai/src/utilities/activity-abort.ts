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
): AbortSignal | undefined {
  if (!a) return b
  if (!b) return a
  if (a.aborted) return a
  if (b.aborted) return b
  const controller = new AbortController()
  const onAbort = (source: AbortSignal) => () => {
    controller.abort(source.reason)
  }
  a.addEventListener('abort', onAbort(a), { once: true })
  b.addEventListener('abort', onAbort(b), { once: true })
  return controller.signal
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
    const isBadTimeout =
      !Number.isFinite(options.timeout) || options.timeout < 0
    if (isBadTimeout) {
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

  /** Effective signal, or `undefined` when neither timeout nor caller signal. */
  const signal = combineAbortSignals(options.abortSignal, timeoutSignal)

  return {
    signal,
    clear: () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
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
