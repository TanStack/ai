import type { NullWideningMap } from '@tanstack/ai-utils'

interface MistralStructuredOutputCompatibility {
  schema: Record<string, any>
  nullWideningMap: NullWideningMap | undefined
  strict: boolean
}

/**
 * Convert a schema for Mistral strict mode and record how to invert it.
 *
 * Outcomes:
 * - `strict: true` — rewritten schema (`required` closed, optionals null-widened).
 *   `nullWideningMap` marks synthesized optional nulls only; already-nullable
 *   fields and enum/const repairs on required nodes are unmarked.
 * - `strict: false` — original schema, no map. Used when `oneOf`/`allOf`/`not`/
 *   `$ref`/`$defs` appear, or an `anyOf` branch would need a branch-dependent map.
 */
export function makeMistralStructuredOutputCompatibleWithMap(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): MistralStructuredOutputCompatibility {
  if (containsUnsupportedStrictKeyword(schema)) {
    return { schema, nullWideningMap: undefined, strict: false }
  }

  const converted = coerceMistralStrictSchema(schema, originalRequired)
  if (converted.hasUntrackableAnyOfWidening) {
    return { schema, nullWideningMap: undefined, strict: false }
  }

  return {
    schema: converted.schema,
    nullWideningMap: converted.nullWideningMap,
    strict: true,
  }
}

interface CoercedMistralStrictSchema {
  schema: Record<string, any>
  nullWideningMap: NullWideningMap | undefined
  hasUntrackableAnyOfWidening: boolean
}

const UNSUPPORTED_STRICT_KEYWORDS: ReadonlyArray<string> = [
  'oneOf',
  'allOf',
  'not',
  '$ref',
  '$defs',
  'definitions',
]

/**
 * Tree-wide key scan for `oneOf`/`allOf`/`not`/`$ref`/`$defs`/`definitions`.
 * Conservative: a property literally named e.g. `oneOf` also trips fallback.
 * `anyOf` is handled separately in the coerce walk.
 */
function containsUnsupportedStrictKeyword(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsUnsupportedStrictKeyword)
  if (!isSchemaObject(node)) return false

  return Object.entries(node).some(
    ([key, value]) =>
      UNSUPPORTED_STRICT_KEYWORDS.includes(key) ||
      containsUnsupportedStrictKeyword(value),
  )
}

function pruneMap(map: NullWideningMap): NullWideningMap | undefined {
  return Object.keys(map).length > 0 ? map : undefined
}

function isSchemaObject(schema: unknown): schema is Record<string, any> {
  return typeof schema === 'object' && schema !== null && !Array.isArray(schema)
}

function coerceArrayItems(items: unknown): {
  schema: unknown
  itemMap: NullWideningMap | Array<NullWideningMap> | undefined
  hasUntrackableAnyOfWidening: boolean
} {
  if (Array.isArray(items)) {
    const converted = items.map((item) =>
      isSchemaObject(item)
        ? coerceMistralStrictSchema(item, item.required || [])
        : {
            schema: item,
            nullWideningMap: undefined,
            hasUntrackableAnyOfWidening: false,
          },
    )
    const itemMaps = converted.map((item) => item.nullWideningMap)
    return {
      schema: converted.map((item) => item.schema),
      itemMap: itemMaps.some(Boolean)
        ? itemMaps.map((map) => map ?? {})
        : undefined,
      hasUntrackableAnyOfWidening: converted.some(
        (item) => item.hasUntrackableAnyOfWidening,
      ),
    }
  }

  if (isSchemaObject(items)) {
    const converted = coerceMistralStrictSchema(items, items.required || [])
    return {
      schema: converted.schema,
      itemMap: converted.nullWideningMap,
      hasUntrackableAnyOfWidening: converted.hasUntrackableAnyOfWidening,
    }
  }

  return {
    schema: items,
    itemMap: undefined,
    hasUntrackableAnyOfWidening: false,
  }
}

