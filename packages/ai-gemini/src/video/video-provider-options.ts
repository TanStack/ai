/**
 * Gemini Video Generation Provider Options
 *
 * Covers two request paths behind the one video adapter:
 * - Veo models — long-running operations via `:predictLongRunning`
 *   (https://ai.google.dev/gemini-api/docs/video)
 * - Gemini Omni Flash — background jobs via the Interactions API
 *   (https://ai.google.dev/gemini-api/docs/omni)
 *
 * @experimental Video generation is an experimental feature and may change.
 */
import { GEMINI_INTERACTIONS_VIDEO_MODELS } from '../model-meta'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type { GenerateVideosConfig, Interactions } from '@google/genai'
import type { GEMINI_VIDEO_MODELS } from '../model-meta'

/**
 * Model type for Gemini video generation (Veo + Omni Flash).
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModel = (typeof GEMINI_VIDEO_MODELS)[number]

/**
 * Video models served by the Interactions API (Gemini Omni Flash) rather
 * than Veo's `:predictLongRunning` operations flow.
 * @experimental Omni video generation is an experimental feature and may change.
 */
export type GeminiInteractionsVideoModel =
  (typeof GEMINI_INTERACTIONS_VIDEO_MODELS)[number]

/**
 * Runtime guard for the Interactions-served video models.
 * @experimental Omni video generation is an experimental feature and may change.
 */
export function isInteractionsVideoModel(
  model: GeminiVideoModel,
): model is GeminiInteractionsVideoModel {
  return (GEMINI_INTERACTIONS_VIDEO_MODELS as ReadonlyArray<string>).includes(
    model,
  )
}

/**
 * Supported aspect ratios for Gemini video generation. This is the `size`
 * value for the Gemini video adapter — both Veo and Omni Flash express
 * output shape as an aspect ratio (plus an optional `resolution` in Veo's
 * `modelOptions`), not pixel dimensions.
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
 * Provider-specific options for Gemini Omni Flash video generation on the
 * Interactions API.
 *
 * Derived from the SDK's `Interactions.CreateModelInteractionParamsNonStreaming`,
 * minus the fields the adapter manages itself:
 * - `model` / `input` — set from the adapter's model and the `prompt`
 * - `stream` / `background` — the adapter always creates a background job
 *   and polls it through the `generateVideo` jobs API
 * - `response_modalities` / `response_format` — the adapter requests video
 *   output and maps the top-level `size` option onto
 *   `response_format.aspect_ratio`
 * - `tools` / `response_mime_type` — not applicable to video generation
 *
 * Notable passthroughs:
 * - `previous_interaction_id` — conversational video editing: chain a new
 *   prompt onto a prior Omni interaction to refine its video
 * - `generation_config.video_config.task` — pin the task mode
 *   (`'text_to_video' | 'image_to_video' | 'reference_to_video' | 'edit'`)
 *   instead of letting the model infer it
 *
 * @experimental Omni video generation is an experimental feature and may change.
 */
export type GeminiOmniVideoProviderOptions = Omit<
  Interactions.CreateModelInteractionParamsNonStreaming,
  | 'model'
  | 'input'
  | 'stream'
  | 'background'
  | 'response_modalities'
  | 'response_format'
  | 'response_mime_type'
  | 'tools'
>

/**
 * Model-specific provider options mapping.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModelProviderOptionsByName = {
  [TModel in GeminiVideoModel]: TModel extends GeminiInteractionsVideoModel
    ? GeminiOmniVideoProviderOptions
    : GeminiVideoProviderOptions
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
 * the text prompt. Omni Flash additionally accepts video inputs (short
 * reference clips / videos to edit).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModelInputModalitiesByName = {
  [TModel in GeminiVideoModel]: TModel extends GeminiInteractionsVideoModel
    ? readonly ['image', 'video']
    : readonly ['image']
}

/**
 * Per-model duration unions (seconds, as numbers — Veo's
 * `parameters.durationSeconds` field is numeric; Omni Flash accepts a
 * continuous 3–10 second range, fractional seconds included, so it stays
 * `number` — the adapter rejects out-of-range values at job creation,
 * against the range entry below).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type GeminiVideoModelDurationByName = {
  'veo-3.1-generate-preview': 4 | 6 | 8
  'veo-3.1-fast-generate-preview': 4 | 6 | 8
  'veo-3.1-lite-generate-preview': 4 | 6 | 8
  'gemini-omni-flash-preview': number
}

/**
 * Runtime duration table backing `availableDurations()` / `snapDuration()`.
 *
 * Veo values are curated from the official docs
 * (https://ai.google.dev/gemini-api/docs/video) — the Gemini OpenAPI spec
 * types the `:predictLongRunning` request's `parameters` as unconstrained,
 * so it carries no per-model duration information to derive these from.
 * Omni Flash's 3–10s range was verified against the live API
 * (2026-07-02): `response_format.duration` takes a `"<seconds>s"` string,
 * fractional values are accepted, out-of-range values are rejected with
 * "minimum allowed 3s" / "maximum allowed 10s", and omitting it defaults
 * to a 10-second clip.
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
  'veo-3.1-lite-generate-preview': { kind: 'discrete', values: [4, 6, 8] },
  'gemini-omni-flash-preview': {
    kind: 'range',
    min: 3,
    max: 10,
    unit: 'seconds',
  },
}

/**
 * Look up the duration options for a Gemini video model.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function getGeminiVideoDurationOptions<TModel extends GeminiVideoModel>(
  model: TModel,
): DurationOptions<GeminiVideoModelDurationByName[TModel]> {
  return GEMINI_VIDEO_DURATIONS[model]
}
