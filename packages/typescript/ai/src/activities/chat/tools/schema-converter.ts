/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import type { JSONSchema, SchemaInput } from '../../../types'

/**
 * Check if a value is a Standard JSON Schema compliant schema.
 * Standard JSON Schema compliant libraries (Zod v4+, ArkType, Valibot with toStandardJsonSchema, etc.)
 * implement the '~standard' property with jsonSchema converter methods.
 */
export function isStandardJSONSchema(
  schema: unknown,
): schema is StandardJSONSchemaV1 {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '~standard' in schema &&
    typeof (schema as StandardJSONSchemaV1)['~standard'] === 'object' &&
    (schema as StandardJSONSchemaV1)['~standard'].version === 1 &&
    typeof (schema as StandardJSONSchemaV1)['~standard'].jsonSchema ===
      'object' &&
    typeof (schema as StandardJSONSchemaV1)['~standard'].jsonSchema.input ===
      'function'
  )
}

/**
 * Check if a value is a Standard Schema compliant schema (for validation).
 * Standard Schema compliant libraries implement the '~standard' property with a validate function.
 */
export function isStandardSchema(schema: unknown): schema is StandardSchemaV1 {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '~standard' in schema &&
    typeof schema['~standard'] === 'object' &&
    schema !== null &&
    schema['~standard'] !== null &&
    'version' in schema['~standard'] &&
    schema['~standard'].version === 1 &&
    'validate' in schema['~standard'] &&
    typeof schema['~standard'].validate === 'function'
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
 * Converts a Standard JSON Schema compliant schema or plain JSONSchema to JSON Schema format
 * compatible with LLM providers.
 *
 * Supports any schema library that implements the Standard JSON Schema spec (v1):
 * - Zod v4+ (natively supports StandardJSONSchemaV1)
 * - ArkType (natively supports StandardJSONSchemaV1)
 * - Valibot (via `toStandardJsonSchema()` from `@valibot/to-json-schema`)
 *
 * If the input is already a plain JSONSchema object, it is returned as-is.
 *
 * @param schema - Standard JSON Schema compliant schema or plain JSONSchema object to convert
 * @param options - Conversion options
 * @returns JSON Schema object that can be sent to LLM providers
 *
 * @example
 * ```typescript
 * // Using Zod v4+ (natively supports Standard JSON Schema)
 * import * as z from 'zod';
 *
 * const zodSchema = z.object({
 *   location: z.string().describe('City name'),
 *   unit: z.enum(['celsius', 'fahrenheit']).optional()
 * });
 *
 * const jsonSchema = convertSchemaToJsonSchema(zodSchema);
 *
 * @example
 * // Using ArkType (natively supports Standard JSON Schema)
 * import { type } from 'arktype';
 *
 * const arkSchema = type({
 *   location: 'string',
 *   unit: "'celsius' | 'fahrenheit'"
 * });
 *
 * const jsonSchema = convertSchemaToJsonSchema(arkSchema);
 *
 * @example
 * // Using Valibot (via toStandardJsonSchema)
 * import * as v from 'valibot';
 * import { toStandardJsonSchema } from '@valibot/to-json-schema';
 *
 * const valibotSchema = toStandardJsonSchema(v.object({
 *   location: v.string(),
 *   unit: v.optional(v.picklist(['celsius', 'fahrenheit']))
 * }));
 *
 * const jsonSchema = convertSchemaToJsonSchema(valibotSchema);
 *
 * @example
 * // Using JSONSchema directly (passes through unchanged)
 * const rawSchema = {
 *   type: 'object',
 *   properties: { location: { type: 'string' } },
 *   required: ['location']
 * };
 * const result = convertSchemaToJsonSchema(rawSchema);
 * ```
 */
export function convertSchemaToJsonSchema(
  schema: SchemaInput | undefined,
  options: ConvertSchemaOptions = {},
): JSONSchema | undefined {
  if (!schema) return undefined

  const { forStructuredOutput = false } = options

  // If it's a Standard JSON Schema compliant schema, use the standard interface
  if (isStandardJSONSchema(schema)) {
    const jsonSchema = schema['~standard'].jsonSchema.input({
      target: 'draft-07',
    })

    let result = jsonSchema

    if (typeof result === 'object' && '$schema' in result) {
      // Remove $schema property as it's not needed for LLM providers
      const { $schema, ...rest } = result
      result = rest
    }

    // Ensure object schemas always have type: "object"

    if (typeof result === 'object') {
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
        result = makeStructuredOutputCompatible(
          result,
          (result.required as Array<string>) || [],
        )
      }
    }

    return result as JSONSchema
  }

  // If it's not a Standard JSON Schema, assume it's already a JSONSchema and pass through
  // Still apply structured output transformation if requested

  if (forStructuredOutput && typeof schema === 'object') {
    return makeStructuredOutputCompatible(
      schema as Record<string, any>,
      ((schema as JSONSchema).required as Array<string>) || [],
    ) as JSONSchema
  }

  return schema as JSONSchema
}

/**
 * Validates data against a Standard Schema compliant schema.
 *
 * @param schema - Standard Schema compliant schema
 * @param data - Data to validate
 * @returns Validation result with success status, data or issues
 */
export async function validateWithStandardSchema<T>(
  schema: unknown,
  data: unknown,
): Promise<
  | { success: true; data: T }
  | { success: false; issues: Array<{ message: string; path?: Array<string> }> }
> {
  if (!isStandardSchema(schema)) {
    // If it's not a Standard Schema, just return the data as-is
    return { success: true, data: data as T }
  }

  const result = await schema['~standard'].validate(data)

  if (!result.issues) {
    return { success: true, data: result.value as T }
  }

  return {
    success: false,
    issues: result.issues.map((issue) => ({
      message: issue.message || 'Validation failed',
      path: issue.path?.map(String),
    })),
  }
}

/**
 * Synchronously validates data against a Standard Schema compliant schema.
 * Note: Some Standard Schema implementations may only support async validation.
 * In those cases, this function will throw.
 *
 * @param schema - Standard Schema compliant schema
 * @param data - Data to validate
 * @returns Parsed/validated data
 * @throws Error if validation fails or if the schema only supports async validation
 */
export function parseWithStandardSchema<T>(schema: unknown, data: unknown): T {
  if (!isStandardSchema(schema)) {
    // If it's not a Standard Schema, just return the data as-is
    return data as T
  }

  const result = schema['~standard'].validate(data)

  // Handle async result (Promise)
  if (result instanceof Promise) {
    throw new Error(
      'Schema validation returned a Promise. Use validateWithStandardSchema for async validation.',
    )
  }
  // Standard Schema validation returns { value } for success or { issues } for failure
  if (!result.issues) {
    return result.value as T
  }

  // invalid validation, throw error with all issues
  const errorMessages = result.issues
    .map((issue) => issue.message || 'Validation failed')
    .join(', ')
  throw new Error(`Validation failed: ${errorMessages}`)
}
