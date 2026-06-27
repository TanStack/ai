/**
 * Transform a JSON schema to be compatible with OpenAI-style structured output requirements.
 * The base requirements (which OpenRouter inherits because it routes to upstream OpenAI-compatible
 * structured-output backends) are:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
 *
 * @param schema - JSON schema to transform
 * @param originalRequired - Original required array (to know which fields were optional)
 * @returns Transformed schema compatible with strict structured output
 */
export function makeStructuredOutputCompatible(
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
        prop = makeStructuredOutputCompatible(prop, prop.required || [])
      } else if (prop.type === 'array' && prop.items) {
        let coercedItems = prop.items
        if (Array.isArray(prop.items)) {
          coercedItems = prop.items.map((item) =>
            typeof item === 'object' && item !== null
              ? makeStructuredOutputCompatible(item, item.required || [])
              : item,
          )
        } else if (typeof prop.items === 'object' && prop.items !== null) {
          coercedItems = makeStructuredOutputCompatible(
            prop.items,
            prop.items.required || [],
          )
        }
        prop = {
          ...prop,
          items: coercedItems,
        }
      } else if (prop.anyOf) {
        prop = makeStructuredOutputCompatible(prop, prop.required || [])
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
    if (Array.isArray(result.items)) {
      result.items = result.items.map((item) =>
        typeof item === 'object' && item !== null
          ? makeStructuredOutputCompatible(item, item.required || [])
          : item,
      )
    } else if (typeof result.items === 'object' && result.items !== null) {
      result.items = makeStructuredOutputCompatible(
        result.items,
        result.items.required || [],
      )
    }
  }

  if (result.anyOf && Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map((variant) =>
      makeStructuredOutputCompatible(variant, variant.required || []),
    )
  }

  if (result.oneOf) {
    throw new Error(
      'oneOf is not supported in OpenAI structured output schemas. Check the supported outputs here: https://platform.openai.com/docs/guides/structured-outputs#supported-types',
    )
  }

  return result
}
