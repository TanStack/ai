import type { FalModelVideoSize, FalModelVideoSizeInput } from '../model-meta'

export function mapVideoSizeToFalFormat<TModel extends string>(
  size: FalModelVideoSize<TModel> | undefined,
): FalModelVideoSizeInput<TModel> | undefined {
  if (!size) return undefined

  // "16:9_720p" → { aspect_ratio, resolution }
  // "16:9"      → { aspect_ratio }
  const match = (size as string).match(/^(\d+:\d+)(?:_(.+))?$/)
  if (!match) return undefined

  return {
    aspect_ratio: match[1],
    ...(match[2] && { resolution: match[2] }),
  } as unknown as FalModelVideoSizeInput<TModel>
}
