import { SecureMcpError } from './types'

/**
 * A guarded fetch. It reaches only an origin on the allowlist. There is no
 * generic fetch: this is the single way a tool touches the network.
 */
export type EgressFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

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
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'request failed'
      throw new SecureMcpError(
        'backend_unavailable',
        `Egress to ${origin} failed: ${detail}`,
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
