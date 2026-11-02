type HeaderValue = string | null | undefined

/**
 * Every header shape the OpenAI and Anthropic SDKs accept for
 * `defaultHeaders` and per-request `headers`. A `null` value means "remove
 * this header". An `undefined` value is ignored.
 *
 * The `{ values, nulls }` member matches the SDKs' internal `NullableHeaders`
 * object, so an SDK `HeadersLike` value is always assignable to this type.
 */
export type HeadersLike =
  | Headers
  | ReadonlyArray<ReadonlyArray<HeaderValue>>
  | Record<string, HeaderValue | ReadonlyArray<HeaderValue>>
  | { values: Headers; nulls: Set<string> }
  | null
  | undefined

function isNullableHeaders(
  headers: object,
): headers is { values: Headers; nulls: Set<string> } {
  return (
    'values' in headers &&
    headers.values instanceof Headers &&
    'nulls' in headers &&
    headers.nulls instanceof Set
  )
}

// Yields [name, value, fromArray] triples. An array value in the record form
// gives one triple per item, with fromArray true. An undefined value gives
// nothing. A null value gives [name, null, false].
function* headerEntries(
  headers: HeadersLike,
): Generator<[string, string | null, boolean]> {
  if (!headers) return
  if (headers instanceof Headers) {
    for (const [name, value] of headers) yield [name, value, false]
    return
  }
  if (Array.isArray(headers)) {
    for (const [name, value] of headers) {
      if (typeof name === 'string' && value !== undefined) {
        yield [name, value, false]
      }
    }
    return
  }
  if (isNullableHeaders(headers)) {
    for (const [name, value] of headers.values) yield [name, value, false]
    for (const name of headers.nulls) yield [name, null, false]
    return
  }
  for (const [name, value] of Object.entries(headers)) {
    const fromArray = Array.isArray(value)
    const values: ReadonlyArray<HeaderValue> = fromArray ? value : [value]
    for (const item of values) {
      if (item !== undefined) yield [name, item, fromArray]
    }
  }
}

/**
 * Turns any {@link HeadersLike} value into a plain record.
 *
 * Names keep the case the caller wrote (a `Headers` instance gives lowercase
 * names). A `null` value removes the name. A header that is given as an array
 * in the record form is dropped, because it does not map to one string.
 *
 * @example
 * toHeaderRecord({ 'X-Trace': 't1', 'X-Old': null }) // { 'X-Trace': 't1' }
 */
export function toHeaderRecord(headers: HeadersLike) {
  const record: Record<string, string> = {}
  for (const [name, value, fromArray] of headerEntries(headers)) {
    if (value === null || fromArray) delete record[name]
    else record[name] = value
  }
  return record
}

/**
 * Merges header sources into one `Headers`, with the same rules as the
 * Stainless SDKs:
 *
 * - A later source replaces a name from an earlier source (names are
 *   case-insensitive).
 * - Inside one source, repeated values for a name are appended.
 * - A `null` value deletes the name. An `undefined` value does nothing.
 *
 * @example
 * mergeHeaders({ 'x-api-key': 'k' }, { 'X-Api-Key': null }) // no x-api-key
 */
export function mergeHeaders(...sources: Array<HeadersLike>) {
  const merged = new Headers()
  for (const source of sources) {
    const seen = new Set<string>()
    for (const [name, value] of headerEntries(source)) {
      const key = name.toLowerCase()
      if (!seen.has(key)) {
        merged.delete(key)
        seen.add(key)
      }
      if (value !== null) merged.append(key, value)
    }
  }
  return merged
}
