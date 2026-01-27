/**
 * Model metadata interface for documentation and type inference
 */
interface ModelMeta {
  name: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
    output: Array<'text' | 'image' | 'audio' | 'video'>
    capabilities?: Array<'reasoning' | 'tool_calling' | 'structured_outputs'>
  }
  max_input_tokens?: number
  max_output_tokens?: number
  context_window?: number
  knowledge_cutoff?: string
  pricing?: {
    input: {
      normal: number
      cached?: number
    }
    output: {
      normal: number
    }
  }
}

const DEEPSEEK_V3 = {
  name: 'deepseek-chat',
  context_window: 65_536,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 0.14,
      cached: 0.014,
    },
    output: {
      normal: 0.28,
    },
  },
} as const satisfies ModelMeta

const DEEPSEEK_REASONER = {
  name: 'deepseek-reasoner',
  context_window: 65_536,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning'],
  },
  pricing: {
    input: {
      normal: 0.55,
      cached: 0.055,
    },
    output: {
      normal: 2.19,
    },
  },
} as const satisfies ModelMeta

const DEEPSEEK_CODER_V2_INSTRUCT = {
  name: 'deepseek-coder',
  context_window: 163_840,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 0.14,
      cached: 0.014,
    },
    output: {
      normal: 0.28,
    },
  },
} as const satisfies ModelMeta

/**
 * DeepSeek Chat Models
 * Based on DeepSeek's available models as of 2025
 */
export const DEEPSEEK_CHAT_MODELS = [
  DEEPSEEK_V3.name,
  DEEPSEEK_REASONER.name,
  DEEPSEEK_CODER_V2_INSTRUCT.name,
] as const

/**
 * Type-only map from DeepSeek chat model name to its supported input modalities.
 * Used for type inference when constructing multimodal messages.
 */
export type DeepSeekModelInputModalitiesByName = {
  [DEEPSEEK_V3.name]: typeof DEEPSEEK_V3.supports.input
  [DEEPSEEK_REASONER.name]: typeof DEEPSEEK_REASONER.supports.input
  [DEEPSEEK_CODER_V2_INSTRUCT.name]: typeof DEEPSEEK_CODER_V2_INSTRUCT.supports.input
}

/**
 * Type-only map from DeepSeek chat model name to its provider options type.
 * Since DeepSeek uses OpenAI-compatible API, we reuse OpenAI provider options.
 */
export type DeepSeekChatModelProviderOptionsByName = {
  [K in (typeof DEEPSEEK_CHAT_MODELS)[number]]: DeepSeekProviderOptions
}

/**
 * DeepSeek-specific provider options
 * Based on OpenAI-compatible API options
 */
export interface DeepSeekProviderOptions {
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
  TModel extends keyof DeepSeekChatModelProviderOptionsByName
    ? DeepSeekChatModelProviderOptionsByName[TModel]
    : DeepSeekProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof DeepSeekModelInputModalitiesByName
    ? DeepSeekModelInputModalitiesByName[TModel]
    : readonly ['text']
