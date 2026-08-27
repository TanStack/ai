import { buildBaseUsage } from '@tanstack/ai'
import type { TokenUsage } from '@tanstack/ai'
import type {
  GenerateContentResponseUsageMetadata,
  ModalityTokenCount,
} from '@google/genai'

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

export function hasModalityTokens(tokens: FlattenedModalityTokens): boolean {
  return (
    tokens.textTokens !== undefined ||
    tokens.imageTokens !== undefined ||
    tokens.audioTokens !== undefined ||
    tokens.videoTokens !== undefined ||
    tokens.documentTokens !== undefined
  )
}

export type GeminiProviderUsageDetails = {
  trafficType?: string
  toolUsePromptTokenCount?: number
  toolUsePromptTokensDetails?: Array<{
    modality: string
    tokenCount: number
  }>
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
