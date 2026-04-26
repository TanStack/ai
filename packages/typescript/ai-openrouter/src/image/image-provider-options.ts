import type { OPENROUTER_IMAGE_MODELS } from '../model-meta'

/**
 * Base image generation options supported by OpenRouter
 */
export interface OpenRouterImageProviderOptions {
  /**
   * Image resolution (Gemini models)
   * '1K' = 1024x1024, '2K' = 2048x2048, '4K' = 4096x4096
   */
  image_size?: '1K' | '2K' | '4K'
}

/**
 * Per-model provider options for image generation
 * All models currently support the same base options
 */
export type OpenRouterImageModelProviderOptionsByName = {
  [K in (typeof OPENROUTER_IMAGE_MODELS)[number]]: OpenRouterImageProviderOptions
}

/**
 * Per-model default image sizes
 * All models currently default to '1024x1024'
 */
export type OpenRouterImageModelSizeByName = {
  [K in (typeof OPENROUTER_IMAGE_MODELS)[number]]:
    | '1024x1024' // "1:1"
    | '832×1248' // "2:3"
    | '1248×832' // "3:2"
    | '864×1184' // "3:4"
    | '1184×864' // "4:3"
    | '896×1152' // "4:5"
    | '1152×896' // "5:4"
    | '768×1344' // "9:16"
    | '1344×768' // "16:9"
    | '1536×672' // "21:9"
}
