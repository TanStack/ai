/**
 * Shared helpers for transforming and merging OpenAPI specs across providers.
 *
 * Ported from fal-ai/fal-js PR #212 and generalised:
 *   - FAL-specific transforms (file-input marking, KNOWN_MISSING_SCHEMAS
 *     placeholders) are now opt-in per provider via TransformOptions.
 *   - mergeOpenAPISpecs handles the N:1 case (one spec per model, merge by
 *     hash with conflict renames) but also passes a single spec straight
 *     through, which is the common case for providers with one OpenAPI doc.
 */

import { createHash } from 'node:crypto'

import type { Activity, ProviderCategorySpec } from './providers.js'

/**
 * Known schema names that providers reference via $ref but don't define in
 * components.schemas. We inject placeholders before @hey-api/openapi-ts parses
 * the spec (it fails on missing $refs). Keys are provider:schemaName.
 */
const KNOWN_MISSING_SCHEMAS: Record<string, object> = {
  'fal:TrackPoint': {
    type: 'object',
    description: 'A coordinate point with x and y values for motion tracking',
    properties: {
      x: { type: 'number', description: 'X coordinate' },
      y: { type: 'number', description: 'Y coordinate' },
    },
    required: ['x', 'y'],
  },
}

const FAL_FILE_FIELD_PATTERNS = [
  /_url$/,
  /_urls$/,
  /^image$/,
  /^images$/,
  /^video$/,
  /^audio$/,
  /^file$/,
]

function isFalFileField(propertyName: string): boolean {
  return FAL_FILE_FIELD_PATTERNS.some((pattern) => pattern.test(propertyName))
}

function transformToFalFileSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return { ...schema, 'x-fal-file-input': true }
}

/**
 * Coerce default values to match their declared schema type. Some specs
 * declare a property as `type: "string"` but provide a numeric default; that
 * makes Zod codegen emit `.default(129)` on `z.string()` which fails tsc.
 *
 * Also strips `default: null` on non-nullable properties — heyapi's Zod
 * plugin faithfully emits `.optional().default(null)`, which Zod 4's type
 * definitions reject. `default: null` on an optional field carries no extra
 * semantics (both mean "if omitted, the value is absent"), so dropping it
 * is safe and lets the generator emit clean Zod.
 */
function coerceDefaults(spec: object): void {
  const schemas = (
    spec as { components?: { schemas?: Record<string, object> } }
  ).components?.schemas
  if (!schemas) return
  for (const schema of Object.values(schemas)) {
    coerceOrDropDefault(schema as Record<string, unknown>)
    coerceDefaultsRecursively(schema)
  }
}

/**
 * Coerce a `default` to match the property's declared type when possible, or
 * drop it when the mismatch can't be safely repaired. The heyapi Zod plugin
 * emits the `default` verbatim, so any mismatch surfaces as a tsc overload
 * error in the generated `zod.gen.ts`.
 */
function coerceOrDropDefault(value: Record<string, unknown>): void {
  if (!('default' in value)) return

  const def = value.default
  const declaredType = value.type
  const enumValues = Array.isArray(value.enum)
    ? (value.enum as Array<unknown>)
    : null

  // Drop `default: null` when the field isn't nullable. `null` on an optional
  // field carries no extra semantics over absence.
  const isNullable =
    value.nullable === true ||
    (Array.isArray(declaredType) &&
      (declaredType as Array<string>).includes('null'))
  if (def === null && !isNullable) {
    delete value.default
    return
  }

  // Defaults stated against enums must be one of the enum members.
  if (enumValues && !enumValues.includes(def)) {
    delete value.default
    return
  }

  // Primitive coercions — straightforward repairs.
  if (declaredType === 'string' && typeof def !== 'string') {
    value.default = String(def)
    return
  }
  if (declaredType === 'integer' && typeof def === 'string') {
    const parsed = parseInt(def, 10)
    if (!isNaN(parsed)) {
      value.default = parsed
      return
    }
    delete value.default
    return
  }
  if (declaredType === 'number' && typeof def === 'string') {
    const parsed = parseFloat(def)
    if (!isNaN(parsed)) {
      value.default = parsed
      return
    }
    delete value.default
    return
  }
  if (declaredType === 'boolean' && typeof def === 'string') {
    value.default = def === 'true'
    return
  }

  // Container-type defaults: drop unless the literal shape matches. We don't
  // try to repair these — a malformed default on an array/object is almost
  // always a spec bug rather than a stale string we can rewrite.
  if (declaredType === 'array' && !Array.isArray(def)) {
    delete value.default
    return
  }
  if (
    declaredType === 'object' &&
    (typeof def !== 'object' || def === null || Array.isArray(def))
  ) {
    delete value.default
    return
  }
}

