import { SecureMcpError } from './types'

/**
 * A guarded fetch. It reaches only an origin on the allowlist. It is a helper a
 * tool opts into, not an enforced boundary: a tool that calls global `fetch`
 * directly bypasses it. For enforced confinement, run the server behind a
 * separate execution or network boundary.
 */
export type EgressFetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Builds a deny-by-default egress function.
 *
 * It refuses any origin not in `allow` with `egress_denied`. It follows no
 * redirect (`redirect: 'error'`) and stops after `timeoutMs`. A network error
 * or timeout becomes `backend_unavailable`. The HTTP status passes through, so
 * the tool decides what a 404 or 500 means.
 *
 * @param options.allow - The allowed origins, for example `https://api.hue.local`
 * @param options.timeoutMs - The per-request timeout, 10000 ms by default
 * @param options.onDenied - Runs when an origin is refused, for audit and notify
 * @param options.fetch - The fetch to use, the global `fetch` by default
 */
export function createEgress(options: {
  allow: ReadonlyArray<string>
  timeoutMs?: number
  onDenied?: (origin: string) => void
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
}): EgressFetch {
  const allowed = new Set<string>()
  for (const entry of options.allow) {
    try {
      allowed.add(new URL(entry).origin)
    } catch {
      throw new SecureMcpError(
        'invalid_input',
        `Egress allowlist entry is not a URL: ${entry}`,
      )
    }
  }
  const timeoutMs = options.timeoutMs ?? 10_000
  const fetchImpl = options.fetch ?? fetch

  return async (url, init) => {
    let origin: string
    try {
      origin = new URL(url).origin
    } catch {
      throw new SecureMcpError('invalid_input', `Not a URL: ${url}`)
    }
    if (!allowed.has(origin)) {
      options.onDenied?.(origin)
      throw new SecureMcpError(
        'egress_denied',
        `Egress to ${origin} is not on the allowlist.`,
      )
    }
    const controller = new AbortController()
    // The deadline stays armed until the caller's combined signal settles, so it
    // still aborts a slow body stream: `fetch` resolves on headers, not on body
    // completion. The timer fires at most once and is cleared on cancellation.
    // `unref` keeps the deadline live for an unfinished body but does not hold
    // the event loop open on its own, so a completed request can let the process
    // exit without waiting out the remaining `timeoutMs`.
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref?.()
    // Combine the caller's signal with the timeout so caller cancellation still
    // aborts the request and an already-aborted caller signal is honored,
    // instead of replacing `init.signal` with a fresh active one.
    const signal = combineSignals(init?.signal ?? undefined, controller.signal)
    // Clear the timer once the operation can no longer time out: either the
    // deadline fired, or the caller aborted, or the caller finished reading and
    // dropped its reference (GC'd timer). Attach cleanup to the combined signal.
    if (signal.aborted) {
      clearTimeout(timer)
      throw new SecureMcpError(
        'backend_unavailable',
        `Egress to ${origin} failed: ${signal.reason instanceof Error ? signal.reason.message : 'aborted'}`,
      )
    }
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
    const fail = (error: unknown): SecureMcpError => {
      clearTimeout(timer)
      const detail = error instanceof Error ? error.message : 'request failed'
      return new SecureMcpError(
        'backend_unavailable',
        `Egress to ${origin} failed: ${detail}`,
      )
    }
    let response: Response
    try {
      response = await fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal,
      })
    } catch (error) {
      throw fail(error)
    }
    // `fetch` resolves on headers, so a body that stalls past the deadline
    // aborts during the body read, which happens after this function returns.
    // Wrap the body reads so that failure keeps the documented
    // `backend_unavailable` taxonomy instead of surfacing a raw abort error.
    return wrapBody(response, fail)
  }
}

/**
 * Wraps the body-consuming methods of a `Response` so a transport failure
 * during the body read (for example a stalled body that the deadline aborts)
 * is translated the same way as a failure of the fetch promise. Streaming,
 * status, and headers pass through unchanged.
 */
function wrapBody(
  response: Response,
  fail: (error: unknown) => SecureMcpError,
): Response {
  return new Proxy(response, {
    get(target, prop, receiver) {
      if (
        prop === 'text' ||
        prop === 'json' ||
        prop === 'arrayBuffer' ||
        prop === 'blob' ||
        prop === 'formData' ||
        prop === 'bytes'
      ) {
        const method = Reflect.get(target, prop, target) as unknown
        if (typeof method !== 'function') {
          return Reflect.get(target, prop, receiver)
        }
        const fn = method as (...a: Array<unknown>) => Promise<unknown>
        return (...args: Array<unknown>) =>
          fn.apply(target, args).catch((error: unknown) => {
            throw fail(error)
          })
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Combines abort signals; aborts the result when any input aborts. */
function combineSignals(
  a: AbortSignal | undefined,
  b: AbortSignal,
): AbortSignal {
  if (a === undefined) return b
  // `AbortSignal.any` is the fast path, but `engines.node` allows 18.16 where
  // it does not exist yet (added in 18.17). The lib types assume it is always
  // present, so guard with a runtime check and fall back to a manual combiner
  // so a caller signal on an older runtime does not throw before fetch runs.
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b])
  const controller = new AbortController()
  const abort = (reason: unknown) => controller.abort(reason)
  for (const s of [a, b]) {
    if (s.aborted) {
      abort(s.reason)
      break
    }
    s.addEventListener('abort', () => abort(s.reason), { once: true })
  }
  return controller.signal
}
