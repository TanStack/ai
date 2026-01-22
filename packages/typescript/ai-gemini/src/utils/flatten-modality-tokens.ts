import type { ModalityTokenCount } from '@google/genai'

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
 *
 * @param modalities - Array of ModalityTokenCount from Gemini's usage metadata
 * @returns Object with individual token counts for each modality
 *
 * @example
 * ```typescript
 * const flattened = flattenModalityTokenCounts([
 *   { modality: 'TEXT', tokenCount: 100 },
 *   { modality: 'IMAGE', tokenCount: 50 }
 * ]);
 * // Returns: { textTokens: 100, imageTokens: 50 }
 * ```
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
      // Unknown modalities are ignored - they can be captured in providerUsageDetails if needed
    }
  }

  return result
}

/**
 * Checks if a FlattenedModalityTokens object has any values set.
 *
 * @param tokens - The flattened tokens object to check
 * @returns true if any token count is defined, false otherwise
 */
export function hasModalityTokens(tokens: FlattenedModalityTokens): boolean {
  return (
    tokens.textTokens !== undefined ||
    tokens.imageTokens !== undefined ||
    tokens.audioTokens !== undefined ||
    tokens.videoTokens !== undefined
  )
}
