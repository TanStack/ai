/**
 * String `format` values accepted by OpenAI's strict Structured Outputs subset.
 * Any other format (e.g. "uri", "uri-reference", "regex") causes the API to
 * reject the whole request with `400 ... '<format>' is not a valid format`.
 * MCP servers and hand-written tools routinely declare such formats, so we strip
 * the unsupported ones before sending. See:
 * https://platform.openai.com/docs/guides/structured-outputs#supported-properties
 */
const SUPPORTED_STRING_FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
])

/**
 * Recursively drop JSON-Schema `format` keywords whose value isn't in OpenAI's
 * strict-mode allowlist. Pure — returns a fresh tree and never mutates `node`,
 * so the caller's original tool definition is left intact.
 *
 * A property *named* `format` always has a schema (object/boolean) value, never
 * a bare string, so it is preserved and recursed into; only the `format`
 * *keyword* (whose value is a string) is subject to removal.
 */
export function stripUnsupportedFormats(node: any): any {
  if (Array.isArray(node)) return node.map(stripUnsupportedFormats)
  if (node === null || typeof node !== 'object') return node

  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'format' &&
      typeof value === 'string' &&
      !SUPPORTED_STRING_FORMATS.has(value)
    ) {
      continue
    }
    out[key] = stripUnsupportedFormats(value)
  }
  return out
}

/**
 * Transform a JSON schema to be compatible with OpenAI's structured output requirements.
 * OpenAI requires:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
 * - String `format` keywords must be from a fixed allowlist (others are stripped)
 *
 * @param schema - JSON schema to transform
 * @param originalRequired - Original required array (to know which fields were optional)
 * @returns Transformed schema compatible with OpenAI structured output
 */
export function makeStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired?: Array<string>,
): Record<string, any> {
  return stripUnsupportedFormats(coerceStrictSchema(schema, originalRequired))
}

/**
 * JSON-Schema keywords outside OpenAI's strict Structured Outputs subset. A
 * schema using any of these can't be coerced into a strict-valid shape, and
 * sending it with `strict: true` makes the API reject the ENTIRE request
 * (e.g. `400 Invalid schema ... 'additionalProperties' is required to be ...`).
 * Tools with such schemas are emitted with `strict: false` instead (see the
 * tool converters) so they remain callable. MCP servers (e.g. Notion) routinely
 * emit these.
 *
 * - `oneOf` / `allOf` / `not` — combinator keywords strict mode rejects
 * - `$ref` / `$defs` / `definitions` — references and definition pools whose
 *   object subschemas escape the `additionalProperties: false` normalization
 *   strict mode requires
 */
const STRICT_UNSUPPORTED_KEYWORDS: ReadonlyArray<string> = [
  'oneOf',
  'allOf',
  'not',
  '$ref',
  '$defs',
  'definitions',
]

/**
 * Keys that give a schema node a resolvable type under OpenAI's strict subset.
 * A schema-position node carrying none of these is *typeless* (e.g. the empty
 * `{}` that `z.any()` / `z.unknown()` emit). Strict mode requires every schema
 * to declare a type, so a typeless node 400s the whole request — such tools
 * must be sent with `strict: false` instead. (`oneOf`/`allOf`/`$ref` count as
 * type indicators here even though they're independently strict-unsupported;
 * the keyword check below already rejects them.)
 */
const TYPE_INDICATOR_KEYWORDS: ReadonlyArray<string> = [
  'type',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'allOf',
  '$ref',
]

/**
 * Returns `false` when `schema` cannot be made strict-compatible and must be
 * sent with `strict: false`. Two ways that happens:
 *
 * 1. It uses a JSON-Schema keyword outside OpenAI's strict subset anywhere in
 *    the tree (`oneOf`/`allOf`/`not`/`$ref`/`$defs`).
 * 2. It contains a *typeless* schema node — a property/items/anyOf entry with
 *    no `type` (nor `enum`/`const`/combinator), e.g. the `{}` that `z.any()`
 *    produces. Strict mode rejects typeless schemas.
 *
 * Conservative by design: for (1) keywords are matched as object keys, so a
 * property literally named e.g. `oneOf` also trips it. That only costs that one
 * tool its strict mode, which is strictly safer than a false "compatible"
 * verdict that 400s the whole request.
 */
export function isStrictModeCompatible(schema: unknown): boolean {
  return (
    !containsStrictUnsupportedKeyword(schema) && !containsTypelessSchema(schema)
  )
}

