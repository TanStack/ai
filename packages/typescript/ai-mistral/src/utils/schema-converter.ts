/**
 * Recursively transform null values to undefined in an object.
 *
 * This is needed because Mistral's structured output may require optional
 * fields to be declared nullable. When Mistral returns null for optional
 * fields, we convert them back to undefined to match the original Zod schema.
 */
export function transformNullsToUndefined<T>(obj: T): T {
  if (obj === null) {
    return undefined as unknown as T
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformNullsToUndefined(item)) as unknown as T
  }

  if (typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const transformed = transformNullsToUndefined(value)
      if (transformed !== undefined) {
        result[key] = transformed
      }
    }
    return result as T
  }

  return obj
}

/**
 * Transform a JSON schema to be compatible with Mistral's structured output
 * requirements when `strict: true` is used.
 *
 * Mistral (in strict mode) requires:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
 */
export function makeMistralStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): Record<string, any> {
  const result = { ...schema }

  if (result.type === 'object') {
    if (!result.properties) {
      result.properties = {}
    }
    const properties = { ...result.properties }
    const allPropertyNames = Object.keys(properties)

    for (const propName of allPropertyNames) {
      const prop = properties[propName]
      const wasOptional = !originalRequired.includes(propName)

      if (prop.type === 'object' && prop.properties) {
        const converted = makeMistralStructuredOutputCompatible(
          prop,
          prop.required || [],
        )
        if (wasOptional) {
          properties[propName] = {
            ...converted,
            type: Array.isArray(converted.type)
              ? converted.type.includes('null')
                ? converted.type
                : [...converted.type, 'null']
              : [converted.type, 'null'],
          }
        } else {
          properties[propName] = converted
        }
      } else if (prop.type === 'array' && prop.items) {
        const converted = {
          ...prop,
          items: makeMistralStructuredOutputCompatible(
            prop.items,
            prop.items.required || [],
          ),
        }
        if (wasOptional) {
          properties[propName] = {
            ...converted,
            type: Array.isArray(converted.type)
              ? converted.type.includes('null')
                ? converted.type
                : [...converted.type, 'null']
              : [converted.type, 'null'],
          }
        } else {
          properties[propName] = converted
        }
      } else if (wasOptional) {
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
    if (allPropertyNames.length > 0) {
      result.required = allPropertyNames
    } else {
      delete result.required
    }
    result.additionalProperties = false
  }

  if (result.type === 'array' && result.items) {
    result.items = makeMistralStructuredOutputCompatible(
      result.items,
      result.items.required || [],
    )
  }

  return result
}
