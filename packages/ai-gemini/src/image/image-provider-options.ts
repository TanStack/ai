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

export type GeminiAspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '9:21'
  | '21:9'

export interface GeminiImageProviderOptions {
  aspectRatio?: GeminiAspectRatio

  personGeneration?: PersonGeneration

  safetyFilterLevel?: SafetyFilterLevel

  seed?: number

  addWatermark?: boolean

  language?: ImagePromptLanguage

  negativePrompt?: string

  outputMimeType?: 'image/png' | 'image/jpeg' | 'image/webp'

  outputCompressionQuality?: number

  guidanceScale?: number

  enhancePrompt?: boolean

  includeSafetyAttributes?: boolean

  includeRaiReason?: boolean

  outputGcsUri?: string

  labels?: Record<string, string>
}

export interface GeminiNativeImageProviderOptions {
  seed?: number

  safetySettings?: Array<SafetySetting>

  thinkingConfig?: ThinkingConfig

  imageConfig?: GeminiNativeImageConfig

  systemInstruction?: ContentUnion
}

export type GeminiAnyImageProviderOptions = GeminiImageProviderOptions &
  GeminiNativeImageProviderOptions

export type GeminiImageModelProviderOptionsByName = {
  [K in GeminiNativeImageModels]: GeminiNativeImageProviderOptions
} & {
  [K in Exclude<
    GeminiImageModels,
    GeminiNativeImageModels
  >]: GeminiImageProviderOptions
}

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

export type GeminiExtendedImageAspectRatio =
  | GeminiStandardImageAspectRatio
  | '1:4'
  | '4:1'
  | '1:8'
  | '8:1'

export type Gemini31FlashImageSize =
  `${GeminiExtendedImageAspectRatio}_${'512' | '1K' | '2K' | '4K'}`

export type Gemini31FlashLiteImageSize = `${GeminiExtendedImageAspectRatio}_1K`

export type Gemini3ProImageSize =
  `${GeminiStandardImageAspectRatio}_${'1K' | '2K' | '4K'}`

export type Gemini25FlashImageSize = GeminiStandardImageAspectRatio

export type GeminiNativeImageConfig = {
  aspectRatio?: GeminiExtendedImageAspectRatio
  imageSize?: '512' | '1K' | '2K' | '4K'
}

export type GeminiNativeImageSize =
  | Gemini31FlashImageSize
  | Gemini31FlashLiteImageSize
  | Gemini3ProImageSize
  | Gemini25FlashImageSize

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

export function isGeminiNativeImageModel(model: string): boolean {
  return NATIVE_IMAGE_MODEL_NAMES.has(model)
}

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

export type GeminiImageModelInputModalitiesByName = {
  [K in GeminiNativeImageModels]: readonly ['image']
} & {
  [K in Exclude<GeminiImageModels, GeminiNativeImageModels>]: readonly []
}

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

export function sizeToAspectRatio(
  size: string | undefined,
): GeminiAspectRatio | undefined {
  if (!size) return undefined
  return GEMINI_SIZE_TO_ASPECT_RATIO[size]
}

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

const IMAGEN_MAX_IMAGES_BY_MODEL: Record<string, number> = {
  'imagen-4.0-generate-001': 4,
  'imagen-4.0-ultra-generate-001': 4,
  'imagen-4.0-fast-generate-001': 4,
}

const DEFAULT_IMAGEN_MAX_IMAGES = 4

export function validateNumberOfImages(
  model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  const maxImages =
    IMAGEN_MAX_IMAGES_BY_MODEL[model] ?? DEFAULT_IMAGEN_MAX_IMAGES
  const isOutOfRange = numberOfImages < 1 || numberOfImages > maxImages
  if (isOutOfRange) {
    throw new Error(
      `Invalid numberOfImages "${numberOfImages}" for model "${model}". ` +
        `Must be between 1 and ${maxImages}.`,
    )
  }
}

export function validatePrompt(options: {
  prompt: string
  model: string
}): void {
  const { prompt, model } = options
  const isEmptyPrompt = !prompt || prompt.trim().length === 0
  if (isEmptyPrompt) {
    throw new Error(`Prompt cannot be empty for model "${model}".`)
  }
}

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
