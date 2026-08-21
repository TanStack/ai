import type { NullWideningMap } from '@tanstack/ai-utils'

interface MistralStructuredOutputCompatibility {
  schema: Record<string, any>
  nullWideningMap: NullWideningMap | undefined
  strict: boolean
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
 * Composed and referenced schemas cannot be rewritten without either changing
 * their meaning or making inverse null normalization branch-dependent. Keep
 * those schemas intact and let the provider handle them in non-strict mode.
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
  return typeof schema === 'object' && schema !== null
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

/** Whether every active JSON Schema constraint at this node admits null. */
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
        isSchemaObject(prop.items)
      ) {
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

  if (schemaTypeIncludes(result, 'array') && isSchemaObject(result.items)) {
    const convertedItems = coerceMistralStrictSchema(
      result.items,
      result.items.required || [],
    )
    result.items = convertedItems.schema
    if (convertedItems.nullWideningMap) {
      nullWideningMap.items = convertedItems.nullWideningMap
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
