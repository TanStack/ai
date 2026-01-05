export interface OpenRouterImageProviderOptions {
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | string
}

export interface OpenRouterImageModelProviderOptionsByName {
  [key: string]: OpenRouterImageProviderOptions
}

export interface OpenRouterImageModelSizeByName {
  [key: string]: string
}
