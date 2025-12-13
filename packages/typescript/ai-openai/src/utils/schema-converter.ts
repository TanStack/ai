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
 * Recursively transform null values to undefined in an object.
 *
 * This is needed because OpenAI's structured output requires all fields to be
 * in the `required` array, with optional fields made nullable (type: ["string", "null"]).
 * When OpenAI returns null for optional fields, we need to convert them back to
 * undefined to match the original Zod schema expectations.
 *
 * @param obj - Object to transform
 * @returns Object with nulls converted to undefined
 */
export function transformNullsToUndefined<T>(obj: T): T {
  if (obj === null) {
    return undefined as unknown as T
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformNullsToUndefined(item)) as unknown as T
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const transformed = transformNullsToUndefined(value)
      // Only include the key if the value is not undefined
      // This makes { notes: null } become {} (field absent) instead of { notes: undefined }
      if (transformed !== undefined) {
        result[key] = transformed
      }
    }
    return result as T
  }

  return obj
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
function makeOpenAIStructuredOutputCompatible(
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
        properties[propName] = makeOpenAIStructuredOutputCompatible(
          prop,
          prop.required || [],
        )
      } else if (prop.type === 'array' && prop.items) {
        properties[propName] = {
          ...prop,
          items: makeOpenAIStructuredOutputCompatible(
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
    result.items = makeOpenAIStructuredOutputCompatible(
      result.items,
      result.items.required || [],
    )
  }

  return result
}

/**
 * Converts a Zod schema to JSON Schema format compatible with OpenAI's structured output.
 *
 * OpenAI's structured output has strict requirements:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for all objects
 *
 * @param schema - Zod schema to convert
 * @returns JSON Schema object compatible with OpenAI's structured output API
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
 * const jsonSchema = convertZodToOpenAISchema(zodSchema);
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
 * ```
 */
export function convertZodToOpenAISchema(
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

    // Apply OpenAI-specific transformations for structured output
    result = makeOpenAIStructuredOutputCompatible(result, result.required || [])
  }

  return result
}
