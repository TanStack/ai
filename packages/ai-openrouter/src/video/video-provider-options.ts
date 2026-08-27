import { OPENROUTER_VIDEO_MODEL_META } from '../model-meta'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type { VideoGenerationRequestProvider } from '@openrouter/sdk/models'
import type { OPENROUTER_VIDEO_MODELS } from '../model-meta'

export type OpenRouterVideoModel = (typeof OPENROUTER_VIDEO_MODELS)[number]

type VideoMeta = typeof OPENROUTER_VIDEO_MODEL_META

type ElementOf<T, TFallback> = T extends ReadonlyArray<infer U> ? U : TFallback

export interface OpenRouterVideoModelMeta {
  name: string
  durations: ReadonlyArray<number> | null
  resolutions: ReadonlyArray<string> | null
  aspectRatios: ReadonlyArray<string> | null
  frameImages: ReadonlyArray<string> | null
  sizes: ReadonlyArray<string> | null
  generateAudio: boolean | null
  seed: boolean | null
}

const VIDEO_MODEL_META: Record<string, OpenRouterVideoModelMeta> =
  OPENROUTER_VIDEO_MODEL_META

/** Capability metadata for a video model, or undefined when unknown. */
export function getVideoModelMeta(
  model: string,
): OpenRouterVideoModelMeta | undefined {
  return VIDEO_MODEL_META[model]
}

export interface OpenRouterVideoCommonOptions {
  callbackUrl?: string
  provider?: VideoGenerationRequestProvider
}

export interface OpenRouterVideoProviderOptions extends OpenRouterVideoCommonOptions {
  /** Resolution of the generated video (e.g. '720p', '1080p'). */
  resolution?: string
  /** Aspect ratio of the generated video (e.g. '16:9', '9:16'). */
  aspectRatio?: string
  seed?: number
  generateAudio?: boolean
}

export type OpenRouterVideoProviderOptionsFor<TModel extends string> =
  OpenRouterVideoCommonOptions &
    (TModel extends keyof VideoMeta
      ? {
          resolution?: ElementOf<VideoMeta[TModel]['resolutions'], string>
          aspectRatio?: ElementOf<VideoMeta[TModel]['aspectRatios'], string>
        } & (VideoMeta[TModel]['seed'] extends false
          ? unknown
          : { seed?: number }) &
          (VideoMeta[TModel]['generateAudio'] extends false
            ? unknown
            : { generateAudio?: boolean })
      : OpenRouterVideoProviderOptions)

/** Per-model provider options for video generation. */
export type OpenRouterVideoModelProviderOptionsByName = {
  [K in OpenRouterVideoModel]: OpenRouterVideoProviderOptionsFor<K>
}

export type OpenRouterVideoModelSizeByName = {
  [K in OpenRouterVideoModel]: ElementOf<VideoMeta[K]['sizes'], string>
}

export type OpenRouterVideoModelInputModalitiesByName = {
  [K in OpenRouterVideoModel]: readonly ['image']
}

export type OpenRouterVideoModelDurationByName = {
  [K in OpenRouterVideoModel]: ElementOf<VideoMeta[K]['durations'], number>
}

export function getVideoDurationOptions<TModel extends OpenRouterVideoModel>(
  model: TModel,
): DurationOptions<OpenRouterVideoModelDurationByName[TModel]>
export function getVideoDurationOptions(
  model: string,
): DurationOptions<number> {
  const durations = VIDEO_MODEL_META[model]?.durations
  if (!durations) return { kind: 'none' }
  if (durations.length === 0) return { kind: 'none' }
  return { kind: 'discrete', values: durations }
}

export function validateVideoSize(
  model: string,
  size: string | undefined,
): void {
  if (!size) return
  const sizes = VIDEO_MODEL_META[model]?.sizes
  if (!sizes) return
  if (sizes.includes(size)) return
  throw new Error(
    `openrouter: model ${model} does not support size '${size}'. Supported sizes: ${sizes.join(', ')}.`,
  )
}

export function validateVideoDuration(
  model: string,
  duration: number | undefined,
): void {
  if (duration === undefined) return
  const durations = VIDEO_MODEL_META[model]?.durations
  if (!durations) return
  if (durations.includes(duration)) return
  throw new Error(
    `openrouter: model ${model} does not support duration ${duration}s. Supported durations: ${durations.join(', ')}s.`,
  )
}
