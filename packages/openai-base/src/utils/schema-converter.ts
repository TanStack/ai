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
function stripUnsupportedFormats(node: any): any {
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
          items: coerceStrictSchema(prop.items, prop.items.required || []),
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
    result.items = coerceStrictSchema(result.items, result.items.required || [])
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
