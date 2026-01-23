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
}

/**
 * Flattens Gemini's ModalityTokenCount array into individual token fields.
 * Extracts TEXT, IMAGE, AUDIO, VIDEO modality counts into a normalized structure.
 */
export function flattenModalityTokenCounts(
  modalities?: Array<ModalityTokenCount>,
): FlattenedModalityTokens {
  if (!modalities || modalities.length === 0) {
    return {}
  }

  const result: FlattenedModalityTokens = {}

  for (const item of modalities) {
    if (!item.modality || item.tokenCount === undefined) {
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
    tokens.videoTokens !== undefined
  )
}

/**
 * Gemini-specific provider usage details.
 * These fields are unique to Gemini and placed in providerUsageDetails.
 */
export interface GeminiProviderUsageDetails {
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
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown
}

/**
 * Build normalized TokenUsage from Gemini's usageMetadata.
 * Handles modality breakdowns and thinking tokens.
 */
export function buildGeminiUsage(
  usageMetadata: GenerateContentResponseUsageMetadata | undefined,
): TokenUsage {
  const result = buildBaseUsage({
    promptTokens: usageMetadata?.promptTokenCount ?? 0,
    completionTokens: usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens: usageMetadata?.totalTokenCount ?? 0,
  })

  // Add prompt token details
  // Flatten modality breakdown for prompt
  const promptModalities = flattenModalityTokenCounts(
    usageMetadata?.promptTokensDetails,
  )
  const cachedTokens = usageMetadata?.cachedContentTokenCount

  const promptTokensDetails = {
    ...(hasModalityTokens(promptModalities) ? promptModalities : {}),
    ...(cachedTokens !== undefined && cachedTokens > 0 ? { cachedTokens } : {}),
  }

  // Add completion token details
  // Flatten modality breakdown for candidates (output)
  const completionModalities = flattenModalityTokenCounts(
    usageMetadata?.candidatesTokensDetails,
  )
  const thoughtsTokens = usageMetadata?.thoughtsTokenCount

  const completionTokensDetails = {
    ...(hasModalityTokens(completionModalities) ? completionModalities : {}),
    // Map thoughtsTokenCount to reasoningTokens for consistency with OpenAI
    ...(thoughtsTokens !== undefined && thoughtsTokens > 0
      ? { reasoningTokens: thoughtsTokens }
      : {}),
  }

  // Add provider-specific details
  const providerDetails: GeminiProviderUsageDetails = {
    ...(usageMetadata?.trafficType
      ? { trafficType: usageMetadata.trafficType }
      : {}),
    ...(usageMetadata?.toolUsePromptTokenCount !== undefined &&
    usageMetadata.toolUsePromptTokenCount > 0
      ? { toolUsePromptTokenCount: usageMetadata.toolUsePromptTokenCount }
      : {}),
    ...(usageMetadata?.toolUsePromptTokensDetails &&
    usageMetadata.toolUsePromptTokensDetails.length > 0
      ? {
          toolUsePromptTokensDetails:
            usageMetadata.toolUsePromptTokensDetails.map((item) => ({
              modality: item.modality || 'UNKNOWN',
              tokenCount: item.tokenCount ?? 0,
            })),
        }
      : {}),
    ...(usageMetadata?.cacheTokensDetails &&
    usageMetadata.cacheTokensDetails.length > 0
      ? {
          cacheTokensDetails: usageMetadata.cacheTokensDetails.map((item) => ({
            modality: item.modality || 'UNKNOWN',
            tokenCount: item.tokenCount ?? 0,
          })),
        }
      : {}),
  }

  // Add prompt token details if available
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }
  // Add provider details if available
  if (Object.keys(providerDetails).length > 0) {
    result.providerUsageDetails = providerDetails
  }
  // Add completion token details if available
  if (Object.keys(completionTokensDetails).length > 0) {
    result.completionTokensDetails = completionTokensDetails
  }

  return result
}
