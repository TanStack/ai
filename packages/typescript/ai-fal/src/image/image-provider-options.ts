import type { FalModelImageSize, FalModelImageSizeInput } from '../model-meta'

export function mapSizeToFalFormat<TModel extends string>(
  size: FalModelImageSize<TModel> | undefined,
): FalModelImageSizeInput<TModel> | undefined {
  if (!size) return undefined

  // "16:9_4K" → { aspect_ratio, resolution }
  // "16:9"    → { aspect_ratio }
  // no match  → { image_size }
  if (typeof size === 'string') {
    const match = size.match(/^(\d+:\d+)(?:_(.+))?$/)
    if (match) {
      return {
        aspect_ratio: match[1],
        ...(match[2] ? { resolution: match[2] } : {}),
      } as FalModelImageSizeInput<TModel>
    }
  }

  return {
    image_size: size,
  } as FalModelImageSizeInput<TModel>
}
