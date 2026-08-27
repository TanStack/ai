import type { DurationOptions } from '@tanstack/ai/adapters'
import type { GrokVideoModel } from '../model-meta'

/**
 * Aspect ratios accepted by the grok-imagine video models.
 *
 * Note: this is a narrower set than the grok-imagine image models — the
 * video endpoint rejects the phone-screen ratios ('9:19.5', '9:20', …) and
 * 'auto'.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoAspectRatio =
  | '1:1'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '3:2'
  | '2:3'

/**
 * Resolution tiers for the grok-imagine video models.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoResolution = '480p' | '720p' | '1080p'

/**
 * Resolutions accepted by grok-imagine-video (v1.0). Native 1080p is a
 * grok-imagine-video-1.5 generation feature.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoResolutionV1 = '480p' | '720p'

/**
 * Size strings for grok-imagine video models. The Imagine API is
 * aspect-ratio based rather than pixel-size based; like the grok-imagine
 * image models, the generic `size` option uses an
 * `aspectRatio_resolution` template ("16:9_720p") — the resolution suffix
 * is optional ("16:9" uses the API default).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoSize =
  | GrokVideoAspectRatio
  | `${GrokVideoAspectRatio}_${GrokVideoResolution}`

/**
 * Size strings for grok-imagine-video (v1.0) — 1080p is not in the type.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoSizeV1 =
  | GrokVideoAspectRatio
  | `${GrokVideoAspectRatio}_${GrokVideoResolutionV1}`

const GROK_VIDEO_ASPECT_RATIOS: ReadonlyArray<string> = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
]

const GROK_VIDEO_RESOLUTIONS: ReadonlyArray<string> = ['480p', '720p', '1080p']

/**
 * Video duration limits enforced by the Imagine API (seconds).
 */
export const GROK_VIDEO_MIN_DURATION = 1
export const GROK_VIDEO_MAX_DURATION = 15

/**
 * Parses a grok video size string into its components.
 * Format: "aspectRatio" or "aspectRatio_resolution",
 * e.g. "16:9_720p" → { aspectRatio: "16:9", resolution: "720p" }.
 * Returns undefined when the string doesn't match the template.
 */
export function parseGrokVideoSize(
  size: string,
): { aspectRatio: string; /**
   * Output resolution tier. Generation only — edit / extend outputs inherit
   * the source clip's geometry and the adapter rejects this in those modes.
   * `1080p` is grok-imagine-video-1.5 generation only; reference-to-video
   * is capped at 720p.
   */
resolution?: string } | undefined {
  const match = size.match(/^([\d.]+:[\d.]+)(?:_(.+))?$/)
  const [, aspectRatio, resolution] = match ?? []
  if (aspectRatio === undefined) return undefined
  return { aspectRatio, ...(resolution !== undefined && { resolution }) }
}

