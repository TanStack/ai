import { toJSONSchema } from 'zod'
import type { z } from 'zod'

/**
 * Check if a value is a Zod schema by looking for Zod-specific internals.
 * Zod schemas have a `_zod` property that contains metadata.
 */
function isZodSchema(schema: unknown): schema is z.ZodType {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '_zod' in schema &&
    typeof (schema as any)._zod === 'object'
  )
}

/**
 * Converts a Zod schema to JSON Schema format compatible with Gemini's API.
 *
 * Gemini accepts standard JSON Schema without special transformations.
 *
 * @param schema - Zod schema to convert
 * @returns JSON Schema object compatible with Gemini's structured output API
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const zodSchema = z.object({
 *   location: z.string().describe('City name'),
 *   unit: z.enum(['celsius', 'fahrenheit']).optional()
 * });
 *
 * const jsonSchema = convertZodToGeminiSchema(zodSchema);
 * // Returns standard JSON Schema
 * ```
 */
export function convertZodToGeminiSchema(
  schema: z.ZodType,
): Record<string, any> {
  if (!isZodSchema(schema)) {
    throw new Error('Expected a Zod schema')
  }

  // Use Zod's built-in toJSONSchema
  const jsonSchema = toJSONSchema(schema, {
    target: 'openapi-3.0',
    reused: 'ref',
  })

  // Remove $schema property as it's not needed for LLM providers
  let result = jsonSchema
  if (typeof result === 'object' && '$schema' in result) {
    const { $schema, ...rest } = result
    result = rest
  }

  // Ensure object schemas always have type: "object"
  if (typeof result === 'object') {
    const isZodObject =
      typeof schema === 'object' &&
      'def' in schema &&
      schema.def.type === 'object'

    if (isZodObject && !result.type) {
      result.type = 'object'
    }

    if (Object.keys(result).length === 0) {
      result.type = 'object'
    }

    if ('properties' in result && !result.type) {
      result.type = 'object'
    }

    if (result.type === 'object' && !('properties' in result)) {
      result.properties = {}
    }

    if (result.type === 'object' && !('required' in result)) {
      result.required = []
    }
  }

  return result
}
