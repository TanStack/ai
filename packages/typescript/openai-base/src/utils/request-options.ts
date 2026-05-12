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
  return { headers: request.headers, signal: request.signal ?? undefined }
}
