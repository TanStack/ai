/**
 * Grok Video Generation Provider Options (xAI Imagine API)
 *
 * Based on https://docs.x.ai/docs/guides/video-generations
 *
 * @experimental Video generation is an experimental feature and may change.
 */

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
): { aspectRatio: string; resolution?: string } | undefined {
  const match = size.match(/^([\d.]+:[\d.]+)(?:_(.+))?$/)
  const [, aspectRatio, resolution] = match ?? []
  if (aspectRatio === undefined) return undefined
  return { aspectRatio, ...(resolution !== undefined && { resolution }) }
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
  if (!parsed || !GROK_VIDEO_ASPECT_RATIOS.includes(parsed.aspectRatio)) {
    throw new Error(
      `Size "${size}" is not supported by model "${model}". Expected ` +
        `"aspectRatio" or "aspectRatio_resolution" (e.g. "16:9_720p") with ` +
        `aspect ratio one of: ${GROK_VIDEO_ASPECT_RATIOS.join(', ')}`,
    )
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
}

/**
 * Validate video duration (seconds) for a given grok video model.
 * The Imagine API accepts integer durations between 1 and 15 seconds.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function validateVideoDuration(model: string, duration?: number): void {
  if (duration === undefined) return
  if (
    !Number.isInteger(duration) ||
    duration < GROK_VIDEO_MIN_DURATION ||
    duration > GROK_VIDEO_MAX_DURATION
  ) {
    throw new Error(
      `Duration "${duration}" is not supported by model "${model}". ` +
        `Supported durations: integer seconds between ${GROK_VIDEO_MIN_DURATION} and ${GROK_VIDEO_MAX_DURATION}`,
    )
  }
}

/**
 * Provider-specific options for grok video generation. These map directly
 * onto the Imagine API request body and take precedence over the generic
 * `size` / `duration` options when both are provided.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface GrokVideoProviderOptions {
  /**
   * Output aspect ratio.
   */
  aspect_ratio?: GrokVideoAspectRatio

  /**
   * Output resolution tier.
   */
  resolution?: GrokVideoResolution

  /**
   * Video duration in integer seconds (1–15).
   */
  duration?: number
}

/**
 * Type-only map from model name to its specific provider options.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoModelProviderOptionsByName = {
  'grok-imagine-video': GrokVideoProviderOptions
  'grok-imagine-video-1.5': GrokVideoProviderOptions
}

/**
 * Type-only map from model name to its supported `size` strings.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoModelSizeByName = {
  'grok-imagine-video': GrokVideoSize
  'grok-imagine-video-1.5': GrokVideoSize
}

/**
 * Type-only map from model name to the non-text prompt modalities it accepts.
 * Both models accept an `image` prompt part as the starting frame:
 * `grok-imagine-video` (v1.0) does text-to-video and image-to-video, while
 * `grok-imagine-video-1.5` is image-to-video only (the image is required).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GrokVideoModelInputModalitiesByName = {
  'grok-imagine-video': readonly ['image']
  'grok-imagine-video-1.5': readonly ['image']
}

/**
 * Models that only support image-to-video — a starting-frame image is
 * required and text-to-video is rejected by the Imagine API. Used by the
 * adapter to fail fast with a clear message instead of surfacing the raw
 * "Text-to-video is not supported for this model" 400.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
const GROK_VIDEO_IMAGE_TO_VIDEO_ONLY: ReadonlySet<string> = new Set([
  'grok-imagine-video-1.5',
])

/**
 * True when the model only supports image-to-video (a starting frame is
 * required).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function isImageToVideoOnlyModel(model: string): boolean {
  return GROK_VIDEO_IMAGE_TO_VIDEO_ONLY.has(model)
}
