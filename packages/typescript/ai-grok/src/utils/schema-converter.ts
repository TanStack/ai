/**
 * Recursively transform null values to undefined in an object.
 *
 * This is needed because Grok's structured output (via OpenAI-compatible API) requires all fields to be
 * in the `required` array, with optional fields made nullable (type: ["string", "null"]).
 * When Grok returns null for optional fields, we need to convert them back to
 * undefined to match the original Zod schema expectations.
 *
 * @param obj - Object to transform
 * @returns Object with nulls converted to undefined
 */
export function transformNullsToUndefined<T>(obj: T): T {
  if (obj === null) {
    return undefined as unknown as T
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformNullsToUndefined(item)) as unknown as T
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const transformed = transformNullsToUndefined(value)
      // Only include the key if the value is not undefined
      // This makes { notes: null } become {} (field absent) instead of { notes: undefined }
      if (transformed !== undefined) {
        result[key] = transformed
      }
    }
    return result as T
  }

  return obj
}

/**
 * Transform a JSON schema to be compatible with Grok's structured output requirements (OpenAI-compatible).
 * Grok requires:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
 *
 * @param schema - JSON schema to transform
 * @param originalRequired - Original required array (to know which fields were optional)
 * @returns Transformed schema compatible with Grok structured output
 */
export function makeGrokStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): Record<string, any> {
  const result = { ...schema }

  // Handle object types
  if (result.type === 'object' && result.properties) {
    const properties = { ...result.properties }
    const allPropertyNames = Object.keys(properties)

    // Transform each property
    for (const propName of allPropertyNames) {
      const prop = properties[propName]
      const wasOptional = !originalRequired.includes(propName)

      // Recursively transform nested objects/arrays
      if (prop.type === 'object' && prop.properties) {
        properties[propName] = makeGrokStructuredOutputCompatible(
          prop,
          prop.required || [],
        )
      } else if (prop.type === 'array' && prop.items) {
        properties[propName] = {
          ...prop,
          items: makeGrokStructuredOutputCompatible(
            prop.items,
            prop.items.required || [],
          ),
        }
      } else if (wasOptional) {
        // Make optional fields nullable by adding null to the type
        if (prop.type && !Array.isArray(prop.type)) {
          properties[propName] = {
            ...prop,
            type: [prop.type, 'null'],
          }
        } else if (Array.isArray(prop.type) && !prop.type.includes('null')) {
          properties[propName] = {
            ...prop,
            type: [...prop.type, 'null'],
          }
        }
      }
    }

    result.properties = properties
    // ALL properties must be required for Grok structured output
    result.required = allPropertyNames
    // additionalProperties must be false
    result.additionalProperties = false
  }

  // Handle array types with object items
  if (result.type === 'array' && result.items) {
    result.items = makeGrokStructuredOutputCompatible(
      result.items,
      result.items.required || [],
    )
  }

  return result
}
