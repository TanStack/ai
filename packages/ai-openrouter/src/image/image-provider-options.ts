import type { OPENROUTER_IMAGE_MODELS } from '../model-meta'

export interface OpenRouterImageProviderOptions {
  image_size?: '1K' | '2K' | '4K'
  strength?: number
}

export type OpenRouterImageModelProviderOptionsByName = {
  [K in (typeof OPENROUTER_IMAGE_MODELS)[number]]: OpenRouterImageProviderOptions
}

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

export type OpenRouterImageModelInputModalitiesByName = {
  [K in (typeof OPENROUTER_IMAGE_MODELS)[number]]: readonly ['image']
}
