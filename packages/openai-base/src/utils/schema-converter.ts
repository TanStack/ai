import type { NullWideningMap } from '@tanstack/ai-utils'

const SUPPORTED_STRING_FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
])

export function stripUnsupportedFormats(node: any): any {
  if (Array.isArray(node)) return node.map(stripUnsupportedFormats)
  if (node === null || typeof node !== 'object') return node

  const out: Record<string, any> = {}
  const nodeEntries = Object.entries(node)
  for (const [key, value] of nodeEntries) {
    const isUnsupportedStringFormat =
      key === 'format' &&
      typeof value === 'string' &&
      !SUPPORTED_STRING_FORMATS.has(value)
    if (isUnsupportedStringFormat) {
      continue
    }
    out[key] = stripUnsupportedFormats(value)
  }
  return out
}

export function makeStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired?: Array<string>,
): Record<string, any> {
  return makeStructuredOutputCompatibleWithMap(schema, originalRequired).schema
}

export interface StructuredOutputCompatibility {
  schema: Record<string, any>
  nullWideningMap: NullWideningMap | undefined
}

interface CoercedStrictSchema extends StructuredOutputCompatibility {
  hasUntrackableAnyOfWidening: boolean
}

export function makeStructuredOutputCompatibleWithMap(
  schema: Record<string, any>,
  originalRequired?: Array<string>,
): StructuredOutputCompatibility {
  const { schema: strictSchema, nullWideningMap } = coerceStrictSchema(
    schema,
    originalRequired,
  )
  return {
    schema: stripUnsupportedFormats(strictSchema),
    nullWideningMap,
  }
}

const STRICT_UNSUPPORTED_KEYWORDS: ReadonlyArray<string> = [
  'oneOf',
  'allOf',
  'not',
  'prefixItems',
  '$ref',
  '$defs',
  'definitions',
]

const TYPE_INDICATOR_KEYWORDS: ReadonlyArray<string> = [
  'type',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'allOf',
  '$ref',
]

export function isStrictModeCompatible(schema: unknown): boolean {
  return (
    !containsStrictUnsupportedKeyword(schema) &&
    !containsTypelessSchema(schema) &&
    !containsOpenObject(schema) &&
    !containsUntrackableAnyOfWidening(schema)
  )
}

function containsUntrackableAnyOfWidening(schema: unknown): boolean {
  if (!isSchemaObject(schema)) {
    return false
  }
  return coerceStrictSchema(schema).hasUntrackableAnyOfWidening
}

function containsOpenObject(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(containsOpenObject)
  }
  if (!isSchemaObject(node)) return false

  const schema = node as Record<string, unknown>
  const type = schema['type']
  const isObjectSchema =
    type === 'object' || (Array.isArray(type) && type.includes('object'))

  if (isObjectSchema) {
    const allowsAdditionalProperties =
      'additionalProperties' in schema &&
      schema['additionalProperties'] !== false
    if (allowsAdditionalProperties) {
      return true
    }

    const properties = schema['properties']
    const hasProperties =
      properties !== null &&
      typeof properties === 'object' &&
      !Array.isArray(properties)
    const isOpenObjectWithoutProperties =
      !hasProperties && schema['additionalProperties'] !== false
    if (isOpenObjectWithoutProperties) {
      return true
    }
  }

  return Object.values(schema).some(containsOpenObject)
}

function containsStrictUnsupportedKeyword(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(containsStrictUnsupportedKeyword)
  }
  if (!isSchemaObject(node)) return false
  const nodeEntries = Object.entries(node)
  for (const [key, value] of nodeEntries) {
    if (STRICT_UNSUPPORTED_KEYWORDS.includes(key)) return true
    if (containsStrictUnsupportedKeyword(value)) return true
  }
  return false
}

/** A schema-position node that declares no type and so 400s strict mode. */
function isTypelessSchema(node: unknown): boolean {
  if (!isSchemaObject(node)) {
    return true
  }
  return !TYPE_INDICATOR_KEYWORDS.some((key) => key in node)
}

function containsTypelessSchema(node: unknown): boolean {
  if (!isSchemaObject(node)) {
    return false
  }
  const schema = node as Record<string, any>

  const children: Array<unknown> = []
  if (schema.properties && typeof schema.properties === 'object') {
    children.push(...Object.values(schema.properties))
  }
  if (schema.items !== undefined) {
    children.push(
      ...(Array.isArray(schema.items) ? schema.items : [schema.items]),
    )
  }
  if (Array.isArray(schema.anyOf)) {
    children.push(...schema.anyOf)
  }

  return children.some(
    (child) => isTypelessSchema(child) || containsTypelessSchema(child),
  )
}

