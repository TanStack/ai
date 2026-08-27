import { transformNullsToUndefined } from '@tanstack/ai-utils'
import { makeStructuredOutputCompatible } from '@tanstack/openai-base'

export { transformNullsToUndefined }

export function makeOpenAIStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): Record<string, any> {
  return makeStructuredOutputCompatible(schema, originalRequired)
}
