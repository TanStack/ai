/**
 * modelschemas catalog rows for native-provider model-meta inserts.
 *
 * Each provider's own catalog supplies ids, activity, limits, modalities, and
 * capabilities. A field the catalog leaves empty stays empty. There is no
 * second source, and model-meta carries no prices (they change too often to
 * ship in a package).
 */

import { toModelConstName, toNativeProviderId } from './ids'
import type { SyncedProvider } from './provider-supports'

const NON_CHAT_MODEL_PREFIXES = [
  'lyria-',
  'veo-',
  'imagen-',
  'sora-',
  'dall-e-',
  'tts-',
]

const DATED_SNAPSHOT = /-\d{8}$/

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

/**
 * The parameter names a model is stated to support. modelschemas sends a map
 * of flags (`{ tools: true }`): `true` keys only, because an absent key is
 * unknown, not false. BytePlus sends a feature object instead.
 */
function asSupportedParameters(value: unknown): Array<string> {
  if (Array.isArray(value)) return asStringArray(value)
  if (!isRecord(value)) return []
  const flags = Object.entries(value)
  if (flags.every(([, flag]) => typeof flag === 'boolean')) {
    return flags.filter(([, flag]) => flag).map(([name]) => name)
  }
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

export function toSyncModel(
  native: CatalogModel,
  provider: SyncedProvider,
): SyncModel {
  return {
    nativeId: toNativeProviderId(native.rawId, provider),
    contextWindow: native.contextWindow,
    maxOutput: native.maxOutput,
    inputModalities: native.inputModalities,
    outputModalities: native.outputModalities,
    supportedParameters: native.capabilities,
    reasoningMandatory: native.reasoningMandatory,
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
  if (model.inputModalities.length === 0) return 'no modalities'
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
  provider: SyncedProvider
  skipPatterns: Array<string>
  acceptedActivities: Array<string | null>
  cutoffTimestamp: number
}

export interface NativeInsertSelection {
  inserts: Array<{ model: SyncModel; activity: string | null }>
  /** Count of every other skip, by reason. */
  skipped: Record<string, number>
}

/** Pick the catalog rows that become new model-meta constants. */
export function selectNativeInserts(
  rows: Array<CatalogModel>,
  rules: NativeInsertRules,
  isSynced: (nativeId: string) => boolean,
): NativeInsertSelection {
  const selection: NativeInsertSelection = {
    inserts: [],
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
    const model = toSyncModel(row, rules.provider)
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
    selection.inserts.push({ model, activity: row.activity })
  }
  return selection
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
