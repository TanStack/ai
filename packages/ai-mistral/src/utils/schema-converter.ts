import type { NullWideningMap } from '@tanstack/ai-utils'

/**
 * Transform a JSON schema to be compatible with Mistral's structured output
 * requirements when `strict: true` is used.
 *
 * Mistral (in strict mode) requires:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
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
}

/**
 * Mistral strict-schema conversion plus an exact map of the nullability added
 * for optional fields. The map lets callers remove only provider nulls that
 * represent omitted fields while preserving nulls accepted by the original
 * schema.
 */
export function makeMistralStructuredOutputCompatibleWithMap(
  schema: Record<string, any>,
  originalRequired: Array<string> = [],
): MistralStructuredOutputCompatibility {
  return coerceMistralStrictSchema(schema, originalRequired)
}

function pruneMap(map: NullWideningMap): NullWideningMap | undefined {
  return Object.keys(map).length > 0 ? map : undefined
}

/** Whether every active JSON Schema constraint at this node admits null. */
function acceptsNull(schema: Record<string, any>): boolean {
  if ('const' in schema && schema.const !== null) return false
  if (Array.isArray(schema.enum) && !schema.enum.includes(null)) return false

  if (typeof schema.type === 'string' && schema.type !== 'null') return false
  if (Array.isArray(schema.type) && !schema.type.includes('null')) return false

  if (
    Array.isArray(schema.anyOf) &&
    !schema.anyOf.some((variant: Record<string, any>) => acceptsNull(variant))
  ) {
    return false
  }

  return true
}

function coerceMistralStrictSchema(
  schema: Record<string, any>,
  originalRequired: Array<string>,
): MistralStructuredOutputCompatibility {
  const result = { ...schema }
  const nullWideningMap: NullWideningMap = {}

  if (result.type === 'object') {
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

      if (prop.type === 'object' && prop.properties) {
        const converted = coerceMistralStrictSchema(prop, prop.required || [])
        prop = converted.schema
        childMap = converted.nullWideningMap
      } else if (prop.type === 'array' && prop.items) {
        const convertedItems = coerceMistralStrictSchema(
          prop.items,
          prop.items.required || [],
        )
        prop = {
          ...prop,
          items: convertedItems.schema,
        }
        if (convertedItems.nullWideningMap) {
          childMap = { items: convertedItems.nullWideningMap }
        }
      }

      if (wasOptional) {
        const originallyAcceptedNull = acceptsNull(prop)

        if ('const' in prop && prop.const !== null) {
          const { const: constValue, ...withoutConst } = prop
          prop = { ...withoutConst, enum: [constValue, null] }
        } else if (Array.isArray(prop.enum) && !prop.enum.includes(null)) {
          prop = { ...prop, enum: [...prop.enum, null] }
        }

        if (prop.type && !Array.isArray(prop.type)) {
          prop = { ...prop, type: [prop.type, 'null'] }
        } else if (Array.isArray(prop.type) && !prop.type.includes('null')) {
          prop = { ...prop, type: [...prop.type, 'null'] }
        } else if (!prop.type) {
          prop = { anyOf: [prop, { type: 'null' }] }
        }

        widenedHere = !originallyAcceptedNull
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

  if (result.type === 'array' && result.items) {
    const convertedItems = coerceMistralStrictSchema(
      result.items,
      result.items.required || [],
    )
    result.items = convertedItems.schema
    if (convertedItems.nullWideningMap) {
      nullWideningMap.items = convertedItems.nullWideningMap
    }
  }

  return {
    schema: result,
    nullWideningMap: pruneMap(nullWideningMap),
  }
}
