/**
 * Recursively strip `null` values from a JSON-shaped value so optional fields
 * present as `null` in OpenAI-compatible structured output round-trip cleanly
 * through Zod schemas that expect `undefined` (or absence) instead of `null`.
 *
 * Behaviour:
 * - Top-level `null` becomes `undefined`.
 * - Object properties whose value is `null` are removed entirely (so
 *   `'key' in result` is `false`). Zod's `.optional()` treats absent keys
 *   the same as `undefined`, which is the round-trip we want; setting the
 *   key to `undefined` would still register the property in `Object.keys`
 *   and break some `.strict()`/`Object.keys`-based callers.
 * - Array elements recurse via this same function; a `null` element therefore
 *   becomes `undefined` (top-level rule), preserving array length so
 *   positional indices stay stable. Don't rely on element-`null` round-trip.
 *
 * Scope: designed for `JSON.parse` output (plain objects, arrays, strings,
 * numbers, booleans, null). Class instances, `Date`, `Map`, `Set`, etc. are
 * NOT preserved — they're walked via `Object.entries`, which sees only own
 * enumerable string-keyed properties. Native built-ins like `Date`/`Map`/`Set`
 * therefore become `{}`; arbitrary class instances become a plain-object
 * snapshot of just their own enumerable string properties. Don't pass
 * non-JSON values.
 */
export function transformNullsToUndefined<T>(obj: T): T {
  if (obj === null) {
    return undefined as unknown as T
  }

  if (typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformNullsToUndefined(item)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value === null) {
      continue
    }
    result[key] = transformNullsToUndefined(value)
  }
  return result as T
}
