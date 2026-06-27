import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import type { NullWideningMap } from '@tanstack/ai-utils'
import type { JSONSchema, SchemaInput } from '../../../types'

/**
 * Build a JSONSchema object from any plain key/value source. The `JSONSchema`
 * interface's `[key: string]: any` index signature makes every property
 * assignable through bracket access without a type cast — copying keys here
 * lets us narrow either `Record<string, unknown>` (returned by
 * `~standard.jsonSchema.input()`) or a `JSONSchema` (from the SchemaInput
 * pass-through arm) into the typed view used by the rest of this module.
 *
 * Accepts `object` so callers don't need a cast when narrowing from union
 * types like `SchemaInput`.
 */
function toJsonSchema(obj: object): JSONSchema {
  const result: JSONSchema = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$schema') continue // not needed by LLM providers
    result[key] = value
  }
  return result
}

/**
 * Whether a value can carry a `~standard` property. Most schema libraries
 * (Zod, Valibot) return plain objects, but ArkType's `type()` returns a
 * *callable function* with `~standard` attached — so `typeof` must accept
 * both `'object'` and `'function'` or ArkType schemas are missed entirely
 * (issue #276).
 */
function isPropertyCarrier(schema: unknown): schema is Record<string, unknown> {
  return (
    (typeof schema === 'object' || typeof schema === 'function') &&
    schema !== null
  )
}

/**
 * Check if a value is a Standard JSON Schema compliant schema.
 * Standard JSON Schema compliant libraries (Zod v4+, ArkType, Valibot with toStandardJsonSchema, etc.)
 * implement the '~standard' property with jsonSchema converter methods.
 */
export function isStandardJSONSchema(
  schema: unknown,
): schema is StandardJSONSchemaV1 {
  if (!isPropertyCarrier(schema) || !('~standard' in schema)) return false

  const standard = schema['~standard']
  if (
    typeof standard !== 'object' ||
    standard === null ||
    !('version' in standard) ||
    standard.version !== 1 ||
    !('jsonSchema' in standard) ||
    typeof standard.jsonSchema !== 'object' ||
    standard.jsonSchema === null ||
    !('input' in standard.jsonSchema)
  ) {
    return false
  }

  return typeof standard.jsonSchema.input === 'function'
}

/**
 * Check if a value is a Standard Schema compliant schema (for validation).
 * Standard Schema compliant libraries implement the '~standard' property with a validate function.
 */
export function isStandardSchema(schema: unknown): schema is StandardSchemaV1 {
  return (
    isPropertyCarrier(schema) &&
    '~standard' in schema &&
    typeof schema['~standard'] === 'object' &&
    schema['~standard'] !== null &&
    'version' in schema['~standard'] &&
    schema['~standard'].version === 1 &&
    'validate' in schema['~standard'] &&
    typeof schema['~standard'].validate === 'function'
  )
}

/**
 * Result of {@link makeStructuredOutputCompatible}: the strict-ready schema plus
 * a {@link NullWideningMap} recording every position where a `null` was
 * synthesized, so the response can be un-widened before validation without
 * re-deriving (or guessing) which nulls were synthetic.
 */
interface StructuredOutputConversion {
  schema: JSONSchema
  nullWidening: NullWideningMap | undefined
}

/** Drop an empty map to `undefined` so leaf/no-op subtrees don't litter it. */
function pruneMap(map: NullWideningMap): NullWideningMap | undefined {
  return Object.keys(map).length > 0 ? map : undefined
}

/**
 * Transform a JSON schema to be compatible with OpenAI's structured output requirements.
 * OpenAI requires:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
 *
 * Alongside the transformed schema it returns a {@link NullWideningMap} marking
 * exactly the positions where `null` was added, so `undoNullWidening` can strip
 * those synthesized nulls (and only those) from the provider's response.
 *
 * @param schema - JSON schema to transform
 * @param originalRequired - Original required array (to know which fields were optional)
 * @returns Transformed schema + the null-widening map for the round trip
 */
