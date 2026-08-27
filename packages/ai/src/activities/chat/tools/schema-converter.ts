import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import type { NullWideningMap } from '@tanstack/ai-utils'
import type { JSONSchema, SchemaInput } from '../../../types'

function toJsonSchema(obj: object): JSONSchema {
  const result: JSONSchema = {}
  const entries = Object.entries(obj)
  for (const [key, value] of entries) {
    if (key === '$schema') continue // not needed by LLM providers
    result[key] = value
  }
  return result
}

function isPropertyCarrier(schema: unknown): schema is Record<string, unknown> {
  return (
    (typeof schema === 'object' || typeof schema === 'function') &&
    schema !== null
  )
}

export function isStandardJSONSchema(
  schema: unknown,
): schema is StandardJSONSchemaV1 {
  const shouldSkipIsPropertyCarrier =
    !isPropertyCarrier(schema) || !('~standard' in schema)
  if (shouldSkipIsPropertyCarrier) return false

  const standard = schema['~standard']
  const hasVersion =
    typeof standard !== 'object' ||
    standard === null ||
    !('version' in standard) ||
    standard.version !== 1 ||
    !('jsonSchema' in standard) ||
    typeof standard.jsonSchema !== 'object' ||
    standard.jsonSchema === null ||
    !('input' in standard.jsonSchema)
  if (hasVersion) {
    return false
  }

  return typeof standard.jsonSchema.input === 'function'
}

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

interface StructuredOutputConversion {
  schema: JSONSchema
  nullWidening: NullWideningMap | undefined
}

/** Drop an empty map to `undefined` so leaf/no-op subtrees don't litter it. */
function pruneMap(map: NullWideningMap): NullWideningMap | undefined {
  return Object.keys(map).length > 0 ? map : undefined
}

function widenOptionalScalar(prop: JSONSchema): JSONSchema | undefined {
  const isInvalidProp = prop.type && !Array.isArray(prop.type)
  if (isInvalidProp) {
    return { ...prop, type: [prop.type, 'null'] }
  }
  const isInvalidProp2 = Array.isArray(prop.type) && !prop.type.includes('null')
  if (isInvalidProp2) {
    return { ...prop, type: [...prop.type, 'null'] }
  }
  return undefined
}

function transformStructuredProperty(
  prop: JSONSchema,
  wasOptional: boolean,
): { schema: JSONSchema; widenedHere: boolean; childMap?: NullWideningMap } {
  const isObject = prop.type === 'object' && prop.properties
  if (isObject) {
    const nested = makeStructuredOutputCompatible(prop, prop.required || [])
    return {
      schema: wasOptional
        ? { ...nested.schema, type: ['object', 'null'] }
        : nested.schema,
      widenedHere: wasOptional,
      childMap: nested.nullWidening,
    }
  }
  const isArray = prop.type === 'array' && prop.items
  if (isArray) {
    const items = Array.isArray(prop.items) ? prop.items[0] : prop.items
    const nestedItems = items
      ? makeStructuredOutputCompatible(items, items.required || [])
      : undefined
    return {
      schema: {
        ...prop,
        items: nestedItems ? nestedItems.schema : prop.items,
        ...(wasOptional ? { type: ['array', 'null'] } : {}),
      },
      widenedHere: wasOptional,
      childMap: nestedItems?.nullWidening
        ? { items: nestedItems.nullWidening }
        : undefined,
    }
  }
  if (wasOptional) {
    const widened = widenOptionalScalar(prop)
    if (widened) return { schema: widened, widenedHere: true }
  }
  return { schema: prop, widenedHere: false }
}