function pruneMap(map: NullWideningMap): NullWideningMap | undefined {
  return Object.keys(map).length > 0 ? map : undefined
}

function isSchemaObject(schema: unknown): schema is Record<string, any> {
  return typeof schema === 'object' && schema !== null && !Array.isArray(schema)
}

/** Whether every active JSON Schema constraint at this node admits null. */
function acceptsNull(schema: unknown): boolean {
  if (schema === true) return true
  if (!isSchemaObject(schema)) return false

  const hasNonNullConst = 'const' in schema && schema.const !== null
  if (hasNonNullConst) return false
  const enumRejectsNull =
    Array.isArray(schema.enum) && !schema.enum.includes(null)
  if (enumRejectsNull) return false

  const hasNonNullStringType =
    typeof schema.type === 'string' && schema.type !== 'null'
  if (hasNonNullStringType) return false
  const typeListRejectsNull =
    Array.isArray(schema.type) && !schema.type.includes('null')
  if (typeListRejectsNull) return false

  const anyOfRejectsNull =
    Array.isArray(schema.anyOf) &&
    !schema.anyOf.some((variant: unknown) => acceptsNull(variant))
  if (anyOfRejectsNull) {
    return false
  }

  return true
}

const ONE_OF_UNSUPPORTED =
  'oneOf is not supported in OpenAI structured output schemas. Check the supported outputs here: https://platform.openai.com/docs/guides/structured-outputs#supported-types'

function recurseIntoProperty(prop: unknown): {
  prop: unknown
  childMap: NullWideningMap | undefined
  hasUntrackableAnyOfWidening: boolean
} {
  if (!isSchemaObject(prop)) {
    return {
      prop,
      childMap: undefined,
      hasUntrackableAnyOfWidening: false,
    }
  }
  if (prop.type === 'object' && prop.properties) {
    const nested = coerceStrictSchema(prop, prop.required || [])
    return {
      prop: nested.schema,
      childMap: nested.nullWideningMap,
      hasUntrackableAnyOfWidening: nested.hasUntrackableAnyOfWidening,
    }
  }
  if (prop.type === 'array') {
    const nested = coerceStrictSchema(prop, [])
    return {
      prop: nested.schema,
      childMap: nested.nullWideningMap,
      hasUntrackableAnyOfWidening: nested.hasUntrackableAnyOfWidening,
    }
  }
  if (prop.anyOf) {
    const nested = coerceStrictSchema(prop, prop.required || [])
    return {
      prop: nested.schema,
      childMap: nested.nullWideningMap,
      hasUntrackableAnyOfWidening: nested.hasUntrackableAnyOfWidening,
    }
  }
  if (prop.oneOf) {
    throw new Error(ONE_OF_UNSUPPORTED)
  }
  return {
    prop,
    childMap: undefined,
    hasUntrackableAnyOfWidening: false,
  }
}

function widenOptionalProperty(prop: unknown): {
  prop: unknown
  widenedHere: boolean
} {
  const originallyAcceptedNull = acceptsNull(prop)
  let next = prop

  if (isSchemaObject(next) && 'const' in next && next.const !== null) {
    const { const: constValue, ...withoutConst } = next
    next = { ...withoutConst, enum: [constValue, null] }
  } else if (
    isSchemaObject(next) &&
    Array.isArray(next.enum) &&
    !next.enum.includes(null)
  ) {
    next = { ...next, enum: [...next.enum, null] }
  }

  if (isSchemaObject(next) && next.anyOf) {
    // A genuine null branch can use type, enum, or const. Only add a
    // provider omission marker when the original union rejected null.
    if (!acceptsNull(next)) {
      next = { ...next, anyOf: [...next.anyOf, { type: 'null' }] }
    }
  } else if (isSchemaObject(next) && next.type && !Array.isArray(next.type)) {
    next = { ...next, type: [next.type, 'null'] }
  } else if (
    isSchemaObject(next) &&
    Array.isArray(next.type) &&
    !next.type.includes('null')
  ) {
    next = { ...next, type: [...next.type, 'null'] }
  }

  return {
    prop: next,
    widenedHere: !originallyAcceptedNull && acceptsNull(next),
  }
}

