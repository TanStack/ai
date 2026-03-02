import type { GeminiImageModels } from '../model-meta'
import type {
  ImagePromptLanguage,
  PersonGeneration,
  SafetyFilterLevel,
} from '@google/genai'

// Re-export SDK types so users can use them directly
export type { ImagePromptLanguage, PersonGeneration, SafetyFilterLevel }

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
 * Model-specific provider options mapping
 * Currently all Imagen models use the same options structure
 */
export type GeminiImageModelProviderOptionsByName = {
  [K in GeminiImageModels]: GeminiImageProviderOptions
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
 * Aspect ratios supported by Gemini native image models (via generateContent API).
 * Matches the SDK's ImageConfig.aspectRatio values.
 */
export type GeminiNativeImageAspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '21:9'

/**
 * Resolution tiers for Gemini native image models.
 * Matches the SDK's ImageConfig.imageSize values.
 */
export type GeminiNativeImageResolution = '1K' | '2K' | '4K'

/**
 * Template literal size type for Gemini native image models: "16:9_4K", "1:1_2K", etc.
 */
export type GeminiNativeImageSize =
  `${GeminiNativeImageAspectRatio}_${GeminiNativeImageResolution}`

/**
 * Gemini native image models that use the generateContent API path.
 * These models support template literal sizes (aspectRatio_resolution).
 */
export type GeminiNativeImageModels =
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-3-pro-image-preview'
  | 'gemini-2.5-flash-image'
  | 'gemini-2.0-flash-preview-image-generation'

/**
 * Model-specific size options mapping.
 * Gemini native image models use template literal sizes, Imagen models use pixel sizes.
 */
export type GeminiImageModelSizeByName = {
  [K in GeminiNativeImageModels]: GeminiNativeImageSize
} & {
  [K in Exclude<GeminiImageModels, GeminiNativeImageModels>]: GeminiImageSize
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
 * Validates the number of images requested
 * Imagen models support 1-8 images per request (varies by model)
 */
export function validateNumberOfImages(
  model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  // Most Imagen models support 1-4 images, some support up to 8
  const maxImages = 4
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
 * Format: "aspectRatio_resolution" e.g. "16:9_4K" → { aspectRatio: "16:9", resolution: "4K" }
 */
export function parseNativeImageSize(
  size: string,
): { aspectRatio: string; resolution: string } | undefined {
  const match = size.match(/^(\d+:\d+)_(.+)$/)
  if (!match) return undefined
  return { aspectRatio: match[1]!, resolution: match[2]! }
}
