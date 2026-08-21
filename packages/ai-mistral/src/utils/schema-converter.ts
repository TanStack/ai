import type { NullWideningMap } from '@tanstack/ai-utils'

/**
 * Schema-only wrapper around {@link makeMistralStructuredOutputCompatibleWithMap}.
 * Returns the strict rewrite when conversion succeeds, or the original schema
 * when it falls back to `strict: false`. Does not report which — callers that
 * send `strict` on the wire must use `WithMap`.
 */
export function makeMistralStructuredOutputCompatible(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): Record<string, any> {
  return makeMistralStructuredOutputCompatibleWithMap(schema, originalRequired)
    .schema
}

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

  if ('const' in schema && schema.const !== null) return false
  if (Array.isArray(schema.enum) && !schema.enum.includes(null)) return false

  if (typeof schema.type === 'string' && schema.type !== 'null') return false
  if (Array.isArray(schema.type) && !schema.type.includes('null')) return false

  if (
    Array.isArray(schema.anyOf) &&
    !schema.anyOf.some((variant: unknown) => acceptsNull(variant))
  ) {
    return false
  }

  return true
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
    const properties = { ...result.properties }
    const allPropertyNames = Object.keys(properties)
    const propertyMaps: Record<string, NullWideningMap> = {}

    for (const propName of allPropertyNames) {
      let prop = properties[propName]
      const wasOptional = !originalRequired.includes(propName)
      let childMap: NullWideningMap | undefined
      let widenedHere = false

      if (
        isSchemaObject(prop) &&
        schemaTypeIncludes(prop, 'object') &&
        prop.properties
      ) {
        const converted = coerceMistralStrictSchema(prop, prop.required || [])
        prop = converted.schema
        childMap = converted.nullWideningMap
        hasUntrackableAnyOfWidening ||= converted.hasUntrackableAnyOfWidening
      } else if (
        isSchemaObject(prop) &&
        schemaTypeIncludes(prop, 'array') &&
        prop.items != null
      ) {
        const convertedItems = coerceArrayItems(prop.items)
        prop = {
          ...prop,
          items: convertedItems.schema,
        }
        if (convertedItems.itemMap) {
          childMap = { items: convertedItems.itemMap }
        }
        hasUntrackableAnyOfWidening ||=
          convertedItems.hasUntrackableAnyOfWidening
      } else if (isSchemaObject(prop) && Array.isArray(prop.anyOf)) {
        const converted = coerceMistralStrictSchema(prop, prop.required || [])
        prop = converted.schema
        childMap = converted.nullWideningMap
        hasUntrackableAnyOfWidening ||= converted.hasUntrackableAnyOfWidening
      }

      if (!acceptsNull(prop)) {
        if (wasOptional) {
          if (isSchemaObject(prop)) {
            prop = admitNullInEnumOrConst(prop)
          }

          if (isSchemaObject(prop) && prop.type && !Array.isArray(prop.type)) {
            prop = { ...prop, type: [prop.type, 'null'] }
          } else if (
            isSchemaObject(prop) &&
            Array.isArray(prop.type) &&
            !prop.type.includes('null')
          ) {
            prop = { ...prop, type: [...prop.type, 'null'] }
          } else if (!isSchemaObject(prop) || !prop.type) {
            prop = { anyOf: [prop, { type: 'null' }] }
          }

          widenedHere = true
        } else if (isSchemaObject(prop) && schemaTypeIncludes(prop, 'null')) {
          prop = admitNullInEnumOrConst(prop)
        }
      }

      properties[propName] = prop
      if (childMap || widenedHere) {
        propertyMaps[propName] = {
          ...(childMap ?? {}),
          ...(widenedHere ? { widened: true } : {}),
        }
      }
    }

    result.properties = properties
    if (allPropertyNames.length > 0) {
      result.required = allPropertyNames
    } else {
      delete result.required
    }
    result.additionalProperties = false
    if (Object.keys(propertyMaps).length > 0) {
      nullWideningMap.properties = propertyMaps
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
    const variants = result.anyOf.map((variant: unknown) => {
      if (!isSchemaObject(variant)) {
        return {
          schema: variant,
          nullWideningMap: undefined,
          hasUntrackableAnyOfWidening: false,
        }
      }
      return coerceMistralStrictSchema(variant, variant.required || [])
    })
    result.anyOf = variants.map((variant) => variant.schema)
    hasUntrackableAnyOfWidening ||= variants.some(
      (variant) =>
        variant.nullWideningMap !== undefined ||
        variant.hasUntrackableAnyOfWidening,
    )
  }

  return {
    schema: result,
    nullWideningMap: pruneMap(nullWideningMap),
    hasUntrackableAnyOfWidening,
  }
}
