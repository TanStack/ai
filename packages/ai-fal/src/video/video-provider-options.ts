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

/**
 * Identity helper that checks each entry against the SDK's `duration` union
 * for its own key, so a typo'd endpoint id or a stale union fails to compile.
 */
function durationMap<
  const T extends {
    [K in keyof T & string]: DurationOptions<FalModelVideoDuration<K>>
  },
>(map: T): T {
  return map
}

const KLING_5_10 = { kind: 'discrete', values: ['5', '10'] } as const
const VEO_4_6_8 = { kind: 'discrete', values: ['4s', '6s', '8s'] } as const
const LTX_6_8_10 = { kind: 'discrete', values: ['6', '8', '10'] } as const
const KLING_3_15 = {
  kind: 'discrete',
  values: [
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
  ],
} as const

/**
 * Curated map of per-model duration options for popular fal.ai video models.
 * Values are checked at compile time against `@fal-ai/client`'s
 * `EndpointTypeMap` input types via `durationMap`.
 *
 * Models not listed here fall back to `{ kind: 'none' }` — honest "we don't
 * know" rather than guessing. The type-level `FalModelVideoDuration<TModel>`
 * still derives from the SDK types, so autocomplete works for SDK-known
 * models that aren't curated here.
 */
const FAL_VIDEO_DURATIONS = durationMap({
  'fal-ai/kling-video/v1.6/standard/text-to-video': KLING_5_10,
  'fal-ai/kling-video/v1.6/pro/text-to-video': KLING_5_10,
  'fal-ai/kling-video/v2.6/pro/text-to-video': KLING_5_10,
  'fal-ai/kling-video/v2.6/pro/image-to-video': KLING_5_10,
  'fal-ai/kling-video/v3/pro/text-to-video': KLING_3_15,
  'fal-ai/kling-video/v3/pro/image-to-video': KLING_3_15,
  'fal-ai/pika/v2.2/text-to-video': KLING_5_10,
  'fal-ai/luma-dream-machine/ray-2': {
    kind: 'discrete',
    values: ['5s', '9s'],
  },
  'fal-ai/veo3': VEO_4_6_8,
  'fal-ai/veo3/image-to-video': VEO_4_6_8,
  'fal-ai/veo3.1': VEO_4_6_8,
  'fal-ai/veo3.1/image-to-video': VEO_4_6_8,
  'fal-ai/veo3.1/fast': VEO_4_6_8,
  'fal-ai/veo3.1/fast/image-to-video': VEO_4_6_8,
  'fal-ai/ltx-2.3/text-to-video': LTX_6_8_10,
  'fal-ai/ltx-2.3/text-to-video/fast': LTX_6_8_10,
  'fal-ai/ltx-2.3/image-to-video': LTX_6_8_10,
  'fal-ai/ltx-2.3/image-to-video/fast': LTX_6_8_10,
  'fal-ai/wan-25-preview/text-to-video': {
    kind: 'discrete',
    values: [
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
    ],
  },
  'fal-ai/minimax/video-01': { kind: 'none' },
  'fal-ai/hunyuan-video-v1.5/text-to-video': { kind: 'none' },
})

export function getFalVideoDurationOptions<TModel extends string>(
  model: TModel,
): DurationOptions<FalModelVideoDuration<TModel>> {
  const entry = (FAL_VIDEO_DURATIONS as Record<string, unknown>)[model]
  // The map is keyed by literal ids but the adapter's TModel is an open string;
  // the lookup result can't be correlated by TS, hence the one cast here.
  return (entry ?? { kind: 'none' }) as DurationOptions<
    FalModelVideoDuration<TModel>
  >
}
