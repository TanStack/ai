import { isByokMissingBody } from '../server/byok-missing'
import { byokHeaders } from './keyring'
import type { Keyring } from './keyring'
import type { ProviderId } from '../shared/providers'

/**
 * Wraps a `fetch` so a `byokMissing` 401 from the relay invokes `onMissingKey`
 * with the provider that needs a key. The response is passed through unchanged —
 * the connection still surfaces the error — so this only adds the side-channel
 * callback the SSE error can't carry (it exposes only the status, not the body).
 */
export function byokFetch(
  onMissingKey: (provider: ProviderId) => void,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init)
    if (response.status === 401) {
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => null)
      if (isByokMissingBody(body)) onMissingKey(body.error.provider)
    }
    return response
  }
}

export interface WithByokOptions {
  /** Invoked when the relay reports a missing key (a `byokMissing` 401). */
  onMissingKey?: (provider: ProviderId) => void
  /** Extra request headers; BYOK headers are merged on top. */
  headers?: Record<string, string>
  /** Underlying fetch (defaults to global `fetch`). */
  fetchClient?: typeof fetch
}

/** The connection options `withByok` produces (a subset of a fetch adapter's). */
export interface ByokConnectionOptions {
  headers: Record<string, string>
  fetchClient?: typeof fetch
}

/**
 * Build BYOK connection options for a fetch-based connection adapter: attaches
 * `byokHeaders(keys)` on every request and, when `onMissingKey` is set, detects
 * the relay's `byokMissing` 401 so the UI can prompt for (or unlock) the key.
 *
 * Pass the result straight to the adapter. `getKeys` is read on every request,
 * so back it with a ref/getter to stay current:
 *
 * ```ts
 * useChat({
 *   connection: fetchServerSentEvents(
 *     '/api/chat',
 *     withByok(() => keysRef.current, {
 *       onMissingKey: (provider) => openKeyDialog(provider),
 *     }),
 *   ),
 * })
 * ```
 */
export function withByok(
  getKeys: () => Keyring,
  options: WithByokOptions = {},
): () => ByokConnectionOptions {
  return () => {
    const fetchClient = options.onMissingKey
      ? byokFetch(options.onMissingKey, options.fetchClient)
      : options.fetchClient
    return {
      headers: { ...options.headers, ...byokHeaders(getKeys()) },
      ...(fetchClient ? { fetchClient } : {}),
    }
  }
}
