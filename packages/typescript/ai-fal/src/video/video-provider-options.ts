import type { DurationOptions } from '@tanstack/ai/adapters'
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
    } as FalModelVideoSizeInput<TModel>
  }

  if (size.includes(':')) {
    return { aspect_ratio: size } as FalModelVideoSizeInput<TModel>
  }

  return { resolution: size } as FalModelVideoSizeInput<TModel>
}

/**
 * Curated map of per-model duration options for popular fal.ai video models.
 * Values were sourced from the fal.ai client's EndpointTypeMap input types.
 *
 * Models not listed here fall back to `{ kind: 'none' }` — honest "we don't
 * know" rather than guessing. The type-level `FalModelVideoDuration<TModel>`
 * still derives from the SDK types so autocomplete works for unknown models.
 *
 * When `@tanstack/ai-schemas` ships FAL endpoint coverage (post-#622 with
 * `FAL_KEY` configured in CI), we can replace this map with a schema-derived
 * lookup. The public API doesn't change.
 */
const FAL_VIDEO_DURATIONS: Readonly<
  Record<string, DurationOptions<string | number | undefined>>
> = {
  'fal-ai/kling-video/v1.6/standard/text-to-video': {
    kind: 'discrete',
    values: ['5', '10'],
  },
  'fal-ai/kling-video/v1.6/pro/text-to-video': {
    kind: 'discrete',
    values: ['5', '10'],
  },
  'fal-ai/pika/v2.2/text-to-video': {
    kind: 'discrete',
    values: ['5', '10'],
  },
  'fal-ai/luma-dream-machine/ray-2': {
    kind: 'discrete',
    values: ['5s', '9s'],
  },
  'fal-ai/veo3': {
    kind: 'discrete',
    values: ['4s', '6s', '8s'],
  },
  'fal-ai/veo3/image-to-video': {
    kind: 'discrete',
    values: ['4s', '6s', '8s'],
  },
  'fal-ai/wan-25-preview/text-to-video': {
    kind: 'discrete',
    values: ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
  },
  'fal-ai/minimax/video-01': { kind: 'none' },
  'fal-ai/hunyuan-video-v1.5/text-to-video': { kind: 'none' },
}

export function getFalVideoDurationOptions(
  model: string,
): DurationOptions<string | number | undefined> {
  return FAL_VIDEO_DURATIONS[model] ?? { kind: 'none' }
}