/**
 * Models that accept native 1080p on text-to-video and image-to-video.
 * Reference-to-video stays capped at 720p even on these models.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function isGrokVideoNative1080pModel(model: string): boolean {
  return model === 'grok-imagine-video-1.5'
}

/**
 * Validate the `size` template for a given grok video model.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function validateVideoSize(
  model: string,
  size?: string,
): asserts size is GrokVideoSize | undefined {
  if (size === undefined) return
  const parsed = parseGrokVideoSize(size)
  const sizeError =
    `Size "${size}" is not supported by model "${model}". Expected ` +
    `"aspectRatio" or "aspectRatio_resolution" (e.g. "16:9_720p") with ` +
    `aspect ratio one of: ${GROK_VIDEO_ASPECT_RATIOS.join(', ')}`
  if (!parsed) {
    throw new Error(sizeError)
  }
  if (!GROK_VIDEO_ASPECT_RATIOS.includes(parsed.aspectRatio)) {
    throw new Error(sizeError)
  }
  if (
    parsed.resolution !== undefined &&
    !GROK_VIDEO_RESOLUTIONS.includes(parsed.resolution)
  ) {
    throw new Error(
      `Resolution "${parsed.resolution}" is not supported by model "${model}". ` +
        `Supported resolutions: ${GROK_VIDEO_RESOLUTIONS.join(', ')}`,
    )
  }
  if (parsed.resolution === '1080p' && !isGrokVideoNative1080pModel(model)) {
    throw new Error(
      `Resolution "1080p" is not supported by model "${model}". ` +
        `Use 'grok-imagine-video-1.5' for native 1080p text-to-video / image-to-video.`,
    )
  }
}

/**
 * Per-model duration type. The Imagine API accepts any integer second in the
 * 1–15 range, so this is a continuous range expressed as `number` (a literal
 * union can't represent it). `snapDuration()` coerces a raw seconds value into
 * the valid range at runtime.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoModelDurationByName = {
  'grok-imagine-video': number
  'grok-imagine-video-1.5': number
}

/**
 * Runtime duration table backing `availableDurations()` / `snapDuration()`.
 * Both grok-imagine video models accept the same continuous 1–15 integer-second
 * range.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export const GROK_VIDEO_DURATIONS: {
  readonly [TModel in GrokVideoModel]: DurationOptions<
    GrokVideoModelDurationByName[TModel]
  >
} = {
  'grok-imagine-video': {
    kind: 'range',
    min: GROK_VIDEO_MIN_DURATION,
    max: GROK_VIDEO_MAX_DURATION,
    step: 1,
    unit: 'seconds',
  },
  'grok-imagine-video-1.5': {
    kind: 'range',
    min: GROK_VIDEO_MIN_DURATION,
    max: GROK_VIDEO_MAX_DURATION,
    step: 1,
    unit: 'seconds',
  },
}

/**
 * Look up the duration options for a grok video model.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function getGrokVideoDurationOptions<TModel extends GrokVideoModel>(
  model: TModel,
): DurationOptions<GrokVideoModelDurationByName[TModel]> {
  return GROK_VIDEO_DURATIONS[model]
}

/**
 * Request mode for a source-video job. `'edit'` posts to `/v1/videos/edits`
 * (modify the source clip in place); `'extend'` posts to
 * `/v1/videos/extensions` (continue the source clip — `duration` is the
 * length of the **added tail**, not the total). Both require exactly one
 * video prompt part carrying the source clip, and both are
 * `grok-imagine-video` (v1.0) only.
 *
 * Output geometry (aspect ratio / resolution) is inherited from the source
 * clip in both modes, capped at 720p, and edit outputs also inherit the
 * source length — the adapter rejects `size`, `aspect_ratio`, `resolution`,
 * and (in edit mode) `duration` rather than sending fields the API ignores.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoMode = 'edit' | 'extend'

/**
 * Provider options shared by both grok-imagine video models. These map
 * directly onto the Imagine API request body and take precedence over the
 * generic `size` / `duration` options when both are provided.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface GrokVideoBaseProviderOptions {
  /**
     * Output aspect ratio. Generation only — edit / extend outputs inherit
     * the source clip's geometry and the adapter rejects this in those modes.
     */
  aspect_ratio?: GrokVideoAspectRatio

  resolution?: GrokVideoResolution

  /**
     * Video duration in integer seconds (1–15). In `'extend'` mode this is
     * the length of the added tail only, not the total output length. Not
     * valid in `'edit'` mode (the output inherits the source clip's length).
     */
  duration?: number
}

/**
 * Provider options for grok-imagine-video (v1.0), which is the only model
 * that accepts a source-video edit / extend job.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface GrokVideoSourceProviderOptions extends GrokVideoBaseProviderOptions {
  /**
     * Selects the request mode for a source-video prompt part: `'edit'`
     * (`/v1/videos/edits`) or `'extend'` (`/v1/videos/extensions`). Required
     * when the prompt carries a video part; not valid without one. Omit for
     * plain generation (`/v1/videos/generations`). grok-imagine-video only.
     */
  mode?: GrokVideoMode
}

/**
 * Provider options for grok-imagine-video-1.5, which adds the
 * reference-to-video inputs on top of the shared options.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface GrokVideoProviderOptions extends GrokVideoBaseProviderOptions {
  /**
     * Reference images for reference-to-video generation (output capped at
     * 720p). Usually populated from image prompt parts with
     * `metadata.role: 'reference'` (or `'character'`); set explicitly to
     * replace the part-derived list. Reference images are addressed from the
     * prompt text as `<IMAGE_0>`, `<IMAGE_1>`, … in request order, and do not
     * lock the first frame.
     */
  reference_images?: Array<{ url: string }>

  /**
     * Preset TTS voices to reference for generated speech (max 3). Voice ids
     * come from the xAI TTS voice roster (e.g. 'eve', 'rex') or a custom
     * voice id, and are addressed from the prompt text as `<AUDIO_0>`,
     * `<AUDIO_1>`, `<AUDIO_2>`.
     */
  reference_audios?: Array<{ voice_id: string }>
}

