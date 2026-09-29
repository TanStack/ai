/**
 * Pure helpers for `scripts/sync-elevenlabs-models.ts`.
 *
 * Text-to-speech ids come from the modelschemas model list. Music, sound
 * effects, and voice design come from request-schema `model_id` enums.
 * Transcription has no enum there.
 */

const SAFE_ID = /^[a-z0-9_]+$/

export interface ElevenLabsCatalogModel {
  rawId?: unknown
  firstSeenAt?: unknown
  deprecatedAt?: unknown
  capabilities?: {
    canDoTextToSpeech?: unknown
  } | null
}

/**
 * Text-to-speech ids, newest first. Voice-conversion-only rows and rows
 * modelschemas has marked deprecated are omitted. Ids that are not a safe
 * token are omitted so they cannot be written into source.
 */
function isListedTtsModel(
  model: ElevenLabsCatalogModel,
): model is ElevenLabsCatalogModel & { rawId: string } {
  return (
    model.capabilities?.canDoTextToSpeech === true &&
    model.deprecatedAt == null &&
    typeof model.rawId === 'string' &&
    SAFE_ID.test(model.rawId)
  )
}

export function ttsModelIdsFromCatalog(
  models: readonly ElevenLabsCatalogModel[],
): Array<string> {
  return models
    .filter(isListedTtsModel)
    .slice()
    .sort((a, b) => {
      const aSeen = typeof a.firstSeenAt === 'number' ? a.firstSeenAt : 0
      const bSeen = typeof b.firstSeenAt === 'number' ? b.firstSeenAt : 0
      if (aSeen !== bSeen) return bSeen - aSeen
      return a.rawId.localeCompare(b.rawId)
    })
    .map((model) => model.rawId)
}

interface JsonSchema {
  enum?: unknown
  $ref?: unknown
  properties?: Record<string, JsonSchema> | null
  $defs?: Record<string, JsonSchema> | null
  'x-fern-enum'?: Record<string, { deprecated?: unknown }> | null
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Current `model_id` values from a modelschemas input schema.
 * Enum order is oldest-first, so the result is reversed.
 * `x-fern-enum` entries marked deprecated are omitted.
 *
 * ponytail: reverse the enum. Sort by a real timestamp if a schema stops
 * listing the newest id last.
 */
export function modelIdsFromRequestSchema(schema: unknown): Array<string> {
  if (!isSchema(schema)) {
    throw new Error('modelschemas schema is not an object')
  }
  const modelId = schema.properties?.model_id
  if (!isSchema(modelId)) {
    throw new Error('modelschemas schema has no model_id')
  }
  const target = resolveRef(schema, modelId)
  if (!Array.isArray(target.enum) || target.enum.length === 0) {
    throw new Error('modelschemas model_id has no enum')
  }
  const deprecated = new Set(
    Object.entries(target['x-fern-enum'] ?? {})
      .filter(([, entry]) => entry?.deprecated === true)
      .map(([name]) => name),
  )
  const ids: Array<string> = []
  for (const value of target.enum) {
    if (typeof value !== 'string' || !SAFE_ID.test(value)) {
      throw new Error(
        `Refusing to insert ElevenLabs model id: ${String(value)}`,
      )
    }
    if (!deprecated.has(value)) ids.push(value)
  }
  if (ids.length === 0) {
    throw new Error('modelschemas model_id enum has no current ids')
  }
  return ids.reverse()
}

function resolveRef(root: JsonSchema, node: JsonSchema): JsonSchema {
  if (typeof node.$ref !== 'string') return node
  if (!node.$ref.startsWith('#/$defs/')) {
    throw new Error(`Unsupported schema $ref: ${node.$ref}`)
  }
  const name = node.$ref.slice('#/$defs/'.length)
  const target = root.$defs?.[name]
  if (!isSchema(target)) {
    throw new Error(`schema $ref not found: ${node.$ref}`)
  }
  return target
}

/**
 * Prepend ids that are not already in the named `export const` array.
 * Existing rows, including deprecated ones the catalog dropped, stay put.
 *
 * ponytail: prepend only. A newly seen id that is older than rows we already
 * list lands above them. Sort the whole array if that order starts to matter.
 */
export function insertMissingModels(
  source: string,
  exportName: string,
  orderedIds: readonly string[],
): string {
  const marker = `export const ${exportName} = [`
  const start = source.indexOf(marker)
  if (start < 0) {
    throw new Error(`${exportName} array not found`)
  }
  const open = start + marker.length
  const close = source.indexOf('] as const', open)
  if (close < 0) {
    throw new Error(exportName + ' array is not closed with `] as const`')
  }
  const existing = new Set(
    [...source.slice(open, close).matchAll(/'([a-z0-9_]+)'/g)].map(
      (match) => match[1],
    ),
  )
  const missing: Array<string> = []
  for (const id of orderedIds) {
    if (!SAFE_ID.test(id)) {
      throw new Error(`Refusing to insert ElevenLabs model id: ${id}`)
    }
    if (!existing.has(id) && !missing.includes(id)) missing.push(id)
  }
  if (missing.length === 0) return source
  const lines = missing.map((id) => `  '${id}',`).join('\n')
  return `${source.slice(0, open)}\n${lines}${source.slice(open)}`
}
