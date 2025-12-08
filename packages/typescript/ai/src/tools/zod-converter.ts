import { toJSONSchema } from 'zod'
import type { z } from 'zod'
import type { SchemaInput } from '../types'

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
 * Converts a schema (Zod or JSONSchema) to JSON Schema format compatible with LLM providers.
 * If the input is already a JSONSchema object, it is returned as-is.
 * If the input is a Zod schema, it is converted to JSON Schema.
 *
 * @param schema - Zod schema or JSONSchema object to convert
 * @returns JSON Schema object that can be sent to LLM providers
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * // Using Zod schema
 * const zodSchema = z.object({
 *   location: z.string().describe('City name'),
 *   unit: z.enum(['celsius', 'fahrenheit']).optional()
 * });
 *
 * const jsonSchema = convertZodToJsonSchema(zodSchema);
 * // Returns:
 * // {
 * //   type: 'object',
 * //   properties: {
 * //     location: { type: 'string', description: 'City name' },
 * //     unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
 * //   },
 * //   required: ['location']
 * // }
 *
 * // Using JSONSchema directly (passes through unchanged)
 * const rawSchema = {
 *   type: 'object',
 *   properties: { location: { type: 'string' } },
 *   required: ['location']
 * };
 * const result = convertZodToJsonSchema(rawSchema);
 * // Returns the same object
 * ```
 */
export function convertZodToJsonSchema(
  schema: SchemaInput | undefined,
): Record<string, any> | undefined {
  if (!schema) return undefined

  // If it's not a Zod schema, assume it's already a JSONSchema and pass through
  if (!isZodSchema(schema)) {
    return schema
  }

  // Use Alcyone Labs fork which is compatible with Zod v4
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
  // This fixes cases where zod-to-json-schema doesn't set type for empty objects
  if (typeof result === 'object') {
    // Check if the input schema is a ZodObject by inspecting its internal structure
    const isZodObject =
      typeof schema === 'object' &&
      'def' in schema &&
      schema.def.type === 'object'

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
