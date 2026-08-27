import type { EmbeddingInputItem, ImagePart } from '../types'

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

export function resolveEmbeddingInput(
  input: Array<EmbeddingInputItem>,
): Array<ResolvedEmbeddingItem> {
  return input.map(resolveItem)
}

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

export function countEmbeddingInputModalities(
  input: Array<EmbeddingInputItem>,
): { textInputCount: number; imageInputCount: number } {
  let textInputCount = 0
  let imageInputCount = 0
  const items = resolveEmbeddingInput(input)
  for (const item of items) {
    if (item.images.length > 0) imageInputCount++
    else textInputCount++
  }
  return { textInputCount, imageInputCount }
}