/**
 * Widest option surface. Used when `modelOptions` arrives as deserialized
 * JSON and the adapter must validate fields the per-model map already
 * hides at compile time.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoRuntimeOptions = GrokVideoSourceProviderOptions &
  GrokVideoProviderOptions

/**
 * Maximum reference voices accepted by the Imagine video endpoint.
 */
export const GROK_VIDEO_MAX_REFERENCE_AUDIOS = 3

/**
 * Maximum reference images accepted by the Imagine video endpoint.
 */
export const GROK_VIDEO_MAX_REFERENCE_IMAGES = 7

/**
 * Model names whose per-model options declare the reference fields. Keeps
 * the runtime set below provably in sync with
 * {@link GrokVideoModelProviderOptionsByName} — a typo or a new
 * reference-capable model missing from the set is a compile error.
 */
type GrokVideoReferenceModel = {
  [TModel in GrokVideoModel]: 'reference_images' extends keyof GrokVideoModelProviderOptionsByName[TModel]
    ? TModel
    : never
}[GrokVideoModel]

/**
 * Models that support reference-to-video inputs (`reference_images` /
 * `reference_audios`). The per-model provider-options map hides the fields
 * from other models at compile time; this backs the runtime gate for
 * untyped callers (e.g. deserialized JSON) so they get a clear error
 * instead of a raw API 400.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
const GROK_VIDEO_REFERENCE_MODELS: ReadonlySet<string> =
  new Set<GrokVideoReferenceModel>(['grok-imagine-video-1.5'])

/**
 * True when the model accepts reference-to-video inputs.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function isGrokVideoReferenceModel(model: string): boolean {
  return GROK_VIDEO_REFERENCE_MODELS.has(model)
}

/**
 * Model names whose per-model options declare `mode`. Same
 * provably-in-sync construction as {@link GrokVideoReferenceModel}.
 */
type GrokVideoSourceModel = {
  [TModel in GrokVideoModel]: 'mode' extends keyof GrokVideoModelProviderOptionsByName[TModel]
    ? TModel
    : never
}[GrokVideoModel]

/**
 * Models that accept a source-video prompt part for `/v1/videos/edits`
 * and `/v1/videos/extensions`. xAI lists video input only on
 * grok-imagine-video (v1.0).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
const GROK_VIDEO_SOURCE_MODELS: ReadonlySet<string> =
  new Set<GrokVideoSourceModel>(['grok-imagine-video'])

/**
 * True when the model accepts edit / extend source-video jobs.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function isGrokVideoSourceModel(model: string): boolean {
  return GROK_VIDEO_SOURCE_MODELS.has(model)
}

/**
 * Type-only map from model name to its specific provider options. Only
 * grok-imagine-video-1.5 exposes the reference-to-video fields. Only
 * grok-imagine-video (v1.0) exposes `mode` for edit / extend.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoModelProviderOptionsByName = {
  'grok-imagine-video': GrokVideoSourceProviderOptions
  'grok-imagine-video-1.5': GrokVideoProviderOptions
}

/**
 * Type-only map from model name to its supported `size` strings.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoModelSizeByName = {
  'grok-imagine-video': GrokVideoSizeV1
  'grok-imagine-video-1.5': GrokVideoSize
}

/**
 * Type-only map from model name to the non-text prompt modalities it accepts.
 * Both models support text-to-video and accept an optional `image` prompt
 * part as the starting frame; image parts with `metadata.role: 'reference'`
 * or `'character'` become `reference_images` (grok-imagine-video-1.5 only).
 * A `video` prompt part carries the source clip for edit / extension mode
 * on grok-imagine-video only (`modelOptions.mode: 'edit' | 'extend'`).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoModelInputModalitiesByName = {
  'grok-imagine-video': readonly ['image', 'video']
  'grok-imagine-video-1.5': readonly ['image']
}
