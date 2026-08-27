export function extractRequestOptions(
  request: Request | RequestInit | undefined,
): { headers?: HeadersInit; signal?: AbortSignal | null } {
  if (!request) return {}
  return {
    ...(request.headers !== undefined && { headers: request.headers }),
    ...(request.signal != null && { signal: request.signal }),
  }
}
