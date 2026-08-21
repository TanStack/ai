function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Extract the payload record from an `api.otel-*` route's POST body,
 * unwrapping the `forwardedProps` / `data` envelopes the test harness may
 * nest it in. Throws on any non-object shape.
 */
export function recordFromBody(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new Error('Invalid request body')
  }

  const data = body.forwardedProps ?? body.data ?? body
  if (!isRecord(data)) {
    throw new Error('Invalid request body')
  }

  return data
}