function transformStructuredObject(
  result: JSONSchema,
  originalRequired: Array<string>,
  map: NullWideningMap,
): void {
  const isInvalidResult = result.type !== 'object' || !result.properties
  if (isInvalidResult) return
  const properties: Record<string, JSONSchema> = { ...result.properties }
  const allPropertyNames = Object.keys(properties)
  const propertyMaps: Record<string, NullWideningMap> = {}

  for (const propName of allPropertyNames) {
    const prop = properties[propName]
    if (!prop) continue
    const transformed = transformStructuredProperty(
      prop,
      !originalRequired.includes(propName),
    )
    properties[propName] = transformed.schema
    const hasTransformed = transformed.widenedHere || transformed.childMap
    if (hasTransformed) {
      propertyMaps[propName] = {
        ...(transformed.childMap ?? {}),
        ...(transformed.widenedHere ? { widened: true } : {}),
      }
    }
  }

  result.properties = properties
  result.required = allPropertyNames
  result.additionalProperties = false
  if (Object.keys(propertyMaps).length > 0) map.properties = propertyMaps
}

function transformStructuredArray(
  result: JSONSchema,
  map: NullWideningMap,
): void {
  const shouldSkipResult = result.type !== 'array' || !result.items
  if (shouldSkipResult) return
  const items = Array.isArray(result.items) ? result.items[0] : result.items
  if (!items) return
  const nestedItems = makeStructuredOutputCompatible(
    items,
    items.required || [],
  )
  result.items = nestedItems.schema
  if (nestedItems.nullWidening) map.items = nestedItems.nullWidening
}

function makeStructuredOutputCompatible(
  schema: JSONSchema,
  originalRequired: Array<string> = [],
): StructuredOutputConversion {
  const result: JSONSchema = { ...schema }
  const map: NullWideningMap = {}
  transformStructuredObject(result, originalRequired, map)
  transformStructuredArray(result, map)
  return { schema: result, nullWidening: pruneMap(map) }
}

export interface ConvertSchemaOptions {
  forStructuredOutput?: boolean
}

function toTypedJsonSchema(schema: SchemaInput): JSONSchema | undefined {
  if (isStandardJSONSchema(schema)) {
    const jsonSchema = schema['~standard'].jsonSchema.input({
      target: 'draft-07',
    })
    const result: JSONSchema = toJsonSchema(jsonSchema)
    const hasProperties = 'properties' in result && !result.type
    if (hasProperties) result.type = 'object'
    const hasProperties2 = result.type === 'object' && !('properties' in result)
    if (hasProperties2) {
      result.properties = {}
    }
    const hasRequired = result.type === 'object' && !('required' in result)
    if (hasRequired) {
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

export function convertSchemaToJsonSchema(
  schema: SchemaInput | undefined,
  options: ConvertSchemaOptions = {},
): JSONSchema | undefined {
  if (!schema) return undefined

  const { forStructuredOutput = false } = options

  const shouldSkipForStructuredOutput =
    !forStructuredOutput &&
    !isStandardJSONSchema(schema) &&
    !isStandardSchema(schema)
  if (shouldSkipForStructuredOutput) {
    return schema
  }

  const base = toTypedJsonSchema(schema)
  // Non-object inputs can't be widened; surface them untouched.
  const isInvalidBase = !base || typeof base !== 'object'
  if (isInvalidBase) return base
  if (!forStructuredOutput) return base
  return makeStructuredOutputCompatible(base, base.required || []).schema
}

export function convertSchemaForStructuredOutput(
  schema: SchemaInput | undefined,
): {
  jsonSchema: JSONSchema | undefined
  nullWideningMap: NullWideningMap | undefined
} {
  if (!schema) return { jsonSchema: undefined, nullWideningMap: undefined }
  const base = toTypedJsonSchema(schema)
  const isInvalidBase = !base || typeof base !== 'object'
  if (isInvalidBase) {
    return { jsonSchema: base, nullWideningMap: undefined }
  }
  const { schema: jsonSchema, nullWidening } = makeStructuredOutputCompatible(
    base,
    base.required || [],
  )
  return { jsonSchema, nullWideningMap: nullWidening }
}

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
