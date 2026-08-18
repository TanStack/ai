import type { GeminiImageModels } from '../model-meta'
import type {
  ContentUnion,
  ImageConfig,
  ImagePromptLanguage,
  PersonGeneration,
  SafetyFilterLevel,
  SafetySetting,
  ThinkingConfig,
} from '@google/genai'

// Re-export SDK types so users can use them directly
export type {
  ContentUnion,
  ImageConfig,
  ImagePromptLanguage,
  PersonGeneration,
  SafetyFilterLevel,
  SafetySetting,
  ThinkingConfig,
}

/**
 * Gemini Imagen aspect ratio options
 * Controls the aspect ratio of generated images
 */
export type GeminiAspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '9:21'
  | '21:9'

/**
 * Provider options for Gemini image generation
 * These options match the @google/genai GenerateImagesConfig interface
 * and can be spread directly into the API request.
 */
export interface GeminiImageProviderOptions {
  /**
   * The aspect ratio of generated images
   * @default '1:1'
   */
  aspectRatio?: GeminiAspectRatio

  /**
   * Controls whether people can appear in generated images
   * Use PersonGeneration enum values: DONT_ALLOW, ALLOW_ADULT, ALLOW_ALL
   * @default 'ALLOW_ADULT'
   */
  personGeneration?: PersonGeneration

  /**
   * Safety filter level for content filtering
   * Use SafetyFilterLevel enum values
   */
  safetyFilterLevel?: SafetyFilterLevel

  /**
   * Optional seed for reproducible image generation
   * When the same seed is used with the same prompt and settings,
   * you should get similar (though not identical) results
   */
  seed?: number

  /**
   * Whether to add a SynthID watermark to generated images
   * SynthID helps identify AI-generated content
   * @default true
   */
  addWatermark?: boolean

  /**
   * Language of the prompt
   * Use ImagePromptLanguage enum values
   */
  language?: ImagePromptLanguage

  /**
   * Negative prompt - what to avoid in the generated image
   * Not all models support negative prompts
   */
  negativePrompt?: string

  /**
   * Output MIME type for the generated image
   * @default 'image/png'
   */
  outputMimeType?: 'image/png' | 'image/jpeg' | 'image/webp'

  /**
   * Compression quality for JPEG outputs (0-100)
   * Higher values mean better quality but larger file sizes
   * @default 75
   */
  outputCompressionQuality?: number

  /**
   * Controls how much the model adheres to the text prompt
   * Large values increase output and prompt alignment,
   * but may compromise image quality
   */
  guidanceScale?: number

  /**
   * Whether to use the prompt rewriting logic
   */
  enhancePrompt?: boolean

  /**
   * Whether to report the safety scores of each generated image
   * and the positive prompt in the response
   */
  includeSafetyAttributes?: boolean

  /**
   * Whether to include the Responsible AI filter reason
   * if the image is filtered out of the response
   */
  includeRaiReason?: boolean

  /**
   * Cloud Storage URI used to store the generated images
   */
  outputGcsUri?: string

  /**
   * User specified labels to track billing usage
   */
  labels?: Record<string, string>
}

/**
 * Provider options for Gemini native image models (Nano Banana and friends).
 *
 * These models are served by `generateContent`, not `generateImages`, so they
 * are configured by @google/genai's `GenerateContentConfig` — a different
 * shape from the Imagen-only {@link GeminiImageProviderOptions} above. Only
 * the `GenerateContentConfig` fields with clear image-generation semantics are
 * surfaced; sampling knobs (`temperature`, `topK`, …) and chat-only plumbing
 * (`tools`, `responseSchema`, …) are deliberately left out.
 *
 * `responseModalities` is intentionally absent: the adapter always requests
 * `['TEXT', 'IMAGE']`, and letting a caller override it would silently disable
 * image output on an image-generation call.
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
   * Controls the model's internal reasoning before it emits an image
   * Use to raise or disable the thinking budget on models that support it
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
}

/**
 * Every provider-option field this adapter understands, across both API
 * paths. Used as the adapter's base (model-agnostic) option type; the
 * per-model map below is what narrows a given model to the half that
 * actually applies to it.
 */
export type GeminiAnyImageProviderOptions = GeminiImageProviderOptions &
  GeminiNativeImageProviderOptions