function schemaTypeIncludes(
  schema: Record<string, any>,
  typeName: string,
): boolean {
  return (
    schema.type === typeName ||
    (Array.isArray(schema.type) && schema.type.includes(typeName))
  )
}

function admitNullInEnumOrConst(
  prop: Record<string, any>,
): Record<string, any> {
  if ('const' in prop && prop.const !== null) {
    const { const: constValue, ...withoutConst } = prop
    return { ...withoutConst, enum: [constValue, null] }
  }
  if (Array.isArray(prop.enum) && !prop.enum.includes(null)) {
    return { ...prop, enum: [...prop.enum, null] }
  }
  return prop
}

/**
 * True when `type`/`enum`/`const`/`anyOf` already admit null. `oneOf`/`allOf`/
 * `not` are not inspected — callers must reject those first.
 */
function acceptsNull(schema: unknown): boolean {
  if (schema === true) return true
  if (!isSchemaObject(schema)) return false

  const hasNonNullConst = 'const' in schema && schema.const !== null
  if (hasNonNullConst) return false
  const hasNonNullEnum =
    Array.isArray(schema.enum) && !schema.enum.includes(null)
  if (hasNonNullEnum) return false

  const hasNonNullTypeString =
    typeof schema.type === 'string' && schema.type !== 'null'
  if (hasNonNullTypeString) return false
  const hasNonNullTypeArray =
    Array.isArray(schema.type) && !schema.type.includes('null')
  if (hasNonNullTypeArray) return false

  const hasNoNullAnyOf =
    Array.isArray(schema.anyOf) &&
    !schema.anyOf.some((variant: unknown) => acceptsNull(variant))
  if (hasNoNullAnyOf) {
    return false
  }

  return true
}

function coerceNestedProperty(prop: unknown): {
  prop: unknown
  childMap: NullWideningMap | undefined
  hasUntrackableAnyOfWidening: boolean
} {
  if (
    isSchemaObject(prop) &&
    schemaTypeIncludes(prop, 'object') &&
    prop.properties
  ) {
    const converted = coerceMistralStrictSchema(prop, prop.required || [])
    return {
      prop: converted.schema,
      childMap: converted.nullWideningMap,
      hasUntrackableAnyOfWidening: converted.hasUntrackableAnyOfWidening,
    }
  }

  if (
    isSchemaObject(prop) &&
    schemaTypeIncludes(prop, 'array') &&
    prop.items != null
  ) {
    const convertedItems = coerceArrayItems(prop.items)
    return {
      prop: { ...prop, items: convertedItems.schema },
      childMap: convertedItems.itemMap
        ? { items: convertedItems.itemMap }
        : undefined,
      hasUntrackableAnyOfWidening: convertedItems.hasUntrackableAnyOfWidening,
    }
  }

  if (isSchemaObject(prop) && Array.isArray(prop.anyOf)) {
    const converted = coerceMistralStrictSchema(prop, prop.required || [])
    return {
      prop: converted.schema,
      childMap: converted.nullWideningMap,
      hasUntrackableAnyOfWidening: converted.hasUntrackableAnyOfWidening,
    }
  }

  return {
    prop,
    childMap: undefined,
    hasUntrackableAnyOfWidening: false,
  }
}

function widenOptionalProperty(
  prop: unknown,
  wasOptional: boolean,
): { prop: unknown; widenedHere: boolean } {
  if (acceptsNull(prop)) return { prop, widenedHere: false }

  if (wasOptional) {
    let next = prop
    if (isSchemaObject(next)) {
      next = admitNullInEnumOrConst(next)
    }

    if (isSchemaObject(next) && next.type && !Array.isArray(next.type)) {
      next = { ...next, type: [next.type, 'null'] }
    } else if (
      isSchemaObject(next) &&
      Array.isArray(next.type) &&
      !next.type.includes('null')
    ) {
      next = { ...next, type: [...next.type, 'null'] }
    } else if (!isSchemaObject(next) || !next.type) {
      next = { anyOf: [next, { type: 'null' }] }
    }

    return { prop: next, widenedHere: true }
  }

  if (isSchemaObject(prop) && schemaTypeIncludes(prop, 'null')) {
    return { prop: admitNullInEnumOrConst(prop), widenedHere: false }
  }

  return { prop, widenedHere: false }
}

