import type { EmbeddingInputItem, ImagePart } from '../types'

/**
 * One embedding input item resolved into its text and image constituents.
 * Produced by {@link resolveEmbeddingInput}; adapters map each entry onto
 * one provider-native input (one vector per entry).
 */
export interface ResolvedEmbeddingItem {
  /** Text contents of the item, in order (empty for image-only items) */
  texts: Array<string>
  /** Image parts of the item, in order (empty for text-only items) */
  images: Array<ImagePart>
}

function resolveItem(item: EmbeddingInputItem): ResolvedEmbeddingItem {
  if (typeof item === 'string') {
    return { texts: [item], images: [] }
  }
  // A nested array is a fused item: its parts embed together into one vector.
  if (Array.isArray(item)) {
    const resolved: ResolvedEmbeddingItem = { texts: [], images: [] }
    for (const part of item) {
      if (part.type === 'text') {
        resolved.texts.push(part.content)
      } else {
        resolved.images.push(part)
      }
    }
    return resolved
  }
  if (item.type === 'text') {
    return { texts: [item.content], images: [] }
  }
  return { texts: [], images: [item] }
}

/**
 * Resolve each embedding input item into its text and image constituents,
 * preserving input order (result[i] corresponds to input[i] and to the
 * vector at index i).
 */
export function resolveEmbeddingInput(
  input: Array<EmbeddingInputItem>,
): Array<ResolvedEmbeddingItem> {
  return input.map(resolveItem)
}

/**
 * Extract plain text inputs for a text-only embedding model, throwing a
 * uniform error if any item carries an image. The per-model modality typing
 * rejects these at compile time; this guard covers untyped/dynamic callers.
 */
export function requireTextOnlyEmbeddingInput(
  input: Array<EmbeddingInputItem>,
  provider: string,
  model: string,
): Array<string> {
  return resolveEmbeddingInput(input).map((item, index) => {
    if (item.images.length > 0) {
      throw new Error(
        `${provider} model "${model}" only supports text embedding inputs; ` +
          `input item at index ${index} contains an image part`,
      )
    }
    return item.texts.join('\n')
  })
}

/**
 * Count text-only and image-carrying items for observability events. Never
 * exposes input content.
 */
export function countEmbeddingInputModalities(
  input: Array<EmbeddingInputItem>,
): { textInputCount: number; imageInputCount: number } {
  let textInputCount = 0
  let imageInputCount = 0
  for (const item of resolveEmbeddingInput(input)) {
    if (item.images.length > 0) imageInputCount++
    else textInputCount++
  }
  return { textInputCount, imageInputCount }
}
