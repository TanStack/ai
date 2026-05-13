import { transformNullsToUndefined } from '@tanstack/ai-utils'
import { makeStructuredOutputCompatible } from '@tanstack/openai-compatible'

export { transformNullsToUndefined }

/**
 * Transform a JSON schema to be compatible with OpenAI's structured output requirements.
 * OpenAI requires:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
 *
 * @param schema - JSON schema to transform
 * @param originalRequired - Original required array (to know which fields were optional)
 * @returns Transformed schema compatible with OpenAI structured output
 */
export function makeOpenAIStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): Record<string, any> {
  return makeStructuredOutputCompatible(schema, originalRequired)
}
