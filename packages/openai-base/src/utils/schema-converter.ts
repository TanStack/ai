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

interface StructuredOutputCompatibility {
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
 * - `$ref` / `$defs` / `definitions` — references and definition pools whose
 *   object subschemas escape the `additionalProperties: false` normalization
 *   strict mode requires
 */
const STRICT_UNSUPPORTED_KEYWORDS: ReadonlyArray<string> = [
  'oneOf',
  'allOf',
  'not',
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
 *    the tree (`oneOf`/`allOf`/`not`/`$ref`/`$defs`).
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
    const propertyMaps: Record<string, NullWideningMap> = {}

    for (const propName of allPropertyNames) {
      let prop = properties[propName]
      const wasOptional = !required.includes(propName)
      let childMap: NullWideningMap | undefined
      let widenedHere = false

      // Step 1: Recurse into nested structures
      if (isSchemaObject(prop) && prop.type === 'object' && prop.properties) {
        const nested = coerceStrictSchema(prop, prop.required || [])
        prop = nested.schema
        childMap = nested.nullWideningMap
        hasUntrackableAnyOfWidening ||= nested.hasUntrackableAnyOfWidening
      } else if (
        isSchemaObject(prop) &&
        prop.type === 'array' &&
        prop.items
      ) {
        const nested = coerceStrictSchema(prop.items, prop.items.required || [])
        prop = {
          ...prop,
          items: nested.schema,
        }
        childMap = nested.nullWideningMap
          ? { items: nested.nullWideningMap }
          : undefined
        hasUntrackableAnyOfWidening ||= nested.hasUntrackableAnyOfWidening
      } else if (isSchemaObject(prop) && prop.anyOf) {
        const nested = coerceStrictSchema(prop, prop.required || [])
        prop = nested.schema
        childMap = nested.nullWideningMap
        hasUntrackableAnyOfWidening ||= nested.hasUntrackableAnyOfWidening
      } else if (isSchemaObject(prop) && prop.oneOf) {
        throw new Error(
          'oneOf is not supported in OpenAI structured output schemas. Check the supported outputs here: https://platform.openai.com/docs/guides/structured-outputs#supported-types',
        )
      }

      // Step 2: Apply null-widening for optional properties (after recursion)
      if (wasOptional) {
        const originallyAcceptedNull = acceptsNull(prop)

        // `type: [..., 'null']` alone does not make null valid when an enum or
        // const still excludes it; strict decoding would be forced to emit the
        // original literal instead of the synthetic omission marker.
        if (isSchemaObject(prop) && 'const' in prop && prop.const !== null) {
          const { const: constValue, ...withoutConst } = prop
          prop = { ...withoutConst, enum: [constValue, null] }
        } else if (
          isSchemaObject(prop) &&
          Array.isArray(prop.enum) &&
          !prop.enum.includes(null)
        ) {
          prop = { ...prop, enum: [...prop.enum, null] }
        }

        if (isSchemaObject(prop) && prop.anyOf) {
          // A genuine null branch can use type, enum, or const. Only add a
          // provider omission marker when the original union rejected null.
          if (!acceptsNull(prop)) {
            prop = { ...prop, anyOf: [...prop.anyOf, { type: 'null' }] }
          }
        } else if (
          isSchemaObject(prop) &&
          prop.type &&
          !Array.isArray(prop.type)
        ) {
          prop = { ...prop, type: [prop.type, 'null'] }
        } else if (
          isSchemaObject(prop) &&
          Array.isArray(prop.type) &&
          !prop.type.includes('null')
        ) {
          prop = { ...prop, type: [...prop.type, 'null'] }
        }

        widenedHere = !originallyAcceptedNull && acceptsNull(prop)
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
    result.required = allPropertyNames
    result.additionalProperties = false
    if (Object.keys(propertyMaps).length > 0) {
      nullWideningMap.properties = propertyMaps
    }
  }

  if (result.type === 'array' && result.items) {
    const nested = coerceStrictSchema(result.items, result.items.required || [])
    result.items = nested.schema
    if (nested.nullWideningMap) {
      nullWideningMap.items = nested.nullWideningMap
    }
    hasUntrackableAnyOfWidening ||= nested.hasUntrackableAnyOfWidening
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
    throw new Error(
      'oneOf is not supported in OpenAI structured output schemas. Check the supported outputs here: https://platform.openai.com/docs/guides/structured-outputs#supported-types',
    )
  }

  return {
    schema: result,
    nullWideningMap: pruneMap(nullWideningMap),
    hasUntrackableAnyOfWidening,
  }
}
