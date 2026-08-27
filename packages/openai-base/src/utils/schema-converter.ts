import type { NullWideningMap } from '@tanstack/ai-utils'

/**
 * String `format` values accepted by OpenAI's strict Structured Outputs subset.
 * Any other format (e.g. "uri", "uri-reference", "regex") causes the API to
 * reject the whole request with `400 ... '<format>' is not a valid format`.
 * MCP servers and hand-written tools routinely declare such formats, so we strip
 * the unsupported ones before sending. See:
 * https://platform.openai.com/docs/guides/structured-outputs#supported-properties
 */
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

/**
 * Recursively drop JSON-Schema `format` keywords whose value isn't in OpenAI's
 * strict-mode allowlist. Pure — returns a fresh tree and never mutates `node`,
 * so the caller's original tool definition is left intact.
 *
 * A property *named* `format` always has a schema (object/boolean) value, never
 * a bare string, so it is preserved and recursed into; only the `format`
 * *keyword* (whose value is a string) is subject to removal.
 */
export function stripUnsupportedFormats(node: any): any {
  if (Array.isArray(node)) return node.map(stripUnsupportedFormats)
  if (node === null || typeof node !== 'object') return node

  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'format' &&
      typeof value === 'string' &&
      !SUPPORTED_STRING_FORMATS.has(value)
    ) {
      continue
    }
    out[key] = stripUnsupportedFormats(value)
  }
  return out
}

/**
 * Transform a JSON schema to be compatible with OpenAI's structured output requirements.
 * OpenAI requires:
 * - All properties must be in the `required` array
 * - Optional fields should have null added to their type union
 * - additionalProperties must be false for objects
 * - String `format` keywords must be from a fixed allowlist (others are stripped)
 *
 * @param schema - JSON schema to transform
 * @param originalRequired - Original required array (to know which fields were optional)
 * @returns Transformed schema compatible with OpenAI structured output
 */
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

/**
 * Strict-schema conversion plus an exact map of the nullability introduced by
 * that conversion. Consumers can pass provider output through
 * `undoNullWidening` before validating it against the original schema.
 */
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

/**
 * JSON-Schema keywords outside OpenAI's strict Structured Outputs subset. A
 * schema using any of these can't be coerced into a strict-valid shape, and
 * sending it with `strict: true` makes the API reject the ENTIRE request
 * (e.g. `400 Invalid schema ... 'additionalProperties' is required to be ...`).
 * Tools with such schemas are emitted with `strict: false` instead (see the
 * tool converters) so they remain callable. MCP servers (e.g. Notion) routinely
 * emit these.
 *
 * - `oneOf` / `allOf` / `not` — combinator keywords strict mode rejects
 * - `prefixItems` — 2020-12 tuple keyword. openai-node's strict transform
 *   rejects it, so we send those tools with `strict: false` instead
 * - `$ref` / `$defs` / `definitions` — references and definition pools whose
 *   object subschemas escape the `additionalProperties: false` normalization
 *   strict mode requires
 */
const STRICT_UNSUPPORTED_KEYWORDS: ReadonlyArray<string> = [
  'oneOf',
  'allOf',
  'not',
  'prefixItems',
  '$ref',
  '$defs',
  'definitions',
]

/**
 * Keys that give a schema node a resolvable type under OpenAI's strict subset.
 * A schema-position node carrying none of these is *typeless* (e.g. the empty
 * `{}` that `z.any()` / `z.unknown()` emit). Strict mode requires every schema
 * to declare a type, so a typeless node 400s the whole request — such tools
 * must be sent with `strict: false` instead. (`oneOf`/`allOf`/`$ref` count as
 * type indicators here even though they're independently strict-unsupported;
 * the keyword check below already rejects them.)
 */
const TYPE_INDICATOR_KEYWORDS: ReadonlyArray<string> = [
  'type',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'allOf',
  '$ref',
]

