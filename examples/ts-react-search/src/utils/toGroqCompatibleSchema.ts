// Groq structured output requires additionalProperties:false on every object, including
// those nested inside anyOf. The @tanstack/ai-groq adapter only recurses into direct
// object properties, not anyOf/oneOf/allOf, so we pre-process the JSON Schema here.
function toGroqCompatibleSchema(
  schema: Record<string, any>,
): Record<string, any> {
  if (typeof schema !== 'object' || Array.isArray(schema)) return schema
  const result = { ...schema }

  for (const combiner of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(result[combiner])) {
      result[combiner] = result[combiner].map((s: any) =>
        toGroqCompatibleSchema(s),
      )
    }
  }

  if (result.$defs) {
    result.$defs = Object.fromEntries(
      Object.entries(result.$defs).map(([k, v]) => [
        k,
        toGroqCompatibleSchema(v as any),
      ]),
    )
  }

  if (result.type === 'object') {
    const properties = Object.fromEntries(
      Object.entries(result.properties ?? {}).map(([k, v]) => [
        k,
        toGroqCompatibleSchema(v as any),
      ]),
    )
    result.properties = properties
    result.required = Object.keys(properties)
    result.additionalProperties = false
  }

  if (result.type === 'array' && result.items) {
    result.items = toGroqCompatibleSchema(result.items)
  }

  return result
}

export default toGroqCompatibleSchema
