/** Serialized byte length of a value (what the result-size cap measures). */
export function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? 'undefined', 'utf8')
}

export class ResultTooLargeError extends Error {
  constructor(bytes: number, max: number) {
    super(`Result too large: ${bytes} bytes (max ${max})`)
    this.name = 'ResultTooLargeError'
  }
}

/**
 * Shape a run's result to fit `maxBytes`. First truncates the author-declared
 * `truncatable` string paths (dotted) to a `…` marker; if still over, throws.
 * Returns the (possibly mutated copy of the) value.
 */
export function shapeResult(
  value: unknown,
  truncatable: ReadonlyArray<string>,
  maxBytes: number,
): unknown {
  if (byteLength(value) <= maxBytes) return value

  // Work on a structural clone so we never mutate the snippet's return value.
  let shaped: unknown = structuredClone(value)
  for (const path of truncatable) {
    if (byteLength(shaped) <= maxBytes) break
    shaped = truncateAtPath(shaped, path.split('.'))
  }

  const bytes = byteLength(shaped)
  if (bytes > maxBytes) throw new ResultTooLargeError(bytes, maxBytes)
  return shaped
}

function truncateAtPath(value: unknown, parts: ReadonlyArray<string>): unknown {
  const head = parts[0]
  if (head === undefined) {
    return typeof value === 'string' ? '…' : value
  }
  if (!value || typeof value !== 'object') return value
  const obj = value as Record<string, unknown>
  if (!(head in obj)) return value
  obj[head] = truncateAtPath(obj[head], parts.slice(1))
  return obj
}
