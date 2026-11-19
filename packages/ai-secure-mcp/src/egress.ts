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
    const timer = setTimeout(() => controller.abort(), timeoutMs)
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
    try {
      return await fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal,
      })
    } catch (error) {
      clearTimeout(timer)
      const detail = error instanceof Error ? error.message : 'request failed'
      throw new SecureMcpError(
        'backend_unavailable',
        `Egress to ${origin} failed: ${detail}`,
      )
    }
  }
}

/** Combines abort signals; aborts the result when any input aborts. */
function combineSignals(
  a: AbortSignal | undefined,
  b: AbortSignal,
): AbortSignal {
  if (a === undefined) return b
  // `AbortSignal.any` is available on every runtime this package targets
  // (Node 18.17+, modern browsers). It aborts as soon as either input aborts
  // and carries the first abort reason.
  return AbortSignal.any([a, b])
}
