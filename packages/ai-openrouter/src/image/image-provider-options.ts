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
  /**
   * Image-to-image influence (0.0–1.0): how strongly the input image
   * constrains the output. Lower values stay closer to the input; higher
   * values give the model more freedom. Only meaningful for
   * image-to-image-capable models that document `image_config.strength`
   * (e.g. Recraft) — other providers ignore it.
   */
  strength?: number
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
    | '1024x1024'
    | '832x1248'
    | '1248x832'
    | '864x1184'
    | '1184x864'
    | '896x1152'
    | '1152x896'
    | '768x1344'
    | '1344x768'
    | '1536x672'
}

/**
 * Per-model prompt input modalities. OpenRouter routes image generation
 * through the chat-completions surface where every listed image model
 * (Gemini image family, GPT image family) accepts `image_url` content
 * parts, so image-conditioned prompts are supported across the board.
 */
export type OpenRouterImageModelInputModalitiesByName = {
  [K in (typeof OPENROUTER_IMAGE_MODELS)[number]]: readonly ['image']
}