function makeStructuredOutputCompatible(
  schema: JSONSchema,
  originalRequired: Array<string> = [],
): StructuredOutputConversion {
  const result: JSONSchema = { ...schema }
  const map: NullWideningMap = {}

  // Handle object types
  if (result.type === 'object' && result.properties) {
    const properties: Record<string, JSONSchema> = { ...result.properties }
    const allPropertyNames = Object.keys(properties)
    const propertyMaps: Record<string, NullWideningMap> = {}

    // Transform each property
    for (const propName of allPropertyNames) {
      const prop = properties[propName]
      if (!prop) continue
      const wasOptional = !originalRequired.includes(propName)
      // `null` synthesized AT this property (the field itself can come back null).
      let widenedHere = false
      // Map describing widened positions INSIDE this property.
      let childMap: NullWideningMap | undefined

      // Recursively transform nested objects/arrays
      if (prop.type === 'object' && prop.properties) {
        const nested = makeStructuredOutputCompatible(prop, prop.required || [])
        properties[propName] = wasOptional
          ? { ...nested.schema, type: ['object', 'null'] }
          : nested.schema
        widenedHere = wasOptional
        childMap = nested.nullWidening
      } else if (prop.type === 'array' && prop.items) {
        const items = Array.isArray(prop.items) ? prop.items[0] : prop.items
        const nestedItems = items && typeof items === 'object'
          ? makeStructuredOutputCompatible(items, items.required || [])
          : undefined
        properties[propName] = {
          ...prop,
          items: nestedItems ? nestedItems.schema : prop.items,
          ...(wasOptional ? { type: ['array', 'null'] } : {}),
        }
        widenedHere = wasOptional
        childMap = nestedItems?.nullWidening
          ? { items: nestedItems.nullWidening }
          : undefined
      } else if (wasOptional) {
        // Make optional fields nullable by adding null to the type. Mark
        // `widenedHere` only where we actually add `null`; a field already
        // typed nullable (`.nullish()`) is left as-is and keeps its null.
        if (prop.type && !Array.isArray(prop.type)) {
          properties[propName] = { ...prop, type: [prop.type, 'null'] }
          widenedHere = true
        } else if (Array.isArray(prop.type) && !prop.type.includes('null')) {
          properties[propName] = { ...prop, type: [...prop.type, 'null'] }
          widenedHere = true
        }
      }

      if (widenedHere || childMap) {
        propertyMaps[propName] = {
          ...(childMap ?? {}),
          ...(widenedHere ? { widened: true } : {}),
        }
      }
    }

    result.properties = properties
    // ALL properties must be required for OpenAI structured output
    result.required = allPropertyNames
    // additionalProperties must be false
    result.additionalProperties = false
    if (Object.keys(propertyMaps).length > 0) map.properties = propertyMaps
  }

  // Handle array types with object items
  if (result.type === 'array' && result.items) {
    const items = Array.isArray(result.items) ? result.items[0] : result.items
    if (items && typeof items === 'object') {
      const nestedItems = makeStructuredOutputCompatible(
        items,
        items.required || [],
      )
      result.items = nestedItems.schema
      if (nestedItems.nullWidening) map.items = nestedItems.nullWidening
    }
  }

  return { schema: result, nullWidening: pruneMap(map) }
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
 * Normalize any supported schema input to a typed, UN-widened `JSONSchema` —
 * the shared first half of conversion, before any structured-output widening.
 *
 * - Standard JSON Schemas are rebuilt structurally (dropping `$schema`, which
 *   LLM providers ignore) and given the explicit `type`/`properties`/`required`
 *   defaults object shapes need downstream.
 * - Plain `JSONSchema` inputs are rebuilt into the typed view; non-object inputs
 *   are surfaced untouched (they can't be widened).
 * - Standard Schema validators lacking a `~standard.jsonSchema` converter throw
 *   with actionable guidance, rather than shipping `{ '~standard': … }` to the
 *   provider and producing an opaque downstream error.
 */
function toTypedJsonSchema(schema: SchemaInput): JSONSchema | undefined {
  if (isStandardJSONSchema(schema)) {
    const jsonSchema = schema['~standard'].jsonSchema.input({
      target: 'draft-07',
    })
    const result: JSONSchema = toJsonSchema(jsonSchema)
    if ('properties' in result && !result.type) result.type = 'object'
    if (result.type === 'object' && !('properties' in result)) {
      result.properties = {}
    }
    if (result.type === 'object' && !('required' in result)) {
      result.required = []
    }
    return result
  }

  if (isStandardSchema(schema)) {
    throw new Error(
      'Schema is a Standard Schema validator but does not expose a JSON Schema ' +
        'converter on `~standard.jsonSchema`. Use Zod v4.2+, ArkType v2.1.28+, ' +
        'or wrap a Valibot schema with `toStandardJsonSchema()` from ' +
        '`@valibot/to-json-schema` before passing it as `outputSchema`.',
    )
  }

  if (typeof schema !== 'object') return schema
  return toJsonSchema(schema)
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

  // Plain-JSONSchema passthrough: with no widening requested, return the schema
  // by reference so callers comparing via `===` keep identity. Only the widening
  // path needs the rebuilt, normalized view from `toTypedJsonSchema`.
  if (
    !forStructuredOutput &&
    !isStandardJSONSchema(schema) &&
    !isStandardSchema(schema)
  ) {
    return schema
  }

  const base = toTypedJsonSchema(schema)
  // Non-object inputs can't be widened; surface them untouched.
  if (!base || typeof base !== 'object') return base
  if (!forStructuredOutput) return base
  return makeStructuredOutputCompatible(base, base.required || []).schema
}

/**
 * Convert a schema for structured output AND capture the {@link NullWideningMap}
 * recording every `null` the strict-mode widening synthesized. The map lets the
 * caller undo that widening on the provider's response (via `undoNullWidening`)
 * before validating against the original schema — optional fields read back as
 * absent while genuine `.nullable()` nulls survive. The map is `undefined` when
 * the schema isn't a widenable object or when no field needed widening.
 */
export function convertSchemaForStructuredOutput(
  schema: SchemaInput | undefined,
): {
  jsonSchema: JSONSchema | undefined
  nullWideningMap: NullWideningMap | undefined
} {
  if (!schema) return { jsonSchema: undefined, nullWideningMap: undefined }
  const base = toTypedJsonSchema(schema)
  if (!base || typeof base !== 'object') {
    return { jsonSchema: base, nullWideningMap: undefined }
  }
  const { schema: jsonSchema, nullWidening } = makeStructuredOutputCompatible(
    base,
    base.required || [],
  )
  return { jsonSchema, nullWideningMap: nullWidening }
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
  | {
      success: false
      issues: Array<{ message: string; path?: Array<string> | undefined }>
    }
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
 * Error thrown when Standard Schema validation fails. Carries the original
 * `issues` array so consumers (middleware `onError`, callers catching from
 * `chat({ outputSchema })`) can programmatically inspect each failure.
 */
export class StandardSchemaValidationError extends Error {
  override readonly name = 'StandardSchemaValidationError'
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>) {
    super(
      `Validation failed: ${issues
        .map((i) => i.message || 'Validation failed')
        .join(', ')}`,
    )
    this.issues = issues
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
 * @throws StandardSchemaValidationError if validation fails; Error if the
 *         schema only supports async validation.
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

  throw new StandardSchemaValidationError(result.issues)
}