function coerceDefaultsRecursively(obj: object): void {
  if (typeof obj !== 'object' || obj === null) return
  const schema = obj as Record<string, unknown>

  if (schema.properties && typeof schema.properties === 'object') {
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >
    for (const value of Object.values(properties)) {
      coerceOrDropDefault(value)
      coerceDefaultsRecursively(value)
    }
  }

  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const arr = schema[key]
    if (Array.isArray(arr)) {
      arr.forEach((item) => {
        if (item && typeof item === 'object') {
          coerceDefaultsRecursively(item as object)
        }
      })
    }
  }

  if (schema.items && typeof schema.items === 'object') {
    coerceDefaultsRecursively(schema.items)
  }
}

function transformFalFileFields(spec: object): void {
  const schemas = (
    spec as { components?: { schemas?: Record<string, object> } }
  ).components?.schemas
  if (!schemas) return
  for (const [schemaName, schema] of Object.entries(schemas)) {
    if (!schemaName.endsWith('Input')) continue
    transformPropertiesRecursively(schema)
  }
}

function transformPropertiesRecursively(obj: object): void {
  if (typeof obj !== 'object') return
  const schema = obj as Record<string, unknown>

  if (schema.properties && typeof schema.properties === 'object') {
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >
    for (const [key, value] of Object.entries(properties)) {
      if (isFalFileField(key) && value.type === 'string' && !value.enum) {
        properties[key] = transformToFalFileSchema(value)
      } else if (
        isFalFileField(key) &&
        value.type === 'array' &&
        value.items &&
        typeof value.items === 'object'
      ) {
        const items = value.items as Record<string, unknown>
        if (items.type === 'string' && !items.enum) {
          items['x-fal-file-input'] = true
        }
      }
      transformPropertiesRecursively(value)
    }
  }

  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const arr = schema[key]
    if (Array.isArray(arr)) {
      arr.forEach((item) => {
        if (item && typeof item === 'object') {
          transformPropertiesRecursively(item as object)
        }
      })
    }
  }

  if (schema.items && typeof schema.items === 'object') {
    transformPropertiesRecursively(schema.items)
  }

  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
  ) {
    transformPropertiesRecursively(schema.additionalProperties)
  }
}

function findAllRefs(obj: unknown, refs: Set<string> = new Set()): Set<string> {
  if (!obj || typeof obj !== 'object') return refs
  if (Array.isArray(obj)) {
    obj.forEach((item) => findAllRefs(item, refs))
  } else {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === '$ref' && typeof value === 'string') {
        const match = value.match(/#\/components\/schemas\/(.+)/)
        if (match?.[1]) refs.add(match[1])
      }
      if (typeof value === 'object') {
        findAllRefs(value, refs)
      }
    }
  }
  return refs
}

function resolveMissingRefs(
  spec: object,
  providerId: string,
): { fixed: number; unknown: Array<string> } {
  const typedSpec = spec as {
    components?: { schemas?: Record<string, object> }
  }
  if (!typedSpec.components?.schemas) return { fixed: 0, unknown: [] }

  const allRefs = findAllRefs(spec)
  const existingSchemas = new Set(Object.keys(typedSpec.components.schemas))
  const missingRefs = [...allRefs].filter((ref) => !existingSchemas.has(ref))

  let fixed = 0
  const unknown: Array<string> = []

  for (const missingRef of missingRefs) {
    typedSpec.components.schemas ??= {}
    const knownKey = `${providerId}:${missingRef}`
    if (KNOWN_MISSING_SCHEMAS[knownKey]) {
      typedSpec.components.schemas[missingRef] = KNOWN_MISSING_SCHEMAS[knownKey]
      fixed++
    } else {
      typedSpec.components.schemas[missingRef] = {
        type: 'object',
        description: `Schema referenced but not defined upstream (missing from source OpenAPI spec)`,
        additionalProperties: true,
      }
      unknown.push(missingRef)
    }
  }

  return { fixed, unknown }
}

