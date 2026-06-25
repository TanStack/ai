/**
 * Gemini Veo Video Generation Provider Options
 *
 * Based on https://ai.google.dev/gemini-api/docs/video
 *
 * @experimental Video generation is an experimental feature and may change.
 */
import type { DurationOptions } from '@tanstack/ai/adapters'
import type { GenerateVideosConfig } from '@google/genai'
import type { GEMINI_VIDEO_MODELS } from '../model-meta'

/**
 * Model type for Gemini Veo video generation.
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModel = (typeof GEMINI_VIDEO_MODELS)[number]

/**
 * Supported aspect ratios for Veo video generation. This is the `size` value
 * for the Gemini video adapter — Veo expresses output shape as an aspect
 * ratio (plus an optional `resolution` in `modelOptions`), not pixel
 * dimensions.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoSize = '16:9' | '9:16'

/**
 * Provider-specific options for Gemini Veo video generation.
 *
 * Derived from the SDK's `GenerateVideosConfig`, minus the fields the
 * adapter manages itself:
 * - `durationSeconds` — set via the typed top-level `duration` option
 *   (use `adapter.snapDuration(seconds)` to coerce raw seconds)
 * - `aspectRatio` — set via the top-level `size` option
 * - `lastFrame` / `referenceImages` — set via image parts in the `prompt`
 *   with `metadata.role: 'end_frame'` / `'reference'`
 * - `httpOptions` / `abortSignal` — client-level transport concerns
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoProviderOptions = Omit<
  GenerateVideosConfig,
  | 'durationSeconds'
  | 'aspectRatio'
  | 'lastFrame'
  | 'referenceImages'
  | 'httpOptions'
  | 'abortSignal'
>

/**
 * Model-specific provider options mapping.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModelProviderOptionsByName = {
  [TModel in GeminiVideoModel]: GeminiVideoProviderOptions
}

/**
 * Model-specific size (aspect ratio) mapping.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModelSizeByName = {
  [TModel in GeminiVideoModel]: GeminiVideoSize
}

/**
 * Per-model prompt input modalities. Every Veo model accepts image
 * conditioning inputs (first frame, last frame, reference images) alongside
 * the text prompt.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModelInputModalitiesByName = {
  [TModel in GeminiVideoModel]: readonly ['image']
}

/**
 * Per-model duration unions (seconds, as numbers — the API's
 * `parameters.durationSeconds` field is numeric).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModelDurationByName = {
  'veo-3.1-generate-preview': 4 | 6 | 8
  'veo-3.1-fast-generate-preview': 4 | 6 | 8
  'veo-3.0-generate-001': 4 | 6 | 8
  'veo-3.0-fast-generate-001': 4 | 6 | 8
  'veo-2.0-generate-001': 5 | 6 | 8
}

/**
 * Runtime duration table backing `availableDurations()` / `snapDuration()`.
 *
 * Curated from the official Veo docs
 * (https://ai.google.dev/gemini-api/docs/video) — the Gemini OpenAPI spec
 * types the `:predictLongRunning` request's `parameters` as unconstrained,
 * so it carries no per-model duration information to derive these from.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export const GEMINI_VIDEO_DURATIONS: {
  readonly [TModel in GeminiVideoModel]: DurationOptions<
    GeminiVideoModelDurationByName[TModel]
  >
} = {
  'veo-3.1-generate-preview': { kind: 'discrete', values: [4, 6, 8] },
  'veo-3.1-fast-generate-preview': { kind: 'discrete', values: [4, 6, 8] },
  'veo-3.0-generate-001': { kind: 'discrete', values: [4, 6, 8] },
  'veo-3.0-fast-generate-001': { kind: 'discrete', values: [4, 6, 8] },
  'veo-2.0-generate-001': { kind: 'discrete', values: [5, 6, 8] },
}

/**
 * Look up the duration options for a Veo model.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function getGeminiVideoDurationOptions<TModel extends GeminiVideoModel>(
  model: TModel,
): DurationOptions<GeminiVideoModelDurationByName[TModel]> {
  return GEMINI_VIDEO_DURATIONS[model]
}