/**
 * Model-specific provider options mapping.
 * Gemini native image models go through `generateContent` and take
 * `GenerateContentConfig` fields; Imagen models go through `generateImages`
 * and take `GenerateImagesConfig` fields. Mirrors the native/Imagen split in
 * {@link GeminiImageModelSizeByName} and
 * {@link GeminiImageModelInputModalitiesByName}.
 */
export type GeminiImageModelProviderOptionsByName = {
  [K in GeminiNativeImageModels]: GeminiNativeImageProviderOptions
} & {
  [K in Exclude<
    GeminiImageModels,
    GeminiNativeImageModels
  >]: GeminiImageProviderOptions
}

/**
 * Supported size strings for Gemini Imagen models
 * These map to aspect ratios internally
 */
export type GeminiImageSize =
  | '1024x1024'
  | '512x512'
  | '1024x768'
  | '1536x1024'
  | '1792x1024'
  | '1920x1080'
  | '768x1024'
  | '1024x1536'
  | '1024x1792'
  | '1080x1920'

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
 * Sizes for `gemini-3.1-flash-image` (and its shut-down `-preview` alias):
 * all 14 aspect ratios at 512 / 1K / 2K / 4K. `512` is the wire token for the
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
 * Sizes for `gemini-3-pro-image` (and its shut-down `-preview` alias): the ten
 * standard aspect ratios at 1K / 2K / 4K. Pro has no 512 tier and none of the
 * extreme banner ratios on the Gemini API.
 */
export type Gemini3ProImageSize =
  `${GeminiStandardImageAspectRatio}_${'1K' | '2K' | '4K'}`

/**
 * Sizes for `gemini-2.5-flash-image`: a bare aspect ratio with no resolution
 * suffix, e.g. `'16:9'`. Google documents no `image_size` value or default for
 * this model — it emits a single fixed 1024px-class output — so the adapter
 * sends `imageConfig.aspectRatio` and omits `imageSize` entirely rather than
 * guessing a tier the API never documented.
 */
export type Gemini25FlashImageSize = GeminiStandardImageAspectRatio

/**
 * `imageConfig` fields the Gemini Developer API accepts on `generateContent`.
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
  | Gemini31FlashImageSize
  | Gemini31FlashLiteImageSize
  | Gemini3ProImageSize
  | Gemini25FlashImageSize

/**
 * Gemini native image models that use the generateContent API path.
 * These models take an aspect-ratio-based size rather than Imagen's
 * WIDTHxHEIGHT pixel strings.
 *
 * This array is the single source of truth for the native/Imagen split: the
 * `GeminiNativeImageModels` union and the per-model option/size/modality maps
 * all derive from it. The `satisfies` clause makes a typo (or a name that
 * is not a known image model) a build error rather than a phantom key on every
 * per-model map.
 *
 * It is also the single source of truth for the adapter's runtime routing
 * — see {@link isGeminiNativeImageModel}. Adding a new `gemini-*` image model
 * means adding it here as well as to `GEMINI_IMAGE_MODELS` in model-meta.
 * Until it is listed here it routes to the Imagen API instead and fails
 * loudly on the first call, rather than silently taking the wrong option
 * shape.
 */
export const GEMINI_NATIVE_IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
] as const satisfies ReadonlyArray<GeminiImageModels>

export type GeminiNativeImageModels =
  (typeof GEMINI_NATIVE_IMAGE_MODELS)[number]

const NATIVE_IMAGE_MODEL_NAMES: ReadonlySet<string> = new Set(
  GEMINI_NATIVE_IMAGE_MODELS,
)

/**
 * Runtime counterpart to {@link GeminiNativeImageModels} — decides which of
 * the two Gemini image APIs a model goes to.
 *
 * Membership in {@link GEMINI_NATIVE_IMAGE_MODELS}, not a `gemini-` prefix
 * test, so the runtime route and the type-level split cannot drift apart. An
 * id this package does not know about reaches the Imagen endpoint and fails
 * there, which is the intended signal to add the model here rather than to
 * have it silently take the native path with Imagen-shaped option types.
 */
export function isGeminiNativeImageModel(model: string): boolean {
  return NATIVE_IMAGE_MODEL_NAMES.has(model)
}

/**
 * Model-specific size options mapping. Each native model gets its own ratio ×
 * resolution set (they genuinely differ); Imagen models use pixel sizes.
 */
