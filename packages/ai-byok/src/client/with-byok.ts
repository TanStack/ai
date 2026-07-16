import { isByokMissingBody } from '../shared/byok-missing'
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

/** Context a {@link byokFetcher} handler receives alongside the request input. */
export interface ByokFetcherContext {
  /**
   * Per-provider BYOK headers read fresh for this request. Spread onto a
   * `fetch` call's `headers`, or pass as a TanStack Start server function's
   * call-site `headers` option — either way the key travels in the header,
   * never the body.
   */
  headers: Record<string, string>
  /**
   * A `fetch` that also detects the relay's `byokMissing` 401 and invokes
   * `onMissingKey` (identical to the global `fetch` when `onMissingKey` is
   * unset). Only relevant to fetch-based fetchers; a server-function fetcher
   * uses `headers` and surfaces a missing key as a thrown error instead.
   */
  fetch: typeof fetch
  /** The abort signal the transport forwards from `stop()`, when provided. */
  signal?: AbortSignal
}

function buildByokFetch(options: WithByokOptions): typeof fetch {
  return options.onMissingKey
    ? byokFetch(options.onMissingKey, options.fetchClient)
    : (options.fetchClient ?? fetch)
}

/** Shared header + fetch wiring for {@link withByok} and {@link byokFetcher}. */
export function buildByokRequestContext(
  getKeys: () => Keyring,
  options: WithByokOptions = {},
  signal?: AbortSignal,
): ByokFetcherContext {
  return {
    headers: { ...options.headers, ...byokHeaders(getKeys()) },
    fetch: buildByokFetch(options),
    signal,
  }
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
    const { headers, fetch: fetchClient } = buildByokRequestContext(
      getKeys,
      options,
    )
    return {
      headers,
      ...(options.onMissingKey || options.fetchClient
        ? { fetchClient }
        : {}),
    }
  }
}

/**
 * The `useChat`/`useGeneration` **fetcher** counterpart to {@link withByok}
 * (which targets the `connection` transport). Wraps a fetcher body so it
 * receives BYOK `headers` and a missing-key-aware `fetch`, read fresh on every
 * call. Works for both fetcher styles:
 *
 * ```ts
 * // fetch-based: spread headers, use the wrapped fetch for onMissingKey
 * fetcher: byokFetcher(() => keysRef.current, (input, { headers, fetch, signal }) =>
 *   fetch('/api/generate/audio', {
 *     method: 'POST',
 *     headers: { 'content-type': 'application/json', ...headers },
 *     body: JSON.stringify(input),
 *     signal,
 *   }),
 *   { onMissingKey: (provider) => openKeyDialog(provider) },
 * )
 *
 * // TanStack Start server function: forward headers at the call site
 * fetcher: byokFetcher(() => keysRef.current, (input, { headers }) =>
 *   generateAudioFn({ data: input, headers }),
 * )
 * // server handler: getByokKey(getRequest(), 'elevenlabs')
 * ```
 */
export function byokFetcher<TInput, TReturn>(
  getKeys: () => Keyring,
  handler: (input: TInput, context: ByokFetcherContext) => TReturn,
  options: WithByokOptions = {},
): (input: TInput, transport?: { signal?: AbortSignal }) => TReturn {
  return (input, transport) =>
    handler(
      input,
      buildByokRequestContext(getKeys, options, transport?.signal),
    )
}