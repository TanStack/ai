export type GptImageQuality = 'high' | 'medium' | 'low' | 'auto'

export type DallE3Quality = 'hd' | 'standard'

export type DallE2Quality = 'standard'

export type DallE3Style = 'vivid' | 'natural'

export type GptImageOutputFormat = 'png' | 'jpeg' | 'webp'

export type DallEResponseFormat = 'url' | 'b64_json'

export type GptImageBackground = 'transparent' | 'opaque' | 'auto'

export type GptImageModeration = 'low' | 'auto'

export type GptImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto'

export type DallE3Size = '1024x1024' | '1792x1024' | '1024x1792'

export type DallE2Size = '256x256' | '512x512' | '1024x1024'

export interface OpenAIImageBaseProviderOptions {
  user?: string
}

export interface GptImage1ProviderOptions extends OpenAIImageBaseProviderOptions {
  quality?: GptImageQuality

  background?: GptImageBackground

  output_format?: GptImageOutputFormat

  output_compression?: number

  moderation?: GptImageModeration

  partial_images?: number
}

export type GptImage1MiniProviderOptions = GptImage1ProviderOptions

export interface DallE3ProviderOptions extends OpenAIImageBaseProviderOptions {
  quality?: DallE3Quality

  style?: DallE3Style

  response_format?: DallEResponseFormat
}

export interface DallE2ProviderOptions extends OpenAIImageBaseProviderOptions {
  quality?: DallE2Quality

  response_format?: DallEResponseFormat
}

export type OpenAIImageProviderOptions =
  | GptImage1ProviderOptions
  | GptImage1MiniProviderOptions
  | DallE3ProviderOptions
  | DallE2ProviderOptions

export type OpenAIImageModelProviderOptionsByName = {
  'gpt-image-2': GptImage1ProviderOptions
  'gpt-image-1': GptImage1ProviderOptions
  'gpt-image-1-mini': GptImage1MiniProviderOptions
  'dall-e-3': DallE3ProviderOptions
  'dall-e-2': DallE2ProviderOptions
}

export type OpenAIImageModelSizeByName = {
  'gpt-image-2': GptImageSize
  'gpt-image-1': GptImageSize
  'gpt-image-1-mini': GptImageSize
  'dall-e-3': DallE3Size
  'dall-e-2': DallE2Size
}

export type OpenAIImageModelInputModalitiesByName = {
  'gpt-image-2': readonly ['image']
  'gpt-image-1': readonly ['image']
  'gpt-image-1-mini': readonly ['image']
  'dall-e-3': readonly []
  'dall-e-2': readonly ['image']
}

interface ImageValidationOptions {
  prompt: string
  model: string
  background?: 'transparent' | 'opaque' | 'auto' | null
}

export function validateImageSize(
  model: string,
  size: string | undefined,
): void {
  if (size && size !== 'auto') {
    const validSizes: Record<string, Array<string>> = {
      'gpt-image-2': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
      'gpt-image-1': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
      'gpt-image-1-mini': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
      'dall-e-3': ['1024x1024', '1792x1024', '1024x1792'],
      'dall-e-2': ['256x256', '512x512', '1024x1024'],
    }

    const modelSizes = validSizes[model]
    if (!modelSizes) {
      throw new Error(`Unknown image model: ${model}`)
    }

    if (!modelSizes.includes(size)) {
      throw new Error(
        `Size "${size}" is not supported by model "${model}". ` +
          `Supported sizes: ${modelSizes.join(', ')}`,
      )
    }
  }
}

export function validateNumberOfImages(
  model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  // dall-e-3 only supports n=1
  const isDallE3Batch = model === 'dall-e-3' && numberOfImages !== 1
  if (isDallE3Batch) {
    throw new Error(
      `Model "dall-e-3" only supports generating 1 image at a time. ` +
        `Requested: ${numberOfImages}`,
    )
  }

  // Other models support 1-10
  const isOutOfImageRange = numberOfImages < 1 || numberOfImages > 10
  if (isOutOfImageRange) {
    throw new Error(
      `Number of images must be between 1 and 10. Requested: ${numberOfImages}`,
    )
  }
}

export const validateBackground = (options: ImageValidationOptions) => {
  if (options.background) {
    const supportedModels = ['gpt-image-2', 'gpt-image-1', 'gpt-image-1-mini']
    if (!supportedModels.includes(options.model)) {
      throw new Error(
        `The model ${options.model} does not support background option.`,
      )
    }
  }
}

export const validatePrompt = (options: ImageValidationOptions) => {
  if (options.prompt.length === 0) {
    throw new Error('Prompt cannot be empty.')
  }
  const isGptImagePromptTooLong =
    (options.model === 'gpt-image-2' ||
      options.model === 'gpt-image-1' ||
      options.model === 'gpt-image-1-mini') &&
    options.prompt.length > 32000
  if (isGptImagePromptTooLong) {
    throw new Error(
      'For gpt-image-2/gpt-image-1/gpt-image-1-mini, prompt length must be less than or equal to 32000 characters.',
    )
  }
  const isDallE2PromptTooLong =
    options.model === 'dall-e-2' && options.prompt.length > 1000
  if (isDallE2PromptTooLong) {
    throw new Error(
      'For dall-e-2, prompt length must be less than or equal to 1000 characters.',
    )
  }
  const isDallE3PromptTooLong =
    options.model === 'dall-e-3' && options.prompt.length > 4000
  if (isDallE3PromptTooLong) {
    throw new Error(
      'For dall-e-3, prompt length must be less than or equal to 4000 characters.',
    )
  }
}
