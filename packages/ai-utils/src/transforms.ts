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
 *
 * Schema-blind: strips EVERY null, including ones a `.nullable()` field
 * legitimately allows. When the original schema is available, prefer
 * {@link undoNullWidening}, which only strips the nulls strict-mode widening
 * synthesized.
 */
export function transformNullsToUndefined<T>(obj: T): T {
  if (obj === null) {
    return undefined as T
  }

  if (typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformNullsToUndefined(item)) as T
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

/**
 * Records exactly where strict-mode null-widening synthesized a `null`, so
 * {@link undoNullWidening} can strip those nulls and leave every other one
 * untouched. Built by the widening pass itself as it walks the schema (see
 * `convertSchemaForStructuredOutput` in `@tanstack/ai`), so it can never drift
 * from what was actually widened — no value-shape guessing required.
 *
 * - `widened`: the widening pass added `null` to THIS position's type (an
 *   optional field promoted to `required` + nullable). A `null` here is
 *   synthetic → strip it. Positions a `.nullable()`/`.nullish()` field already
 *   allowed carry no `widened` mark, so their nulls survive.
 * - `properties` / `items`: descend into a nested object / array to reach
 *   widened positions deeper in the tree. Only objects and arrays the widener
 *   actually recursed into appear here.
 */
export type NullWideningMap = {
  widened?: boolean
  properties?: Record<string, NullWideningMap>
  items?: NullWideningMap | Array<NullWideningMap>
}

function walk(value: unknown, map: NullWideningMap | undefined): unknown {
  if (value === null) {
    // Strip only nulls the widening pass synthesized (marked `widened`); keep
    // every genuine `.nullable()`/`.nullish()` null and every null the map
    // doesn't describe.
    return map?.widened ? undefined : null
  }
  if (typeof value !== 'object' || !map) return value

  if (Array.isArray(value)) {
    const { items } = map
    if (!items) return value
    // Tuple maps (`items: [a, b, …]`) describe each position separately;
    // a single `items` map applies to every element.
    return Array.isArray(items)
      ? value.map((item, index) => walk(item, items[index]))
      : value.map((item) => walk(item, items))
  }

  const { properties } = map
  if (!properties) return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = walk(child, properties[key])
    // A synthesized null collapsed to undefined → omit the key so the field
    // reads as absent (`key in result === false`), matching how `.optional()`
    // treats absence.
    if (next === undefined) continue
    result[key] = next
  }
  return result
}

/**
 * Inverse of strict-mode null-widening for structured output.
 *
 * To satisfy OpenAI-style strict schemas, optional fields are widened to
 * `required` with `null` added to their type, so the provider returns `null`
 * for an absent optional. Validating that `null` against the ORIGINAL schema
 * fails, because `.optional()` means `T | undefined`, not `T | null`.
 *
 * Unlike {@link transformNullsToUndefined}, this consults a {@link
 * NullWideningMap} recorded by the widening pass and drops ONLY the nulls that
 * pass actually synthesized. Nulls a `.nullable()`/`.nullish()` field genuinely
 * allows are preserved, so both `optional` and `nullable` fields round-trip
 * correctly. With no map, the value is returned untouched.
 */
export function undoNullWidening<T>(value: T, map?: NullWideningMap): T {
  if (!map) return value
  return walk(value, map) as T
}
