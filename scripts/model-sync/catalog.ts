/**
 * modelschemas catalog rows for native-provider model-meta inserts.
 *
 * Native catalogs have the provider's own ids and activity. OpenRouter
 * rows on modelschemas supply pricing, modalities, and supported_parameters
 * when the native row leaves those fields empty.
 */

import { toModelConstName, toNativeProviderId } from './ids'
import type { SyncedProvider } from './provider-supports'

export const OPENROUTER_PREFIX: Partial<Record<SyncedProvider, string>> = {
  openai: 'openai/',
  anthropic: 'anthropic/',
  gemini: 'google/',
  grok: 'x-ai/',
  groq: 'groq/',
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

export interface CatalogPricing {
  prompt: string | undefined
  completion: string | undefined
  input_cache_read: string | undefined
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
}

export interface SyncModel {
  nativeId: string
  firstSeenAt: number | null
  contextWindow: number | null
  maxOutput: number | null
  inputModalities: Array<string>
  outputModalities: Array<string>
  pricing: CatalogPricing
  supportedParameters: Array<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asSupportedParameters(value: unknown): Array<string> {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
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
  if (!isRecord(value)) {
    return {
      prompt: undefined,
      completion: undefined,
      input_cache_read: undefined,
    }
  }
  return {
    prompt: typeof value.prompt === 'string' ? value.prompt : undefined,
    completion:
      typeof value.completion === 'string' ? value.completion : undefined,
    input_cache_read:
      typeof value.input_cache_read === 'string'
        ? value.input_cache_read
        : undefined,
  }
}

export function parseCatalogModel(value: unknown): CatalogModel | null {
  if (!isRecord(value)) return null
  if (typeof value.rawId !== 'string' || value.rawId.length === 0) return null
  const modalities = isRecord(value.modalities) ? value.modalities : null
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
  }
}

export function parseCatalogModels(data: unknown): Array<CatalogModel> {
  const record = isRecord(data) ? data : null
  const rows = Array.isArray(record?.models)
    ? record.models
    : Array.isArray(data)
      ? data
      : []
  const models: Array<CatalogModel> = []
  for (const row of rows) {
    const parsed = parseCatalogModel(row)
    if (parsed) models.push(parsed)
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
    const undated = native.rawId.replace(/-\d{8}$/, '')
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

function pickNumber(
  preferred: number | null,
  fallback: number | null,
): number | null {
  return preferred ?? fallback
}

function pickList(
  preferred: Array<string>,
  fallback: Array<string>,
): Array<string> {
  return preferred.length > 0 ? preferred : fallback
}

export function toSyncModel(
  native: CatalogModel,
  enrich: CatalogModel | undefined,
  provider: SyncedProvider,
): SyncModel {
  const src = enrich ?? native
  return {
    nativeId: toNativeProviderId(native.rawId, provider),
    firstSeenAt: native.firstSeenAt,
    contextWindow: pickNumber(src.contextWindow, native.contextWindow),
    maxOutput: pickNumber(src.maxOutput, native.maxOutput),
    inputModalities: pickList(src.inputModalities, native.inputModalities),
    outputModalities: pickList(src.outputModalities, native.outputModalities),
    pricing:
      src.pricing.prompt != null || src.pricing.completion != null
        ? src.pricing
        : native.pricing,
    supportedParameters:
      src.capabilities.length > 0 ? src.capabilities : native.capabilities,
  }
}

export function matchesSkipPattern(
  rawId: string,
  patterns: Array<string>,
): boolean {
  return patterns.some((pattern) => rawId.startsWith(pattern))
}

export function isNonChatFamily(rawId: string): boolean {
  if (rawId.includes('transcribe')) return true
  return NON_CHAT_MODEL_PREFIXES.some((prefix) => rawId.startsWith(prefix))
}

export function isDatedAnthropicSnapshot(rawId: string): boolean {
  return /-\d{8}$/.test(rawId)
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
  acceptedActivities: Array<string | null> = ['chat'],
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

/** ElevenLabs STS / voice-conversion ids have no TanStack adapter. */
export function elevenLabsIdArray(
  rawId: string,
): 'tts' | 'audio' | 'transcription' | null {
  if (rawId.includes('_sts_')) return null
  if (rawId.startsWith('scribe')) return 'transcription'
  if (rawId.includes('text_to_sound') || rawId === 'music_v1') return 'audio'
  if (rawId.startsWith('eleven_')) return 'tts'
  return null
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
