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
