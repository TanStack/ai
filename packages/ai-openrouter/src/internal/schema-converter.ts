const ONE_OF_UNSUPPORTED =
  'oneOf is not supported in OpenAI structured output schemas. Check the supported outputs here: https://platform.openai.com/docs/guides/structured-outputs#supported-types'

function widenOptionalProperty(prop: Record<string, any>): Record<string, any> {
  if (prop.anyOf) {
    if (!prop.anyOf.some((v: any) => v.type === 'null')) {
      return { ...prop, anyOf: [...prop.anyOf, { type: 'null' }] }
    }
    return prop
  }
  if (prop.type && !Array.isArray(prop.type)) {
    return { ...prop, type: [prop.type, 'null'] }
  }
  if (Array.isArray(prop.type) && !prop.type.includes('null')) {
    return { ...prop, type: [...prop.type, 'null'] }
  }
  return prop
}

function rewriteObjectProperty(
  prop: Record<string, any>,
  required: Array<string>,
  propName: string,
): Record<string, any> {
  const wasOptional = !required.includes(propName)

  if (prop.type === 'object' && prop.properties) {
    prop = makeStructuredOutputCompatible(prop, prop.required || [])
  } else if (prop.type === 'array' && prop.items) {
    prop = {
      ...prop,
      items: makeStructuredOutputCompatible(
        prop.items,
        prop.items.required || [],
      ),
    }
  } else if (prop.anyOf) {
    prop = makeStructuredOutputCompatible(prop, prop.required || [])
  } else if (prop.oneOf) {
    throw new Error(ONE_OF_UNSUPPORTED)
  }

  if (wasOptional) {
    prop = widenOptionalProperty(prop)
  }

  return prop
}

function rewriteObjectProperties(
  result: Record<string, any>,
  required: Array<string>,
): void {
  const properties = { ...result.properties }
  const allPropertyNames = Object.keys(properties)

  for (const propName of allPropertyNames) {
    properties[propName] = rewriteObjectProperty(
      properties[propName],
      required,
      propName,
    )
  }

  result.properties = properties
  result.required = allPropertyNames
  result.additionalProperties = false
}

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
    rewriteObjectProperties(result, required)
  }

  if (result.type === 'array' && result.items) {
    result.items = makeStructuredOutputCompatible(
      result.items,
      result.items.required || [],
    )
  }

  if (result.anyOf && Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map((variant) =>
      makeStructuredOutputCompatible(variant, variant.required || []),
    )
  }

  if (result.oneOf) {
    throw new Error(ONE_OF_UNSUPPORTED)
  }

  return result
}
