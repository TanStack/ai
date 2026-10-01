/**
 * modelschemas catalog rows for native-provider model-meta inserts.
 *
 * Native catalogs supply ids, activity, limits, modalities, pricing, and
 * capabilities. OpenRouter rows on modelschemas fill a field only when the
 * native row left it empty.
 */

import { toModelConstName, toNativeProviderId } from './ids'
import type { ModelMetaProvider, SyncedProvider } from './provider-supports'

export const OPENROUTER_PREFIX: Partial<Record<SyncedProvider, string>> = {
  openai: 'openai/',
  anthropic: 'anthropic/',
  gemini: 'google/',
  grok: 'x-ai/',
  mistral: 'mistralai/',
}

const NON_CHAT_MODEL_PREFIXES = [
  'lyria-',
  'veo-',
  'imagen-',
  'sora-',
  'dall-e-',
  'tts-',
]

const DATED_SNAPSHOT = /-\d{8}$/

/** USD per million tokens, as modelschemas reports it. */
export interface CatalogPricing {
  inputPerMillion: number | undefined
  outputPerMillion: number | undefined
}

export interface CatalogModel {
  provider: string
  rawId: string
  activity: string | null
  firstSeenAt: number | null
  deprecatedAt: number | null
  contextWindow: number | null
  maxOutput: number | null
  inputModalities: Array<string>
  outputModalities: Array<string>
  pricing: CatalogPricing
  capabilities: Array<string>
  /** `reasoning.mandatory`: thinking cannot be turned off (Claude Fable). */
  reasoningMandatory: boolean
}

