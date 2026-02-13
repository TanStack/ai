import type {
  FalModelInput,
  FalModelVideoSize,
  FalModelVideoSizeInput,
} from '../model-meta'

export function mapVideoSizeToFalFormat<TModel extends string>(
  size: FalModelVideoSize<TModel> | undefined,
): FalModelVideoSizeInput<TModel> | undefined {
  if (!size) return undefined

  // "16:9_720p" → { aspect_ratio, resolution }
  // "16:9"      → { aspect_ratio }
  const match = size.match(/^(\d+:\d+)(?:_(.+))?$/)

  return {
    aspect_ratio: match?.[1] as NonNullable<
      FalModelInput<TModel>['aspect_ratio']
    >,
    ...(match?.[2] && {
      resolution: match[2] as NonNullable<FalModelInput<TModel>['resolution']>,
    }),
  } as FalModelVideoSizeInput<TModel>
}
