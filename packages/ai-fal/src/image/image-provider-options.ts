import type { FalModelImageSize, FalModelImageSizeInput } from '../model-meta'

export function mapSizeToFalFormat<TModel extends string>(
  size: FalModelImageSize<TModel> | undefined,
): FalModelImageSizeInput<TModel> | undefined {
  if (!size) return undefined

  if (typeof size === 'string') {
    if (size.includes('_')) {
      const [first, second] = size.split('_')
      if (first && first.includes(':')) {
        return {
          aspect_ratio: first,
          resolution: second,
        } as FalModelImageSizeInput<TModel>
      }
    } else if (size.includes(':')) {
      return { aspect_ratio: size } as FalModelImageSizeInput<TModel>
    }
  }

  return {
    image_size: size,
  } as FalModelImageSizeInput<TModel>
}
