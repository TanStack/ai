import { toJSONSchema } from 'zod'
import type { z } from 'zod'
import type { SchemaInput } from '../../../types'

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
function makeStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): Record<string, any> {
  const result = { ...schema }

  // Handle object types
  if (result.type === 'object' && result.properties) {
    const properties = { ...result.properties }
    const allPropertyNames = Object.keys(properties)

    // Transform each property
    for (const propName of allPropertyNames) {
      const prop = properties[propName]
      const wasOptional = !originalRequired.includes(propName)

      // Recursively transform nested objects/arrays
      if (prop.type === 'object' && prop.properties) {
        properties[propName] = makeStructuredOutputCompatible(
          prop,
          prop.required || [],
        )
      } else if (prop.type === 'array' && prop.items) {
        properties[propName] = {
          ...prop,
          items: makeStructuredOutputCompatible(
            prop.items,
            prop.items.required || [],
          ),
        }
      } else if (wasOptional) {
        // Make optional fields nullable by adding null to the type
        if (prop.type && !Array.isArray(prop.type)) {
          properties[propName] = {
            ...prop,
            type: [prop.type, 'null'],
          }
        } else if (Array.isArray(prop.type) && !prop.type.includes('null')) {
          properties[propName] = {
            ...prop,
            type: [...prop.type, 'null'],
          }
        }
      }
    }

    result.properties = properties
    // ALL properties must be required for OpenAI structured output
    result.required = allPropertyNames
    // additionalProperties must be false
    result.additionalProperties = false
  }

  // Handle array types with object items
  if (result.type === 'array' && result.items) {
    result.items = makeStructuredOutputCompatible(
      result.items,
      result.items.required || [],
    )
  }

  return result
}

/**
 * Options for schema conversion
 */
export interface ConvertSchemaOptions {
  /**
   * When true, transforms the schema to be compatible with OpenAI's structured output requirements:
   * - All properties are added to the `required` array
   * - Optional fields get null added to their type union
   * - additionalProperties is set to false for all objects
   *
   * @default false
   */
  forStructuredOutput?: boolean
}

/**
 * Converts a schema (Zod or JSONSchema) to JSON Schema format compatible with LLM providers.
 * If the input is already a JSONSchema object, it is returned as-is.
 * If the input is a Zod schema, it is converted to JSON Schema.
 *
 * @param schema - Zod schema or JSONSchema object to convert
 * @param options - Conversion options
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
 * // For OpenAI structured output (all fields required, optional fields nullable)
 * const structuredSchema = convertZodToJsonSchema(zodSchema, { forStructuredOutput: true });
 * // Returns:
 * // {
 * //   type: 'object',
 * //   properties: {
 * //     location: { type: 'string', description: 'City name' },
 * //     unit: { type: ['string', 'null'], enum: ['celsius', 'fahrenheit'] }
 * //   },
 * //   required: ['location', 'unit'],
 * //   additionalProperties: false
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
  options: ConvertSchemaOptions = {},
): Record<string, any> | undefined {
  if (!schema) return undefined

  const { forStructuredOutput = false } = options

  // If it's not a Zod schema, assume it's already a JSONSchema and pass through
  if (!isZodSchema(schema)) {
    // Still apply structured output transformation if requested
    if (forStructuredOutput && typeof schema === 'object') {
      return makeStructuredOutputCompatible(
        schema,
        (schema as any).required || [],
      )
    }
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

    // Apply structured output transformation if requested
    if (forStructuredOutput) {
      result = makeStructuredOutputCompatible(result, result.required || [])
    }
  }

  return result
}