function coerceObjectProperty(
  prop: unknown,
  wasOptional: boolean,
): {
  prop: unknown
  childMap: NullWideningMap | undefined
  widenedHere: boolean
  hasUntrackableAnyOfWidening: boolean
} {
  const nested = recurseIntoProperty(prop)
  if (!wasOptional) {
    return {
      prop: nested.prop,
      childMap: nested.childMap,
      widenedHere: false,
      hasUntrackableAnyOfWidening: nested.hasUntrackableAnyOfWidening,
    }
  }
  const widened = widenOptionalProperty(nested.prop)
  return {
    prop: widened.prop,
    childMap: nested.childMap,
    widenedHere: widened.widenedHere,
    hasUntrackableAnyOfWidening: nested.hasUntrackableAnyOfWidening,
  }
}

function coerceObjectProperties(
  properties: Record<string, any>,
  required: Array<string>,
): {
  properties: Record<string, any>
  propertyMaps: Record<string, NullWideningMap>
  hasUntrackableAnyOfWidening: boolean
} {
  const next = { ...properties }
  const propertyMaps: Record<string, NullWideningMap> = {}
  let hasUntrackableAnyOfWidening = false

  const propertyNames = Object.keys(next)
  for (const propName of propertyNames) {
    const coerced = coerceObjectProperty(
      next[propName],
      !required.includes(propName),
    )
    next[propName] = coerced.prop
    hasUntrackableAnyOfWidening ||= coerced.hasUntrackableAnyOfWidening
    if (coerced.childMap || coerced.widenedHere) {
      propertyMaps[propName] = {
        ...(coerced.childMap ?? {}),
        ...(coerced.widenedHere ? { widened: true } : {}),
      }
    }
  }

  return { properties: next, propertyMaps, hasUntrackableAnyOfWidening }
}

function coerceStrictSchema(
  schema: Record<string, any>,
  originalRequired?: Array<string>,
): CoercedStrictSchema {
  const result = { ...schema }
  const nullWideningMap: NullWideningMap = {}
  let hasUntrackableAnyOfWidening = false
  const required =
    originalRequired ??
    (Array.isArray(result['required']) ? result['required'] : [])

  if (result.type === 'object' && result.properties) {
    const properties = { ...result.properties }
    const allPropertyNames = Object.keys(properties)
    const coerced = coerceObjectProperties(properties, required)
    result.properties = coerced.properties
    result.required = allPropertyNames
    result.additionalProperties = false
    hasUntrackableAnyOfWidening ||= coerced.hasUntrackableAnyOfWidening
    if (Object.keys(coerced.propertyMaps).length > 0) {
      nullWideningMap.properties = coerced.propertyMaps
    }
  }

  if (result.type === 'array' && result.items) {
    if (Array.isArray(result.items)) {
      const itemMaps: Array<NullWideningMap> = []
      result.items = result.items.map((item) => {
        if (!isSchemaObject(item)) {
          itemMaps.push({})
          return item
        }
        const nested = coerceStrictSchema(item, item.required || [])
        itemMaps.push(nested.nullWideningMap ?? {})
        hasUntrackableAnyOfWidening ||= nested.hasUntrackableAnyOfWidening
        return nested.schema
      })
      if (itemMaps.some((map) => Object.keys(map).length > 0)) {
        nullWideningMap.items = itemMaps
      }
    } else {
      const nested = coerceStrictSchema(
        result.items,
        result.items.required || [],
      )
      result.items = nested.schema
      if (nested.nullWideningMap) {
        nullWideningMap.items = nested.nullWideningMap
      }
      hasUntrackableAnyOfWidening ||= nested.hasUntrackableAnyOfWidening
    }
  }

  if (result.anyOf && Array.isArray(result.anyOf)) {
    const variants = result.anyOf.map((variant) =>
      coerceStrictSchema(variant, variant.required || []),
    )
    result.anyOf = variants.map((variant) => variant.schema)
    hasUntrackableAnyOfWidening ||= variants.some(
      (variant) =>
        variant.nullWideningMap !== undefined ||
        variant.hasUntrackableAnyOfWidening,
    )
  }

  if (result.oneOf) {
    throw new Error(ONE_OF_UNSUPPORTED)
  }

  return {
    schema: result,
    nullWideningMap: pruneMap(nullWideningMap),
    hasUntrackableAnyOfWidening,
  }
}