export interface SyncModel {
  nativeId: string
  contextWindow: number | null
  maxOutput: number | null
  inputModalities: Array<string>
  outputModalities: Array<string>
  pricing: CatalogPricing
  supportedParameters: Array<string>
  reasoningMandatory: boolean
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Most providers list parameter names; BytePlus sends a feature object. */
function asSupportedParameters(value: unknown): Array<string> {
  if (Array.isArray(value)) return asStringArray(value)
  if (!isRecord(value)) return []
  const params: Array<string> = []
  const tools = isRecord(value.tools) ? value.tools : null
  if (tools?.function_calling === true) {
    params.push('tools', 'tool_choice')
  }
  const structured = isRecord(value.structured_outputs)
    ? value.structured_outputs
    : null
  if (structured?.json_schema === true || structured?.json_object === true) {
    params.push('structured_outputs', 'response_format')
  }
  if (
    typeof value.maxReasoningTokens === 'number' &&
    value.maxReasoningTokens > 0
  ) {
    params.push('reasoning', 'include_reasoning')
  }
  return params
}

function asPricing(value: unknown): CatalogPricing {
  const record = isRecord(value) ? value : {}
  return {
    inputPerMillion: asFiniteNumber(record.inputPerMillion) ?? undefined,
    outputPerMillion: asFiniteNumber(record.outputPerMillion) ?? undefined,
  }
}

export function parseCatalogModel(value: unknown): CatalogModel | null {
  if (!isRecord(value)) return null
  if (typeof value.rawId !== 'string' || value.rawId.length === 0) return null
  const modalities = isRecord(value.modalities) ? value.modalities : null
  const reasoning = isRecord(value.reasoning) ? value.reasoning : null
  return {
    provider: typeof value.provider === 'string' ? value.provider : '',
    rawId: value.rawId,
    activity: typeof value.activity === 'string' ? value.activity : null,
    firstSeenAt: asFiniteNumber(value.firstSeenAt),
    deprecatedAt: asFiniteNumber(value.deprecatedAt),
    contextWindow: asFiniteNumber(value.contextWindow),
    maxOutput: asFiniteNumber(value.maxOutput),
    inputModalities: asStringArray(modalities?.input),
    outputModalities: asStringArray(modalities?.output),
    pricing: asPricing(value.pricing),
    capabilities: asSupportedParameters(value.capabilities),
    reasoningMandatory: reasoning?.mandatory === true,
  }
}

/**
 * Parse a `listModels` payload. A changed payload shape must not look like
 * "no new models", and a renamed `firstSeenAt` / `deprecatedAt` must not
 * let the whole historical catalog through the age and deprecation checks.
 */
export function parseCatalogModels(data: unknown): Array<CatalogModel> {
  const rows = isRecord(data) ? data.models : undefined
  if (!Array.isArray(rows)) {
    throw new Error('modelschemas listModels: no models array')
  }
  const models = rows
    .map((row) => parseCatalogModel(row))
    .filter((model): model is CatalogModel => model !== null)
  if (rows.length === 0) return models
  if (models.length === 0) {
    throw new Error(
      `modelschemas listModels: none of ${rows.length} rows has a rawId`,
    )
  }
  if (!models.some((model) => model.firstSeenAt != null)) {
    throw new Error('modelschemas listModels: no row has a firstSeenAt')
  }
  if (!rows.some((row) => isRecord(row) && 'deprecatedAt' in row)) {
    throw new Error('modelschemas listModels: no row has a deprecatedAt key')
  }
  return models
}

/** OpenRouter dots Anthropic version suffixes (`4.5`); native ids use dashes. */
function anthropicOpenRouterId(nativeId: string): string {
  return nativeId.replace(/(\d)-(\d)/g, '$1.$2')
}

export function openRouterRawIdCandidates(
  native: CatalogModel,
  provider: SyncedProvider,
): Array<string> {
  const prefix = OPENROUTER_PREFIX[provider]
  if (!prefix) return []
  const ids = new Set<string>([native.rawId])
  if (provider === 'anthropic') {
    const undated = native.rawId.replace(DATED_SNAPSHOT, '')
    ids.add(undated)
    ids.add(anthropicOpenRouterId(native.rawId))
    ids.add(anthropicOpenRouterId(undated))
  }
  return [...ids].map((id) => prefix + id)
}

export function findOpenRouterEnrichment(
  native: CatalogModel,
  provider: SyncedProvider,
  openrouter: Array<CatalogModel>,
): CatalogModel | undefined {
  const wanted = new Set(openRouterRawIdCandidates(native, provider))
  return openrouter.find((model) => wanted.has(model.rawId))
}

function pickList(
  preferred: Array<string>,
  fallback: Array<string> = [],
): Array<string> {
  return preferred.length > 0 ? preferred : fallback
}

/** Both prices known. OpenAI/Anthropic/Gemini/Grok ModelMeta require both. */
export function hasFullPricing(pricing: CatalogPricing): boolean {
  return pricing.inputPerMillion != null && pricing.outputPerMillion != null
}

/** Strips float noise: 0.09999999999999999 → 0.1. */
function roundPrice(price: number): number {
  return Math.round(price * 1e10) / 1e10
}

/**
 * The `pricing` block of a generated model constant. A price the catalog
 * does not have is left out, not written as `0` (which reads as "free").
 */
// ponytail: modelschemas has no cached-input price, so `cached` is never written.
export function pricingLines(pricing: CatalogPricing): Array<string> {
  const lines = [`  pricing: {`]
  if (pricing.inputPerMillion != null) {
    lines.push(
      `    input: {`,
      `      normal: ${roundPrice(pricing.inputPerMillion)},`,
      `    },`,
    )
  }
  if (pricing.outputPerMillion != null) {
    lines.push(
      `    output: {`,
      `      normal: ${roundPrice(pricing.outputPerMillion)},`,
      `    },`,
    )
  }
  lines.push(`  },`)
  return lines
}

export function toSyncModel(
  native: CatalogModel,
  enrich: CatalogModel | undefined,
  provider: SyncedProvider,
): SyncModel {
  return {
    nativeId: toNativeProviderId(native.rawId, provider),
    contextWindow: native.contextWindow ?? enrich?.contextWindow ?? null,
    maxOutput: native.maxOutput ?? enrich?.maxOutput ?? null,
    inputModalities: pickList(native.inputModalities, enrich?.inputModalities),
    outputModalities: pickList(
      native.outputModalities,
      enrich?.outputModalities,
    ),
    // Per side, so a native input price does not hide OpenRouter's output price.
    pricing: {
      inputPerMillion:
        native.pricing.inputPerMillion ?? enrich?.pricing.inputPerMillion,
      outputPerMillion:
        native.pricing.outputPerMillion ?? enrich?.pricing.outputPerMillion,
    },
    supportedParameters: pickList(native.capabilities, enrich?.capabilities),
    reasoningMandatory:
      native.reasoningMandatory || enrich?.reasoningMandatory === true,
  }
}

export function matchesSkipPattern(
  rawId: string,
  patterns: Array<string>,
): boolean {
  return patterns.some((pattern) => rawId.startsWith(pattern))
}

export function isNonChatFamily(rawId: string): boolean {
  return (
    rawId.includes('transcribe') ||
    matchesSkipPattern(rawId, NON_CHAT_MODEL_PREFIXES)
  )
}

export function isDatedAnthropicSnapshot(rawId: string): boolean {
  return DATED_SNAPSHOT.test(rawId)
}

export function hasImageOutput(model: {
  activity: string | null
  outputModalities: Array<string>
}): boolean {
  return model.activity === 'image' || model.outputModalities.includes('image')
}

export function outputsText(
  model: SyncModel,
  activity: string | null,
): boolean {
  if (model.outputModalities.includes('text')) return true
  if (
    model.outputModalities.includes('image') ||
    model.outputModalities.includes('video')
  ) {
    return false
  }
  return (
    model.outputModalities.length === 0 &&
    (activity === 'chat' || activity === null)
  )
}

/**
 * Why this native row should not be inserted. `null` means keep going.
 */
export function skipNativeModelReason(
  model: CatalogModel,
  provider: SyncedProvider,
  skipPatterns: Array<string>,
  cutoffTimestamp: number,
  acceptedActivities: Array<string | null>,
): string | null {
  if (model.deprecatedAt != null) return 'deprecated'
  if (!acceptedActivities.includes(model.activity)) {
    return `activity ${model.activity}`
  }
  if (model.rawId.includes(':')) return 'routing variant'
  if (isNonChatFamily(model.rawId)) return 'non-chat family'
  if (matchesSkipPattern(model.rawId, skipPatterns)) return 'skip pattern'
  if (provider === 'anthropic' && isDatedAnthropicSnapshot(model.rawId)) {
    return 'dated snapshot'
  }
  if (model.firstSeenAt != null && model.firstSeenAt < cutoffTimestamp) {
    return 'too old'
  }
  return null
}

export interface NativeInsertRules {
  provider: ModelMetaProvider
  skipPatterns: Array<string>
  acceptedActivities: Array<string | null>
  /**
   * Hold a native id back until the modelschemas OpenRouter catalog has a
   * matching row and both prices are known (from either row). The
   * OpenAI/Anthropic/Gemini/Grok ModelMeta types require both prices.
   */
  requireOpenRouterEnrich: boolean
  cutoffTimestamp: number
}

export interface NativeInsertSelection {
  inserts: Array<{ model: SyncModel; activity: string | null }>
  /** Raw ids skipped only because the price gate is not met yet. */
  heldBack: Array<string>
  /** Count of every other skip, by reason. */
  skipped: Record<string, number>
}

/** Pick the catalog rows that become new model-meta constants. */
export function selectNativeInserts(
  rows: Array<CatalogModel>,
  rules: NativeInsertRules,
  openrouter: Array<CatalogModel>,
  isSynced: (nativeId: string) => boolean,
): NativeInsertSelection {
  const selection: NativeInsertSelection = {
    inserts: [],
    heldBack: [],
    skipped: {},
  }
  const skip = (reason: string) => {
    selection.skipped[reason] = (selection.skipped[reason] ?? 0) + 1
  }
  for (const row of rows) {
    const reason = skipNativeModelReason(
      row,
      rules.provider,
      rules.skipPatterns,
      rules.cutoffTimestamp,
      rules.acceptedActivities,
    )
    if (reason) {
      skip(reason)
      continue
    }
    const enrich = findOpenRouterEnrichment(row, rules.provider, openrouter)
    const model = toSyncModel(row, enrich, rules.provider)
    if (isSynced(model.nativeId)) {
      skip('already synced')
      continue
    }
    if (
      hasImageOutput({
        activity: row.activity,
        outputModalities: model.outputModalities,
      })
    ) {
      skip('image output')
      continue
    }
    if (
      rules.requireOpenRouterEnrich &&
      !(enrich && hasFullPricing(model.pricing))
    ) {
      selection.heldBack.push(row.rawId)
      continue
    }
    selection.inserts.push({ model, activity: row.activity })
  }
  return selection
}

export const ELEVENLABS_ID_ARRAYS = [
  'ELEVENLABS_TTS_MODELS',
  'ELEVENLABS_AUDIO_MODELS',
  'ELEVENLABS_TRANSCRIPTION_MODELS',
  'ELEVENLABS_VOICE_MODELS',
] as const

type ElevenLabsIdArray = (typeof ELEVENLABS_ID_ARRAYS)[number]

/**
 * Which ElevenLabs id array a raw id belongs in. STS / voice-conversion ids
 * have no TanStack adapter, so they get `null`.
 */
export function elevenLabsIdArray(rawId: string): ElevenLabsIdArray | null {
  if (rawId.includes('_sts_')) return null
  if (rawId.includes('_ttv_')) return 'ELEVENLABS_VOICE_MODELS'
  if (rawId.startsWith('scribe')) return 'ELEVENLABS_TRANSCRIPTION_MODELS'
  if (rawId.includes('text_to_sound') || rawId.startsWith('music_')) {
    return 'ELEVENLABS_AUDIO_MODELS'
  }
  if (rawId.startsWith('eleven_')) return 'ELEVENLABS_TTS_MODELS'
  return null
}

/** New ElevenLabs ids per array. An id is added at most once. */
export function selectElevenLabsInserts(
  rows: Array<CatalogModel>,
  cutoffTimestamp: number,
  existingIds: Set<string>,
): Record<ElevenLabsIdArray, Array<string>> {
  const byArray: Record<ElevenLabsIdArray, Array<string>> = {
    ELEVENLABS_TTS_MODELS: [],
    ELEVENLABS_AUDIO_MODELS: [],
    ELEVENLABS_TRANSCRIPTION_MODELS: [],
    ELEVENLABS_VOICE_MODELS: [],
  }
  const seen = new Set(existingIds)
  for (const row of rows) {
    if (
      skipNativeModelReason(row, 'elevenlabs', [], cutoffTimestamp, ['audio'])
    ) {
      continue
    }
    const arrayName = elevenLabsIdArray(row.rawId)
    if (!arrayName || seen.has(row.rawId)) continue
    byArray[arrayName].push(row.rawId)
    seen.add(row.rawId)
  }
  return byArray
}

export function alreadySynced(
  nativeId: string,
  existingIds: Set<string>,
  existingConstNames: Set<string>,
): boolean {
  const normalized = nativeId.replaceAll('.', '-')
  return (
    existingIds.has(normalized) ||
    existingConstNames.has(toModelConstName(nativeId))
  )
}
