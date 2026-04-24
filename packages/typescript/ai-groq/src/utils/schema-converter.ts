import { makeStructuredOutputCompatible } from '@tanstack/openai-base'
import { transformNullsToUndefined } from '@tanstack/ai-utils'

export { transformNullsToUndefined }

/**
 * Recursively removes `required: []` from a schema object.
 * Groq rejects `required` when it is an empty array, even though
 * OpenAI-compatible schemas allow it.
 */
function removeEmptyRequired(schema: Record<string, any>): Record<string, any> {
  const result = { ...schema }

  if (Array.isArray(result.required) && result.required.length === 0) {
    delete result.required
  }

  if (result.properties && typeof result.properties === 'object') {
    const properties: Record<string, any> = {}
    for (const [key, value] of Object.entries(
      result.properties as Record<string, any>,
    )) {
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

/**
 * Transform a JSON schema to be compatible with Groq's structured output requirements.
 *
 * Groq requires:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
 * - `required` must be omitted (not empty array) when there are no properties
 *
 * Delegates to the shared OpenAI-compatible transformer and applies the
 * Groq-specific quirk of removing empty `required` arrays.
 *
 * @param schema - JSON schema to transform
 * @param originalRequired - Original required array (to know which fields were optional)
 * @returns Transformed schema compatible with Groq structured output
 */
export function makeGroqStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): Record<string, any> {
  // Ensure object schemas always have properties (e.g. z.object({}) may produce
  // { type: 'object' } without properties). openai-base's transformer skips
  // objects without properties, so we normalise first.
  const normalised =
    schema.type === 'object' && !schema.properties
      ? { ...schema, properties: {} }
      : schema

  const result = makeStructuredOutputCompatible(normalised, originalRequired)

  // Groq rejects `required` when it is an empty array
  return removeEmptyRequired(result)
}
