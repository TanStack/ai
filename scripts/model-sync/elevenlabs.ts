/**
 * Pure helpers for `scripts/sync-elevenlabs-models.ts`.
 *
 * modelschemas lists ElevenLabs text-to-speech ids. Music, sound effects,
 * transcription, and voice design are not in that catalog.
 */

const SAFE_ID = /^[a-z0-9_]+$/
const TTS_ARRAY = 'export const ELEVENLABS_TTS_MODELS = ['

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

/**
 * Prepend catalog ids that are not already in `ELEVENLABS_TTS_MODELS`.
 * Existing rows, including deprecated ones the catalog dropped, stay put.
 *
 * ponytail: prepend only. A newly seen id that is older than rows we already
 * list lands above them. Sort the whole array if that order starts to matter.
 */
export function insertMissingTtsModels(
  source: string,
  orderedIds: readonly string[],
): string {
  const start = source.indexOf(TTS_ARRAY)
  if (start < 0) {
    throw new Error('ELEVENLABS_TTS_MODELS array not found')
  }
  const open = start + TTS_ARRAY.length
  const close = source.indexOf('] as const', open)
  if (close < 0) {
    throw new Error(
      'ELEVENLABS_TTS_MODELS array is not closed with `] as const`',
    )
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
