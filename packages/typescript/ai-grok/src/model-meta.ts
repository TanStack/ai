/**
 * Grok Chat Models
 * Based on xAI's available models as of 2025
 */
export const GROK_CHAT_MODELS = [
  'grok-4',
  'grok-3',
  'grok-3-mini',
  'grok-2-vision-1212',
  'grok-4-fast',
  'grok-4.1-fast',
] as const

/**
 * Grok Image Generation Models
 */
export const GROK_IMAGE_MODELS = ['grok-2-image-1212'] as const

/**
 * Type-only map from Grok chat model name to its supported input modalities.
 * Used for type inference when constructing multimodal messages.
 */
export type GrokModelInputModalitiesByName = {
  // Text-only models
  'grok-4': readonly ['text']
  'grok-3': readonly ['text']
  'grok-3-mini': readonly ['text']
  'grok-4-fast': readonly ['text']
  'grok-4.1-fast': readonly ['text']
  // Vision-capable model (text + image)
  'grok-2-vision-1212': readonly ['text', 'image']
}

/**
 * Type-only map from Grok chat model name to its provider options type.
 * Since Grok uses OpenAI-compatible API, we can reuse OpenAI provider options patterns.
 * For now, all models share the same provider options structure.
 */
export type GrokChatModelProviderOptionsByName = {
  [K in (typeof GROK_CHAT_MODELS)[number]]: GrokProviderOptions
}

/**
 * Grok-specific provider options
 * Based on OpenAI-compatible API options
 */
export interface GrokProviderOptions {
  /** Temperature for response generation (0-2) */
  temperature?: number
  /** Maximum tokens in the response */
  max_tokens?: number
  /** Top-p sampling parameter */
  top_p?: number
  /** Frequency penalty (-2.0 to 2.0) */
  frequency_penalty?: number
  /** Presence penalty (-2.0 to 2.0) */
  presence_penalty?: number
  /** Stop sequences */
  stop?: string | Array<string>
  /** A unique identifier representing your end-user */
  user?: string
}

// ===========================
// Type Resolution Helpers
// ===========================

/**
 * Resolve provider options for a specific model.
 * If the model has explicit options in the map, use those; otherwise use base options.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof GrokChatModelProviderOptionsByName
    ? GrokChatModelProviderOptionsByName[TModel]
    : GrokProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GrokModelInputModalitiesByName
    ? GrokModelInputModalitiesByName[TModel]
    : readonly ['text']
