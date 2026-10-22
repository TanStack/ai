import type { GeminiImageModels } from '../model-meta'
import type {
  ContentUnion,
  ImageConfig,
  SafetySetting,
  ThinkingConfig,
} from '@google/genai'

// Re-export SDK types so users can use them directly
export type { ContentUnion, ImageConfig, SafetySetting, ThinkingConfig }

/**
 * Provider options for Gemini native image models (Nano Banana and friends).
 *
 * These models are served by the Interactions API.
 * Sampling knobs (`temperature`, `topK`, …) and chat-only plumbing
 * (`tools`, `responseSchema`, …) are deliberately left out.
 *
 * Image output is always requested. There is no `responseModalities` field:
 * a caller override would silently disable image output.
 */
export interface GeminiNativeImageProviderOptions {
  /**
   * Optional seed for reproducible image generation
   * When the same seed is used with the same prompt and settings,
   * you should get similar (though not identical) results
   */
  seed?: number

  /**
   * Per-category safety thresholds applied to the request
   * Each entry pairs a HarmCategory with a HarmBlockThreshold
   */
  safetySettings?: Array<SafetySetting>

  /**
   * Controls the model's internal reasoning before it emits an image.
   * `thinkingLevel` maps to the Interactions `thinking_level`.
   * `thinkingBudget` is rejected: the Interactions image API has no budget.
   */
  thinkingConfig?: ThinkingConfig

  /**
   * Native image output controls. Merged over the values derived from the
   * portable `size` option, so fields set here win per field while the rest
   * of `size` is preserved.
   *
   * Only `aspectRatio` and `imageSize` are accepted on the Gemini Developer
   * API. Other SDK `ImageConfig` keys throw on this surface.
   */
  imageConfig?: GeminiNativeImageConfig

  /**
   * System-level instructions that steer the model for the whole request,
   * e.g. a house art direction applied on top of the per-call prompt
   */
  systemInstruction?: ContentUnion

  /**
   * Continue an edit from a previous native image result. Pass that result's
   * `id`. The new prompt is the edit; the previous image is not sent again.
   * Interactions are stored server-side (1 day on the free tier, 55 days on
   * paid). `store: false` cannot be chained.
   */
  previous_interaction_id?: string

  /**
   * Whether Gemini stores this interaction so a later call can chain it.
   * Omit to use the API default (`true`).
   */
  store?: boolean
}

/**
 * Model-specific provider options mapping. Every Gemini image model goes
 * through the Interactions API and takes the same option set.
 */
export type GeminiImageModelProviderOptionsByName = {
  [K in GeminiImageModels]: GeminiNativeImageProviderOptions
}

/**
 * The ten aspect ratios every Gemini native image model accepts.
 *
 * Note `9:21` is deliberately absent: it exists only on Vertex / Cloud and is
 * rejected by the Gemini API (`generateContent`), which is the surface this
 * adapter targets.
 *
 * @see https://ai.google.dev/gemini-api/docs/image-generation
 */
export type GeminiStandardImageAspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9'

/**
 * The ten standard ratios plus the four extreme banner/strip ratios that only
 * the Gemini 3.1 Flash Image models accept — 14 values, matching the
 * `generateContent` `ImageConfig.aspectRatio` field union.
 *
 * @see https://ai.google.dev/api/generate-content
 */
export type GeminiExtendedImageAspectRatio =
  | GeminiStandardImageAspectRatio
  | '1:4'
  | '4:1'
  | '1:8'
  | '8:1'

/**
 * Sizes for `gemini-3.1-flash-image`: all 14 aspect ratios at 512 / 1K / 2K / 4K. `512` is the wire token for the
 * 0.5K tier — not `512px`, and the `K` is case-sensitive (`1k` is rejected).
 */
export type Gemini31FlashImageSize =
  `${GeminiExtendedImageAspectRatio}_${'512' | '1K' | '2K' | '4K'}`

/**
 * Sizes for `gemini-3.1-flash-lite-image`: all 14 aspect ratios, 1K only.
 * 2K and 4K are unsupported on this model.
 *
 * The four banner ratios (`1:4`, `4:1`, `1:8`, `8:1`) come from the Cloud
 * model page. The Gemini API page states a count of 14 but does not list them.
 *
 * @see https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite-image
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image
 */
export type Gemini31FlashLiteImageSize = `${GeminiExtendedImageAspectRatio}_1K`

/**
 * Sizes for `gemini-nano-banana-2.1`: all 14 aspect ratios at 1K / 2K / 4K.
 * The API rejects the 512 tier on this model.
 *
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1
 */
export type GeminiNanoBanana21ImageSize =
  `${GeminiExtendedImageAspectRatio}_${'1K' | '2K' | '4K'}`

/**
 * Sizes for `gemini-3-pro-image`: the ten standard aspect ratios at 1K / 2K /
 * 4K. Pro has no 512 tier and none of the
 * extreme banner ratios on the Gemini API.
 */
export type Gemini3ProImageSize =
  `${GeminiStandardImageAspectRatio}_${'1K' | '2K' | '4K'}`

/**
 * `imageConfig` fields sent as Interactions `response_format`.
 * Other `@google/genai` `ImageConfig` keys (`personGeneration`,
 * `outputMimeType`, and more) throw on this surface.
 */
export type GeminiNativeImageConfig = {
  aspectRatio?: GeminiExtendedImageAspectRatio
  imageSize?: '512' | '1K' | '2K' | '4K'
}

/**
 * Any size accepted by any Gemini native image model. Prefer the per-model
 * narrowing in {@link GeminiImageModelSizeByName} — this union is the widest
 * possible set and accepts combinations no single model supports.
 */
export type GeminiNativeImageSize =
  | GeminiNanoBanana21ImageSize
  | Gemini31FlashImageSize
  | Gemini31FlashLiteImageSize
  | Gemini3ProImageSize

/**
 * Model-specific size options mapping. Each model gets its own ratio ×
 * resolution set (they genuinely differ).
 */
export type GeminiImageModelSizeByName = {
  'gemini-nano-banana-2.1': GeminiNanoBanana21ImageSize
  'gemini-3.1-flash-image': Gemini31FlashImageSize
  'gemini-3.1-flash-lite-image': Gemini31FlashLiteImageSize
  'gemini-3-pro-image': Gemini3ProImageSize
}

/**
 * Per-model prompt input modalities. Every Gemini image model accepts image
 * parts in the multimodal prompt (image-conditioned generation).
 */
export type GeminiImageModelInputModalitiesByName = {
  [K in GeminiImageModels]: readonly ['image']
}

/**
 * Validates the prompt is not empty
 */
export function validatePrompt(options: {
  prompt: string
  model: string
}): void {
  const { prompt, model } = options
  if (!prompt || prompt.trim().length === 0) {
    throw new Error(`Prompt cannot be empty for model "${model}".`)
  }
}

/**
 * Parses a Gemini native image size string into its components.
 *
 * Format: `"aspectRatio_resolution"`, e.g. `"16:9_4K"` →
 * `{ aspectRatio: "16:9", resolution: "4K" }`.
 *
 * The resolution suffix is optional: a bare aspect ratio (`"16:9"` →
 * `{ aspectRatio: "16:9" }`) leaves `imageSize` out of the request.
 */
export function parseNativeImageSize(
  size: string,
): { aspectRatio: string; resolution?: string } | undefined {
  const match = size.match(/^(\d+:\d+)(?:_(.+))?$/)
  const [, aspectRatio, resolution] = match ?? []
  if (aspectRatio === undefined) return undefined
  return {
    aspectRatio,
    ...(resolution !== undefined && { resolution }),
  }
}
