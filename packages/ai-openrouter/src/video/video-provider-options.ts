import { OPENROUTER_VIDEO_MODEL_META } from '../model-meta'
import type { VideoGenerationRequestProvider } from '@openrouter/sdk/models'
import type { OPENROUTER_VIDEO_MODELS } from '../model-meta'

export type OpenRouterVideoModel = (typeof OPENROUTER_VIDEO_MODELS)[number]

type VideoMeta = typeof OPENROUTER_VIDEO_MODEL_META

/**
 * Element type of a capability array from the generated video model meta,
 * falling back to `TFallback` when the API reported `null` (capabilities
 * unknown) for that model.
 */
type ElementOf<T, TFallback> = T extends ReadonlyArray<infer U> ? U : TFallback

/**
 * Runtime view of one `OPENROUTER_VIDEO_MODEL_META` entry, widened from the
 * generated literal types so validators can work with any model id.
 */
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

/**
 * Options common to every OpenRouter video model.
 */
export interface OpenRouterVideoCommonOptions {
  /**
   * HTTPS URL to receive a webhook notification when the video generation
   * job completes (events like `video.generation.completed` /
   * `video.generation.failed`, signed with HMAC-SHA256). Overrides the
   * workspace-level default callback URL if set.
   */
  callbackUrl?: string
  /**
   * Provider-specific passthrough configuration, keyed by provider slug.
   * The options for the matched provider are spread into the upstream
   * request body.
   */
  provider?: VideoGenerationRequestProvider
}

/**
 * Base (widest) video generation options for OpenRouter's
 * `POST /api/v1/videos` API. Per-model narrowing happens in
 * {@link OpenRouterVideoModelProviderOptionsByName}.
 */
export interface OpenRouterVideoProviderOptions extends OpenRouterVideoCommonOptions {
  /** Resolution of the generated video (e.g. '720p', '1080p'). */
  resolution?: string
  /** Aspect ratio of the generated video (e.g. '16:9', '9:16'). */
  aspectRatio?: string
  /**
   * Deterministic sampling seed. Repeated requests with the same seed and
   * parameters should return the same result (not guaranteed by all
   * providers).
   */
  seed?: number
  /**
   * Whether to generate audio alongside the video. Defaults to the
   * endpoint's `generate_audio` capability flag.
   */
  generateAudio?: boolean
}

/**
 * Provider options narrowed to one model's capabilities from the generated
 * `OPENROUTER_VIDEO_MODEL_META`: `resolution` / `aspectRatio` become literal
 * unions of the supported values, and `seed` / `generateAudio` are omitted
 * for models whose metadata reports them unsupported (`false`; `null` means
 * unknown and stays permissive).
 */
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

/**
 * Per-model `size` values ('WIDTHxHEIGHT'), from the generated meta.
 * `size` is interchangeable with `resolution` + `aspectRatio`.
 */
export type OpenRouterVideoModelSizeByName = {
  [K in OpenRouterVideoModel]: ElementOf<VideoMeta[K]['sizes'], string>
}

/**
 * Per-model prompt input modalities. Every model on the dedicated video API
 * accepts image conditioning — `frame_images` (first/last frame) and/or
 * `input_references` (reference-guided generation).
 */
export type OpenRouterVideoModelInputModalitiesByName = {
  [K in OpenRouterVideoModel]: readonly ['image']
}

/**
 * Validate a requested size against the model's supported sizes. No-op when
 * the model (or its size list) is unknown — OpenRouter then validates
 * server-side.
 */
export function validateVideoSize(
  model: string,
  size: string | undefined,
): void {
  if (!size) return
  const sizes = VIDEO_MODEL_META[model]?.sizes
  if (!sizes || sizes.includes(size)) return
  throw new Error(
    `openrouter: model ${model} does not support size '${size}'. Supported sizes: ${sizes.join(', ')}.`,
  )
}

/**
 * Validate a requested duration (seconds) against the model's supported
 * durations. No-op when the model (or its duration list) is unknown.
 */
export function validateVideoDuration(
  model: string,
  duration: number | undefined,
): void {
  if (duration === undefined) return
  const durations = VIDEO_MODEL_META[model]?.durations
  if (!durations || durations.includes(duration)) return
  throw new Error(
    `openrouter: model ${model} does not support duration ${duration}s. Supported durations: ${durations.join(', ')}s.`,
  )
}