function containsStrictUnsupportedKeyword(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(containsStrictUnsupportedKeyword)
  }
  if (node === null || typeof node !== 'object') return false
  for (const [key, value] of Object.entries(node)) {
    if (STRICT_UNSUPPORTED_KEYWORDS.includes(key)) return true
    if (containsStrictUnsupportedKeyword(value)) return true
  }
  return false
}

/** A schema-position node that declares no type and so 400s strict mode. */
function isTypelessSchema(node: unknown): boolean {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    // boolean schemas (`true`/`false`) and non-objects aren't typeless props.
    return false
  }
  return !TYPE_INDICATOR_KEYWORDS.some((key) => key in node)
}

/**
 * Walks the genuine schema positions (property values, `items`, `anyOf`
 * variants) and reports whether any is typeless. Unlike the keyword walk this
 * must respect structure: an empty `{}` is only a problem at a schema position,
 * not e.g. an empty `properties` map.
 */
function containsTypelessSchema(node: unknown): boolean {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return false
  }
  const schema = node as Record<string, any>

  const children: Array<unknown> = []
  if (schema.properties && typeof schema.properties === 'object') {
    children.push(...Object.values(schema.properties))
  }
  if (schema.items !== undefined) {
    children.push(
      ...(Array.isArray(schema.items) ? schema.items : [schema.items]),
    )
  }
  if (Array.isArray(schema.anyOf)) {
    children.push(...schema.anyOf)
  }

  return children.some(
    (child) => isTypelessSchema(child) || containsTypelessSchema(child),
  )
}

/**
 * Strict-mode structural rewrite (required widening, nullability,
 * additionalProperties). Kept private so the public entry point can apply the
 * format-stripping pass exactly once over the fully-rewritten tree.
 */
function coerceStrictSchema(
  schema: Record<string, any>,
  originalRequired?: Array<string>,
): Record<string, any> {
  const result = { ...schema }
  const required =
    originalRequired ??
    (Array.isArray(result['required']) ? result['required'] : [])

  if (result.type === 'object' && result.properties) {
    const properties = { ...result.properties }
    const allPropertyNames = Object.keys(properties)

    for (const propName of allPropertyNames) {
      let prop = properties[propName]
      const wasOptional = !required.includes(propName)

      // Step 1: Recurse into nested structures
      if (prop.type === 'object' && prop.properties) {
        prop = coerceStrictSchema(prop, prop.required || [])
      } else if (prop.type === 'array' && prop.items) {
        prop = {
          ...prop,
          items: typeof prop.items === 'object' && prop.items !== null
            ? coerceStrictSchema(prop.items, prop.items.required || [])
            : prop.items,
        }
      } else if (prop.anyOf) {
        prop = coerceStrictSchema(prop, prop.required || [])
      } else if (prop.oneOf) {
        throw new Error(
          'oneOf is not supported in OpenAI structured output schemas. Check the supported outputs here: https://platform.openai.com/docs/guides/structured-outputs#supported-types',
        )
      }

      // Step 2: Apply null-widening for optional properties (after recursion)
      if (wasOptional) {
        if (prop.anyOf) {
          // For anyOf, add a null variant if not already present
          if (!prop.anyOf.some((v: any) => v.type === 'null')) {
            prop = { ...prop, anyOf: [...prop.anyOf, { type: 'null' }] }
          }
        } else if (prop.type && !Array.isArray(prop.type)) {
          prop = { ...prop, type: [prop.type, 'null'] }
        } else if (Array.isArray(prop.type) && !prop.type.includes('null')) {
          prop = { ...prop, type: [...prop.type, 'null'] }
        }
      }

      properties[propName] = prop
    }

    result.properties = properties
    result.required = allPropertyNames
    result.additionalProperties = false
  }

  if (result.type === 'array' && result.items) {
    result.items = typeof result.items === 'object' && result.items !== null
      ? coerceStrictSchema(result.items, result.items.required || [])
      : result.items
  }

  if (result.anyOf && Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map((variant) =>
      coerceStrictSchema(variant, variant.required || []),
    )
  }

  if (result.oneOf) {
    throw new Error(
      'oneOf is not supported in OpenAI structured output schemas. Check the supported outputs here: https://platform.openai.com/docs/guides/structured-outputs#supported-types',
    )
  }

  return result
}