/**
 * Returns `false` when `schema` cannot be made strict-compatible and must be
 * sent with `strict: false`. Two ways that happens:
 *
 * 1. It uses a JSON-Schema keyword outside OpenAI's strict subset anywhere in
 *    the tree (`oneOf`/`allOf`/`not`/`prefixItems`/`$ref`/`$defs`).
 * 2. It contains a *typeless* schema node — a property/items/anyOf entry with
 *    no `type` (nor `enum`/`const`/combinator), e.g. the `{}` that `z.any()`
 *    produces. Strict mode rejects typeless schemas.
 * 3. It contains an open object schema. OpenAI strict mode requires objects to
 *    set `additionalProperties: false`, which would change the semantics of a
 *    free-form map rather than merely normalizing it.
 * 4. An `anyOf` variant itself needs null widening. The inverse map is
 *    intentionally schema-blind, so it cannot select a variant without risking
 *    removal of a genuine nullable value accepted by another variant.
 *
 * Conservative by design: for (1) keywords are matched as object keys, so a
 * property literally named e.g. `oneOf` also trips it. That only costs that one
 * tool its strict mode, which is strictly safer than a false "compatible"
 * verdict that 400s the whole request.
 */
export function isStrictModeCompatible(schema: unknown): boolean {
  return (
    !containsStrictUnsupportedKeyword(schema) &&
    !containsTypelessSchema(schema) &&
    !containsOpenObject(schema) &&
    !containsUntrackableAnyOfWidening(schema)
  )
}

/**
 * Reports strict conversions whose synthesized nulls cannot be represented by
 * the schema-blind inverse map. Optional `anyOf` wrappers remain supported:
 * only widening introduced inside one of their variants triggers fallback.
 */
function containsUntrackableAnyOfWidening(schema: unknown): boolean {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    return false
  }
  return coerceStrictSchema(schema as Record<string, any>)
    .hasUntrackableAnyOfWidening
}

/**
 * Reports object schemas that cannot be closed without changing their input
 * semantics. Objects with `properties` and no explicit
 * `additionalProperties` are safe because `coerceStrictSchema` closes them.
 */
function containsOpenObject(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(containsOpenObject)
  }
  if (node === null || typeof node !== 'object') return false

  const schema = node as Record<string, unknown>
  const type = schema['type']
  const isObjectSchema =
    type === 'object' || (Array.isArray(type) && type.includes('object'))

  if (isObjectSchema) {
    if (
      'additionalProperties' in schema &&
      schema['additionalProperties'] !== false
    ) {
      return true
    }

    const properties = schema['properties']
    const hasProperties =
      properties !== null &&
      typeof properties === 'object' &&
      !Array.isArray(properties)
    if (!hasProperties && schema['additionalProperties'] !== false) {
      return true
    }
  }

  return Object.values(schema).some(containsOpenObject)
}

function containsStrictUnsupportedKeyword(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(containsStrictUnsupportedKeyword)
  }
  if (node === null || typeof node !== 'object') return false
  for (const [key, value] of Object.entries(node)) {
    if (STRICT_UNSUPPORTED_KEYWORDS.includes(key)) return true
    if (containsStrictUnsupportedKeyword(value)) return true
  }
  return false
}

/** A schema-position node that declares no type and so 400s strict mode. */
function isTypelessSchema(node: unknown): boolean {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    // JSON Schema permits bare boolean nodes; malformed inputs may contain
    // other primitives. OpenAI's strict subset requires a declared type, so
    // preserve the containing tool by sending it in non-strict mode.
    return true
  }
  return !TYPE_INDICATOR_KEYWORDS.some((key) => key in node)
}

/**
 * Walks the genuine schema positions (property values, `items`, `anyOf`
 * variants) and reports whether any is typeless. Unlike the keyword walk this
 * must respect structure: an empty `{}` is only a problem at a schema position,
 * not e.g. an empty `properties` map.
 */
function containsTypelessSchema(node: unknown): boolean {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
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

/**
 * Strict-mode structural rewrite (required widening, nullability,
 * additionalProperties). Kept private so the public entry point can apply the
 * format-stripping pass exactly once over the fully-rewritten tree.
 */
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

  // `type: [..., 'null']` alone does not make null valid when an enum or
  // const still excludes it; strict decoding would be forced to emit the
  // original literal instead of the synthetic omission marker.
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

  for (const propName of Object.keys(next)) {
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
