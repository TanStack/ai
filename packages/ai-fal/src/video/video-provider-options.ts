import { FAL_VIDEO_DURATIONS } from './generated/video-durations'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type {
  FalModelVideoDuration,
  FalModelVideoSize,
  FalModelVideoSizeInput,
} from '../model-meta'

export function mapVideoSizeToFalFormat<TModel extends string>(
  size?: FalModelVideoSize<TModel>,
): FalModelVideoSizeInput<TModel> {
  if (!size) {
    return {} as FalModelVideoSizeInput<TModel>
  }

  if (size.includes('_')) {
    const [aspectRatio, resolution] = size.split('_')
    return {
      aspect_ratio: aspectRatio,
      resolution,
    } as FalModelVideoSizeInput<TModel>
  }

  if (size.includes(':')) {
    return { aspect_ratio: size } as FalModelVideoSizeInput<TModel>
  }

  return { resolution: size } as FalModelVideoSizeInput<TModel>
}

export function getFalVideoDurationOptions<TModel extends string>(
  model: TModel,
): DurationOptions<FalModelVideoDuration<TModel>> {
  // Generated from each endpoint's `duration` input schema. An endpoint
  // that is not listed takes no duration.
  const entry = (FAL_VIDEO_DURATIONS as Record<string, unknown>)[model]
  // The map is keyed by literal ids but the adapter's TModel is an open string;
  // the lookup result can't be correlated by TS, hence the one cast here.
  return (entry ?? { kind: 'none' }) as DurationOptions<
    FalModelVideoDuration<TModel>
  >
}
