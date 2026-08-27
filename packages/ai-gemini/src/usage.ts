import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type {
  GenerateContentResponseUsageMetadata,
  ModalityTokenCount,
} from '@google/genai'

/**
 * Flattened modality token counts for normalized usage reporting.
 * Maps Gemini's ModalityTokenCount array to individual fields.
 */
export interface FlattenedModalityTokens {
  /** Text tokens */
  textTokens?: number
  /** Image tokens */
  imageTokens?: number
  /** Audio tokens */
  audioTokens?: number
  /** Video tokens */
  videoTokens?: number
  /** Document tokens (e.g. PDF inputs) */
  documentTokens?: number
}

/**
 * Flattens Gemini's ModalityTokenCount array into individual token fields.
 * Extracts TEXT, IMAGE, AUDIO, VIDEO, DOCUMENT modality counts into a
 * normalized structure.
 */
export function flattenModalityTokenCounts(
  modalities?: Array<ModalityTokenCount>,
): FlattenedModalityTokens {
  if (!modalities) {
    return {}
  }
  if (modalities.length === 0) {
    return {}
  }

  const result: FlattenedModalityTokens = {}

  for (const item of modalities) {
    if (!item.modality) {
      continue
    }
    if (item.tokenCount === undefined) {
      continue
    }

    const modality = item.modality.toUpperCase()
    const count = item.tokenCount

    switch (modality) {
      case 'TEXT':
        result.textTokens = (result.textTokens ?? 0) + count
        break
      case 'IMAGE':
        result.imageTokens = (result.imageTokens ?? 0) + count
        break
      case 'AUDIO':
        result.audioTokens = (result.audioTokens ?? 0) + count
        break
      case 'VIDEO':
        result.videoTokens = (result.videoTokens ?? 0) + count
        break
      case 'DOCUMENT':
        result.documentTokens = (result.documentTokens ?? 0) + count
        break
    }
  }

  return result
}

/**
 * Checks if a FlattenedModalityTokens object has any values set.
 */
export function hasModalityTokens(tokens: FlattenedModalityTokens): boolean {
  return (
    tokens.textTokens !== undefined ||
    tokens.imageTokens !== undefined ||
    tokens.audioTokens !== undefined ||
    tokens.videoTokens !== undefined ||
    tokens.documentTokens !== undefined
  )
}

/**
 * Gemini-specific provider usage details.
 * These fields are unique to Gemini and placed in providerUsageDetails.
 */
export type GeminiProviderUsageDetails = {
  /**
     * The traffic type for this request.
     * Can indicate whether request was handled by different service tiers.
     */
  trafficType?: string
  /**
     * Number of tokens in the results from tool executions,
     * which are provided back to the model as input.
     */
  toolUsePromptTokenCount?: number
  /**
     * Detailed breakdown by modality of the token counts from
     * the results of tool executions.
     */
  toolUsePromptTokensDetails?: Array<{
    modality: string
    tokenCount: number
  }>
  /**
     * Detailed breakdown of cache tokens by modality.
     * More granular than the normalized cachedTokens field.
     */
  cacheTokensDetails?: Array<{
    modality: string
    tokenCount: number
  }>
}

function geminiPromptTokensDetails(
  usageMetadata: GenerateContentResponseUsageMetadata,
) {
  const promptModalities = flattenModalityTokenCounts(
    usageMetadata.promptTokensDetails,
  )
  const cachedTokens = usageMetadata.cachedContentTokenCount
  return {
    ...(hasModalityTokens(promptModalities) ? promptModalities : {}),
    ...(cachedTokens !== undefined && cachedTokens > 0 ? { cachedTokens } : {}),
  }
}

function geminiCompletionTokensDetails(
  usageMetadata: GenerateContentResponseUsageMetadata,
) {
  const completionModalities = flattenModalityTokenCounts(
    usageMetadata.candidatesTokensDetails,
  )
  const thoughtsTokens = usageMetadata.thoughtsTokenCount
  return {
    ...(hasModalityTokens(completionModalities) ? completionModalities : {}),
    ...(thoughtsTokens !== undefined && thoughtsTokens > 0
      ? { reasoningTokens: thoughtsTokens }
      : {}),
  }
}

function mapModalityTokenCounts(
  items: Array<{ modality?: string; tokenCount?: number }>,
): Array<{ modality: string; tokenCount: number }> {
  return items.map((item) => ({
    modality: item.modality || 'UNKNOWN',
    tokenCount: item.tokenCount ?? 0,
  }))
}

function geminiProviderDetails(
  usageMetadata: GenerateContentResponseUsageMetadata,
): GeminiProviderUsageDetails {
  return {
    ...(usageMetadata.trafficType
      ? { trafficType: usageMetadata.trafficType }
      : {}),
    ...(usageMetadata.toolUsePromptTokenCount !== undefined &&
    usageMetadata.toolUsePromptTokenCount > 0
      ? { toolUsePromptTokenCount: usageMetadata.toolUsePromptTokenCount }
      : {}),
    ...(usageMetadata.toolUsePromptTokensDetails &&
    usageMetadata.toolUsePromptTokensDetails.length > 0
      ? {
          toolUsePromptTokensDetails: mapModalityTokenCounts(
            usageMetadata.toolUsePromptTokensDetails,
          ),
        }
      : {}),
    ...(usageMetadata.cacheTokensDetails &&
    usageMetadata.cacheTokensDetails.length > 0
      ? {
          cacheTokensDetails: mapModalityTokenCounts(
            usageMetadata.cacheTokensDetails,
          ),
        }
      : {}),
  }
}

/**
 * Build normalized TokenUsage from Gemini's usageMetadata.
 * Handles modality breakdowns and thinking tokens. Returns `undefined` when the
 * provider reported no usage metadata, so callers omit the field rather than
 * fabricating zeroed totals.
 */
export function buildGeminiUsage(
  usageMetadata: GenerateContentResponseUsageMetadata | undefined | null,
): TokenUsage<GeminiProviderUsageDetails> | undefined {
  if (!usageMetadata) return undefined

  const promptTokens = usageMetadata.promptTokenCount ?? 0
  const completionTokens = usageMetadata.candidatesTokenCount ?? 0

  const result = buildBaseUsage<GeminiProviderUsageDetails>({
    promptTokens: promptTokens,
    completionTokens: completionTokens,
    totalTokens:
      usageMetadata.totalTokenCount ?? promptTokens + completionTokens,
  })

  const promptTokensDetails = geminiPromptTokensDetails(usageMetadata)
  const completionTokensDetails = geminiCompletionTokensDetails(usageMetadata)
  const providerDetails = geminiProviderDetails(usageMetadata)

  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }
  if (Object.keys(providerDetails).length > 0) {
    result.providerUsageDetails = providerDetails
  }
  if (Object.keys(completionTokensDetails).length > 0) {
    result.completionTokensDetails = completionTokensDetails
  }

  return result
}