function hashSchema(schema: object): string {
  const json = JSON.stringify(
    schema,
    Object.keys(schema as Record<string, unknown>).sort(),
  )
  return createHash('sha256').update(json).digest('hex').slice(0, 16)
}

function generateUniqueSchemaName(baseName: string, index: number): string {
  return `${baseName}Type${index}`
}

function rewriteRefs(obj: unknown, mapping: Map<string, string>): void {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    obj.forEach((item) => rewriteRefs(item, mapping))
    return
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string') {
      const match = value.match(/^#\/components\/schemas\/(.+)$/)
      const matched = match?.[1]
      if (matched !== undefined && mapping.has(matched)) {
        ;(obj as Record<string, string>)[key] =
          `#/components/schemas/${mapping.get(matched)}`
      }
    } else if (typeof value === 'object') {
      rewriteRefs(value, mapping)
    }
  }
}

export interface MergedSpec {
  openapi: string
  info: { title: string; version: string }
  components: {
    schemas: Record<string, object>
    securitySchemes: object
  }
  paths: Record<string, object>
  servers: Array<object>
  security: Array<object>
}

export interface TransformOptions {
  /** Provider id (drives KNOWN_MISSING_SCHEMAS lookup). */
  providerId: string
  /** Mark FAL-style file/url fields with `x-fal-file-input`. FAL only. */
  markFalFileFields?: boolean
  /** Inject placeholders for missing $refs. */
  resolveMissingRefs?: boolean
  /** Coerce mismatched defaults (e.g. numeric default on a string field). */
  coerceDefaults?: boolean
}

/** Apply provider-specific pre-processing transforms to one OpenAPI spec. */
export function applyTransforms(spec: object, opts: TransformOptions): void {
  if (opts.resolveMissingRefs ?? true) {
    resolveMissingRefs(spec, opts.providerId)
  }
  if (opts.markFalFileFields) {
    transformFalFileFields(spec)
  }
  if (opts.coerceDefaults ?? true) {
    coerceDefaults(spec)
  }
}

/**
 * Split one merged spec into per-activity specs. Each POST path is classified
 * by the provider's `classify` callback; paths that classify to `null`
 * (platform/admin endpoints) and paths with no POST operation are dropped.
 *
 * Every split keeps the full `components` block — @hey-api/openapi-ts runs
 * with `filters.orphans: false`, so schemas unreachable from a split's paths
 * are pruned from that split's codegen output automatically.
 */
export function splitSpecByActivity(
  merged: MergedSpec,
  classify: (path: string, post: Record<string, unknown>) => Activity | null,
  providerId: string,
): Map<Activity, MergedSpec> {
  const splits = new Map<Activity, MergedSpec>()
  const dropped: Array<string> = []

  for (const [pathKey, pathItem] of Object.entries(merged.paths)) {
    const item = pathItem as {
      post?: Record<string, unknown>
      parameters?: unknown
    }
    if (!item.post) continue
    const activity = classify(pathKey, item.post)
    if (activity === null) {
      dropped.push(pathKey)
      continue
    }
    let split = splits.get(activity)
    if (!split) {
      // Deep-copy `components` — @hey-api/openapi-ts prunes orphaned schemas
      // from the input object in place, and the per-activity jobs run
      // concurrently, so sharing one components object across splits lets
      // one job's pruning break another's $ref resolution.
      split = {
        ...merged,
        components: structuredClone(merged.components),
        paths: {},
      }
      splits.set(activity, split)
    }
    // Carry only the POST operation (plus path-level parameters). Codegen
    // never generates from the other verbs, and their $refs would otherwise
    // dangle once orphan pruning drops the schemas only they reference.
    split.paths[pathKey] = {
      post: item.post,
      ...(item.parameters !== undefined ? { parameters: item.parameters } : {}),
    }
  }

  if (dropped.length > 0) {
    console.log(
      `  ${providerId}: dropped ${dropped.length} platform/unclassified endpoint(s) from generation`,
    )
  }
  for (const [activity, split] of splits) {
    console.log(
      `  ${providerId}/${activity}: ${Object.keys(split.paths).length} endpoint(s)`,
    )
  }

  return splits
}

/**
 * Convenience wrapper for single-spec providers: split a merged spec by
 * activity and shape the result as the (provider, activity) tuples the rest
 * of the pipeline consumes.
 */
