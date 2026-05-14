import type { FalModelVideoSize, FalModelVideoSizeInput } from '../model-meta'

export function mapVideoSizeToFalFormat<TModel extends string>(
  size: FalModelVideoSize<TModel> | undefined,
): FalModelVideoSizeInput<TModel> | undefined {
  if (!size) return undefined

  // "16:9_720p" → { aspect_ratio, resolution }
  // "16:9"      → { aspect_ratio }
  // "720p"      → { resolution }
  if (size.includes('_')) {
    const [aspect_ratio, resolution] = size.split('_')
    return {
      aspect_ratio,
      resolution,
    } as unknown as FalModelVideoSizeInput<TModel>
  }

  if (size.includes(':')) {
    return { aspect_ratio: size } as unknown as FalModelVideoSizeInput<TModel>
  }

  return { resolution: size } as unknown as FalModelVideoSizeInput<TModel>
}