function coerceObjectProperties(
  rawProperties: Record<string, unknown>,
  originalRequired: Array<string>,
): {
  properties: Record<string, unknown>
  propertyMaps: Record<string, NullWideningMap>
  hasUntrackableAnyOfWidening: boolean
} {
  const properties = { ...rawProperties }
  const propertyMaps: Record<string, NullWideningMap> = {}
  let hasUntrackableAnyOfWidening = false

  const propNames = Object.keys(properties)
  for (const propName of propNames) {
    const nested = coerceNestedProperty(properties[propName])
    const widened = widenOptionalProperty(
      nested.prop,
      !originalRequired.includes(propName),
    )
    hasUntrackableAnyOfWidening ||= nested.hasUntrackableAnyOfWidening
    properties[propName] = widened.prop
    if (nested.childMap || widened.widenedHere) {
      propertyMaps[propName] = {
        ...(nested.childMap ?? {}),
        ...(widened.widenedHere ? { widened: true } : {}),
      }
    }
  }

  return { properties, propertyMaps, hasUntrackableAnyOfWidening }
}

function coerceAnyOfVariants(anyOf: Array<unknown>): {
  schemas: Array<unknown>
  hasUntrackableAnyOfWidening: boolean
} {
  const variants = anyOf.map((variant: unknown) => {
    if (!isSchemaObject(variant)) {
      return {
        schema: variant,
        nullWideningMap: undefined,
        hasUntrackableAnyOfWidening: false,
      }
    }
    return coerceMistralStrictSchema(variant, variant.required || [])
  })
  return {
    schemas: variants.map((variant) => variant.schema),
    hasUntrackableAnyOfWidening: variants.some(
      (variant) =>
        variant.nullWideningMap !== undefined ||
        variant.hasUntrackableAnyOfWidening,
    ),
  }
}

function coerceMistralStrictSchema(
  schema: Record<string, any>,
  originalRequired: Array<string>,
): CoercedMistralStrictSchema {
  const result = { ...schema }
  const nullWideningMap: NullWideningMap = {}
  let hasUntrackableAnyOfWidening = false

  if (schemaTypeIncludes(result, 'object')) {
    if (!result.properties) {
      result.properties = {}
    }
    const converted = coerceObjectProperties(
      result.properties,
      originalRequired,
    )
    result.properties = converted.properties
    hasUntrackableAnyOfWidening ||= converted.hasUntrackableAnyOfWidening
    if (Object.keys(converted.properties).length > 0) {
      result.required = Object.keys(converted.properties)
    } else {
      delete result.required
    }
    result.additionalProperties = false
    if (Object.keys(converted.propertyMaps).length > 0) {
      nullWideningMap.properties = converted.propertyMaps
    }
  }

  if (schemaTypeIncludes(result, 'array') && result.items != null) {
    const convertedItems = coerceArrayItems(result.items)
    result.items = convertedItems.schema
    if (convertedItems.itemMap) {
      nullWideningMap.items = convertedItems.itemMap
    }
    hasUntrackableAnyOfWidening ||= convertedItems.hasUntrackableAnyOfWidening
  }

  if (Array.isArray(result.anyOf)) {
    const converted = coerceAnyOfVariants(result.anyOf)
    result.anyOf = converted.schemas
    hasUntrackableAnyOfWidening ||= converted.hasUntrackableAnyOfWidening
  }

  return {
    schema: result,
    nullWideningMap: pruneMap(nullWideningMap),
    hasUntrackableAnyOfWidening,
  }
}