export function toActivitySpecs(
  providerId: string,
  merged: MergedSpec,
  classify: (path: string, post: Record<string, unknown>) => Activity | null,
  outputStrategy?: ProviderCategorySpec['outputStrategy'],
): Array<ProviderCategorySpec> {
  return [...splitSpecByActivity(merged, classify, providerId)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([activity, mergedSpec]) => ({
      providerId,
      category: activity,
      mergedSpec,
      ...(outputStrategy ? { outputStrategy } : {}),
    }))
}

/**
 * Merge multiple OpenAPI specs into one. Identical schemas across specs are
 * deduplicated by content hash; conflicting schemas (same name, different
 * shape) get suffixed `Type2`, `Type3`, … with $refs rewritten consistently.
 *
 * The single-spec case is the trivial pass-through.
 */
export function mergeOpenAPISpecs(
  specs: Array<object>,
  title: string,
  endpointIdAccessor?: (spec: object) => string,
): MergedSpec {
  type TypedSpec = {
    components?: { schemas?: Record<string, object>; securitySchemes?: object }
    paths?: Record<string, object>
    servers?: Array<object>
    security?: Array<object>
  }

  const merged: MergedSpec = {
    openapi: '3.0.4',
    info: { title, version: '1.0.0' },
    components: { schemas: {}, securitySchemes: {} },
    paths: {},
    servers: [],
    security: [],
  }

  const getEndpointId = endpointIdAccessor ?? (() => 'unknown')

  const registry = new Map<
    string,
    Map<
      string,
      { schema: object; endpointIds: Array<string>; finalName: string }
    >
  >()

  for (const spec of specs as Array<TypedSpec>) {
    const endpointId = getEndpointId(spec)
    for (const [name, schema] of Object.entries(
      spec.components?.schemas || {},
    )) {
      const hash = hashSchema(schema)
      if (!registry.has(name)) registry.set(name, new Map())
      const hashMap = registry.get(name)!
      if (!hashMap.has(hash)) {
        hashMap.set(hash, { schema, endpointIds: [], finalName: name })
      }
      hashMap.get(hash)!.endpointIds.push(endpointId)
    }
  }

  for (const [baseName, hashMap] of registry) {
    const variants = [...hashMap.values()].sort(
      (a, b) => b.endpointIds.length - a.endpointIds.length,
    )
    variants[0]!.finalName = baseName
    for (let i = 1; i < variants.length; i++) {
      variants[i]!.finalName = generateUniqueSchemaName(baseName, i + 1)
    }
  }

  const refMappings = new Map<string, Map<string, string>>()
  for (const [baseName, hashMap] of registry) {
    for (const variant of hashMap.values()) {
      for (const endpointId of variant.endpointIds) {
        if (!refMappings.has(endpointId)) refMappings.set(endpointId, new Map())
        if (variant.finalName !== baseName) {
          refMappings.get(endpointId)!.set(baseName, variant.finalName)
        }
      }
    }
  }

  for (const hashMap of registry.values()) {
    for (const variant of hashMap.values()) {
      const clonedSchema = structuredClone(variant.schema)
      const firstEndpoint = variant.endpointIds[0]!
      const mapping = refMappings.get(firstEndpoint)
      if (mapping?.size) {
        rewriteRefs(clonedSchema, mapping)
      }
      merged.components.schemas[variant.finalName] = clonedSchema
    }
  }

  for (const spec of specs as Array<TypedSpec>) {
    const endpointId = getEndpointId(spec)
    const mapping = refMappings.get(endpointId)
    for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
      const cloned = structuredClone(pathItem)
      if (mapping?.size) {
        rewriteRefs(cloned, mapping)
      }
      merged.paths[pathKey] = cloned
    }
  }

  const first = specs[0] as TypedSpec | undefined
  if (first?.components?.securitySchemes) {
    merged.components.securitySchemes = structuredClone(
      first.components.securitySchemes,
    )
  }
  if (first?.servers) merged.servers = structuredClone(first.servers)
  if (first?.security) merged.security = structuredClone(first.security)

  merged.paths = Object.fromEntries(
    Object.entries(merged.paths).sort(([a], [b]) => a.localeCompare(b)),
  )
  merged.components.schemas = Object.fromEntries(
    Object.entries(merged.components.schemas).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  )

  return merged
}
