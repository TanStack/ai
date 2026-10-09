import type OpenAI from 'openai'
import type { ClientOptions } from 'openai'
import type { TextOptions } from '@tanstack/ai'

/** The fetch type of the OpenAI SDK. */
export type Fetch = NonNullable<ClientOptions['fetch']>

/**
 * Extract `headers` and `signal` from a `Request | RequestInit` for the OpenAI
 * SDK's per-call `RequestOptions`. `Request` exposes `headers` as a `Headers`
 * instance (HeadersInit-compatible) while `RequestInit` exposes `HeadersInit`
 * directly — this helper accepts either shape so callers don't need to cast.
 *
 * Always returns an object (possibly empty) rather than `undefined` so test
 * assertions that match the second argument shape via `expect.anything()` /
 * `expect.objectContaining()` keep working when no request override was set.
 */
export function extractRequestOptions(
  request: Request | RequestInit | undefined,
): { headers?: HeadersInit; signal?: AbortSignal | null } {
  if (!request) return {}
  // Conditional spread: under exactOptionalPropertyTypes the target's
  // `headers?: HeadersInit` and `signal?: AbortSignal | null` forbid an
  // explicit `undefined`. Omit the keys entirely when the source values
  // are absent so the OpenAI SDK sees `headers: undefined` as "not set"
  // rather than a present-but-undefined value.
  return {
    ...(request.headers !== undefined && { headers: request.headers }),
    ...(request.signal != null && { signal: request.signal }),
  }
}

/**
 * The client of one call. With `wrapFetch`, it is a copy of the client whose
 * fetch goes through the wrapper. Without it, it is the same client.
 * `baseFetch` is the fetch that the adapter gave the client.
 */
export function clientFor(
  client: OpenAI,
  options: Pick<TextOptions, 'wrapFetch'>,
  baseFetch: Fetch | undefined,
  withFetch = (fetch: Fetch) => client.withOptions({ fetch }),
): OpenAI {
  const { wrapFetch } = options
  if (!wrapFetch) return client
  // The SDK falls back to the global fetch the same way.
  return withFetch(wrapFetch(baseFetch ?? globalThis.fetch))
}
