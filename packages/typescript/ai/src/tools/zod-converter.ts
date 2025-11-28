import { zodToJsonSchema } from '@alcyone-labs/zod-to-json-schema'
import type { z } from 'zod'

/**
 * Converts a Zod schema to JSON Schema format compatible with LLM providers.
 *
 * Uses @alcyone-labs/zod-to-json-schema which is compatible with Zod v4.
 *
 * @param schema - Zod schema to convert
 * @returns JSON Schema object that can be sent to LLM providers
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   location: z.string().describe('City name'),
 *   unit: z.enum(['celsius', 'fahrenheit']).optional()
 * });
 *
 * const jsonSchema = convertZodToJsonSchema(schema);
 * // Returns:
 * // {
 * //   type: 'object',
 * //   properties: {
 * //     location: { type: 'string', description: 'City name' },
 * //     unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
 * //   },
 * //   required: ['location']
 * // }
 * ```
 */
export function convertZodToJsonSchema(schema: z.ZodType): Record<string, any> {
  // Use Alcyone Labs fork which is compatible with Zod v4
  const jsonSchema = zodToJsonSchema(schema as any, {
    target: 'openApi3',
    $refStrategy: 'none', // Inline all references for LLM compatibility
  })

  // Remove $schema property as it's not needed for LLM providers
  let result = jsonSchema as Record<string, any>
  if (typeof result === 'object' && '$schema' in result) {
    const { $schema, ...rest } = result
    result = rest
  }

  // Ensure object schemas always have type: "object"
  // This fixes cases where zod-to-json-schema doesn't set type for empty objects
  if (typeof result === 'object') {
    // Check if the input schema is a ZodObject by inspecting its internal structure
    const isZodObject =
      typeof schema === 'object' &&
      'def' in schema &&
      (schema as any).def?.type === 'object'

    // If type is explicitly "None", fix it
    if (result.type === 'None') {
      result.type = 'object'
    }

    // If we know it's a ZodObject but result doesn't have type, set it
    if (isZodObject && !result.type) {
      result.type = 'object'
    }

    // If result is completely empty (no keys), it's likely an empty object schema
    if (Object.keys(result).length === 0) {
      result.type = 'object'
    }

    // If it has properties (even empty), it should be an object type
    if ('properties' in result && !result.type) {
      result.type = 'object'
    }

    // Ensure properties exists for object types (even if empty)
    if (result.type === 'object' && !('properties' in result)) {
      result.properties = {}
    }

    // Ensure required exists for object types (even if empty array)
    if (result.type === 'object' && !('required' in result)) {
      result.required = []
    }
  }

  return result
}