export type GeminiImageModelSizeByName = {
  'gemini-3.1-flash-image': Gemini31FlashImageSize
  'gemini-3.1-flash-image-preview': Gemini31FlashImageSize
  'gemini-3.1-flash-lite-image': Gemini31FlashLiteImageSize
  'gemini-3-pro-image': Gemini3ProImageSize
  'gemini-3-pro-image-preview': Gemini3ProImageSize
  'gemini-2.5-flash-image': Gemini25FlashImageSize
} & {
  [K in Exclude<GeminiImageModels, GeminiNativeImageModels>]: GeminiImageSize
}

/**
 * Per-model prompt input modalities. Gemini-native image models accept image
 * parts in the multimodal prompt (image-conditioned generation via
 * generateContent); Imagen models are strictly text-to-image, so their
 * `prompt` is constrained to text at compile time.
 */
export type GeminiImageModelInputModalitiesByName = {
  [K in GeminiNativeImageModels]: readonly ['image']
} & {
  [K in Exclude<GeminiImageModels, GeminiNativeImageModels>]: readonly []
}

/**
 * Valid sizes for Gemini Imagen models
 * Gemini uses aspect ratios, but we map common WIDTHxHEIGHT formats to aspect ratios
 * These are approximate mappings based on common image dimensions
 */
export const GEMINI_SIZE_TO_ASPECT_RATIO: Record<string, GeminiAspectRatio> = {
  // Square
  '1024x1024': '1:1',
  '512x512': '1:1',
  // Landscape
  '1024x768': '4:3',
  '1536x1024': '4:3',
  '1792x1024': '16:9',
  '1920x1080': '16:9',
  // Portrait
  '768x1024': '3:4',
  '1024x1536': '3:4', // Inverted
  '1024x1792': '9:16',
  '1080x1920': '9:16',
}

/**
 * Maps a WIDTHxHEIGHT size string to a Gemini aspect ratio
 * Returns undefined if the size cannot be mapped
 */
export function sizeToAspectRatio(
  size: string | undefined,
): GeminiAspectRatio | undefined {
  if (!size) return undefined
  return GEMINI_SIZE_TO_ASPECT_RATIO[size]
}

/**
 * Validates that the provided size can be mapped to an aspect ratio
 * Throws an error if the size is invalid
 */
export function validateImageSize(
  model: string,
  size: string | undefined,
): void {
  if (!size) return

  const aspectRatio = sizeToAspectRatio(size)
  if (!aspectRatio) {
    const validSizes = Object.keys(GEMINI_SIZE_TO_ASPECT_RATIO)
    throw new Error(
      `Invalid size "${size}" for model "${model}". ` +
        `Gemini Imagen uses aspect ratios. Valid sizes that map to aspect ratios: ${validSizes.join(', ')}. ` +
        `Alternatively, use providerOptions.aspectRatio directly with values: 1:1, 3:4, 4:3, 9:16, 16:9, 9:21, 21:9`,
    )
  }
}

/**
 * Per-model caps on images per request.
 * The Imagen 4 family all support up to 4 images per request via the Gemini
 * API (the rumored 8-image tier is Vertex-only and isn't reachable through
 * @google/genai today). Unknown models fall through to the shared cap
 * defined below.
 *
 * @see https://ai.google.dev/gemini-api/docs/imagen
 */
const IMAGEN_MAX_IMAGES_BY_MODEL: Record<string, number> = {
  'imagen-4.0-generate-001': 4,
  'imagen-4.0-ultra-generate-001': 4,
  'imagen-4.0-fast-generate-001': 4,
}

const DEFAULT_IMAGEN_MAX_IMAGES = 4

/**
 * Validates the number of images requested against the model's known cap.
 * Uses a per-model table where available and falls back to the shared
 * default otherwise — no more "some support up to 8" comments that don't
 * match the error message.
 */
export function validateNumberOfImages(
  model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  const maxImages =
    IMAGEN_MAX_IMAGES_BY_MODEL[model] ?? DEFAULT_IMAGEN_MAX_IMAGES
  if (numberOfImages < 1 || numberOfImages > maxImages) {
    throw new Error(
      `Invalid numberOfImages "${numberOfImages}" for model "${model}". ` +
        `Must be between 1 and ${maxImages}.`,
    )
  }
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
 * The resolution suffix is optional: `gemini-2.5-flash-image` takes a bare
 * aspect ratio (`"16:9"` → `{ aspectRatio: "16:9" }`) because Google documents
 * no `image_size` for it, and the caller must then omit `imageSize` from the
 * request rather than substituting a default.
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
