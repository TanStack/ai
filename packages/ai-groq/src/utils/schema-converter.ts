import { makeStructuredOutputCompatibleWithMap } from '@tanstack/openai-base'

function removeEmptyRequired(schema: Record<string, any>): Record<string, any> {
  const result = { ...schema }

  if (Array.isArray(result.required) && result.required.length === 0) {
    delete result.required
  }

  if (result.properties && typeof result.properties === 'object') {
    const properties: Record<string, any> = {}
    const propertyEntries = Object.entries(
      result.properties as Record<string, any>,
    )
    for (const [key, value] of propertyEntries) {
      properties[key] =
        typeof value === 'object' && value !== null && !Array.isArray(value)
          ? removeEmptyRequired(value)
          : value
    }
    result.properties = properties
  }

  if (
    result.items &&
    typeof result.items === 'object' &&
    !Array.isArray(result.items)
  ) {
    result.items = removeEmptyRequired(result.items)
  }

  // Recurse into combinator arrays (anyOf, oneOf, allOf)
  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(result[keyword])) {
      result[keyword] = result[keyword].map((entry: Record<string, any>) =>
        removeEmptyRequired(entry),
      )
    }
  }

  // Recurse into additionalProperties if it's a schema object
  if (
    result.additionalProperties &&
    typeof result.additionalProperties === 'object' &&
    !Array.isArray(result.additionalProperties)
  ) {
    result.additionalProperties = removeEmptyRequired(
      result.additionalProperties,
    )
  }

  return result
}

function normalizeObjectSchemas(
  schema: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> =
    schema.type === 'object' && !schema.properties
      ? { ...schema, properties: {} }
      : { ...schema }

  if (result.properties && typeof result.properties === 'object') {
    result.properties = Object.fromEntries(
      Object.entries(result.properties as Record<string, any>).map(
        ([key, value]) => [
          key,
          typeof value === 'object' && value !== null && !Array.isArray(value)
            ? normalizeObjectSchemas(value)
            : value,
        ],
      ),
    )
  }

  if (
    result.items &&
    typeof result.items === 'object' &&
    !Array.isArray(result.items)
  ) {
    result.items = normalizeObjectSchemas(result.items)
  }

  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branch = result[keyword]
    if (Array.isArray(branch)) {
      result[keyword] = branch.map((entry) =>
        typeof entry === 'object' && entry !== null
          ? normalizeObjectSchemas(entry as Record<string, any>)
          : entry,
      )
    }
  }

  if (
    result.additionalProperties &&
    typeof result.additionalProperties === 'object' &&
    !Array.isArray(result.additionalProperties)
  ) {
    result.additionalProperties = normalizeObjectSchemas(
      result.additionalProperties as Record<string, any>,
    )
  }

  return result
}

export function makeGroqStructuredOutputCompatibleWithMap(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
) {
  // Recursively patch every `{ type: 'object' }` node so the ai-openai-base
  // transformer descends into nested empty objects too.
  const normalised = normalizeObjectSchemas(schema)
  const { schema: converted, nullWideningMap } =
    makeStructuredOutputCompatibleWithMap(normalised, originalRequired)

  // Groq rejects `required` when it is an empty array
  return {
    schema: removeEmptyRequired(converted),
    nullWideningMap,
  }
}

export function makeGroqStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): Record<string, any> {
  return makeGroqStructuredOutputCompatibleWithMap(schema, originalRequired)
    .schema
}
