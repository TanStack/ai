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
 * Minimal structural view of a JSON Schema node — just the keywords
 * {@link undoNullWidening} consults. Kept local so `@tanstack/ai-utils` stays
 * dependency-free; the richer `JSONSchema` from `@tanstack/ai` is structurally
 * assignable to it.
 */
export type JsonSchemaNode = {
  type?: string | Array<string>
  properties?: Record<string, JsonSchemaNode>
  items?: JsonSchemaNode | Array<JsonSchemaNode>
  anyOf?: Array<JsonSchemaNode>
  oneOf?: Array<JsonSchemaNode>
  [key: string]: unknown
}

/**
 * Whether the schema node permits `null` — directly via `type` or through an
 * `anyOf`/`oneOf` branch (how Valibot's `nullable`/`nullish` and Zod serialize).
 */
function allowsNull(schema: JsonSchemaNode): boolean {
  if (schema.type === 'null') return true
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true
  const variants = schema.anyOf ?? schema.oneOf
  return variants ? variants.some(allowsNull) : false
}

/**
 * For a composite (object/array) value under an `anyOf`/`oneOf` schema, pick the
 * non-null branch describing that value's real shape so recursion can follow it
 * (e.g. a `nullable(object({...}))` serializes as `anyOf: [object, null]`).
 *
 * Resolves only when EXACTLY ONE non-null branch matches the value's shape. If
 * several could (e.g. a union of object types), the branch is ambiguous, so we
 * keep the original schema and descend no further — better to leave a null in
 * place than risk stripping one a sibling branch genuinely allows.
 */
function resolveSchema(schema: JsonSchemaNode, value: unknown): JsonSchemaNode {
  const variants = schema.anyOf ?? schema.oneOf
  if (!variants) return schema
  const isArray = Array.isArray(value)
  const matches = variants.filter((variant) => {
    if (variant.type === 'null') return false
    return isArray
      ? variant.type === 'array' || variant.items !== undefined
      : variant.type === 'object' || variant.properties !== undefined
  })
  const [only] = matches
  return matches.length === 1 && only ? only : schema
}

function walk(value: unknown, schema: JsonSchemaNode | undefined): unknown {
  if (value === null) {
    // Strip only when the schema is present AND definitively disallows null —
    // i.e. the null was synthesized by strict-mode null-widening of an optional
    // field. Keep nulls a `.nullable()` field genuinely allows, and — being
    // conservative — nulls under shapes the schema doesn't describe.
    return schema && !allowsNull(schema) ? undefined : null
  }
  if (typeof value !== 'object') return value
  // Unknown shape (no schema, or `additionalProperties`): leave it untouched
  // rather than guess which nulls are synthetic.
  if (!schema) return value

  if (Array.isArray(value)) {
    const { items } = resolveSchema(schema, value)
    // Tuple schemas (`items: [a, b, …]`) describe each position separately;
    // a single `items` schema applies to every element.
    return Array.isArray(items)
      ? value.map((item, index) => walk(item, items[index]))
      : value.map((item) => walk(item, items))
  }

  const resolved = resolveSchema(schema, value)
  const props = resolved.properties
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = walk(child, props?.[key])
    // A synthesized null collapsed to undefined → omit the key so the field
    // reads as absent (`key in result === false`), matching how `.optional()`
    // treats absence.
    if (next === undefined) continue
    result[key] = next
  }
  return result
}

/**
 * Schema-aware inverse of strict-mode null-widening for structured output.
 *
 * To satisfy OpenAI-style strict schemas, optional fields are widened to
 * `required` with `null` added to their type, so the provider returns `null`
 * for an absent optional. Validating that `null` against the ORIGINAL schema
 * fails, because `.optional()` means `T | undefined`, not `T | null`.
 *
 * Unlike {@link transformNullsToUndefined}, this consults the original
 * (un-widened) JSON Schema and only drops nulls the schema does NOT permit —
 * the synthesized ones. Nulls a `.nullable()`/`.nullish()` field genuinely
 * allows are preserved, so both `optional` and `nullable` fields round-trip
 * correctly. With no schema, the value is returned untouched.
 */
export function undoNullWidening<T>(value: T, schema?: JsonSchemaNode): T {
  if (!schema) return value
  return walk(value, schema) as T
}
