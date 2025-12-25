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

const GROK_4_1_FAST_REASONING = {
  name: 'grok-4-1-fast-reasoning',
  context_window: 2_000_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 0.2,
      cached: 0.05,
    },
    output: {
      normal: 0.5,
    },
  },
} as const satisfies ModelMeta

const GROK_4_1_FAST_NON_REASONING = {
  name: 'grok-4-1-fast-non-reasoning',
  context_window: 2_000_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 0.2,
      cached: 0.05,
    },
    output: {
      normal: 0.5,
    },
  },
} as const satisfies ModelMeta

const GROK_CODE_FAST_1 = {
  name: 'grok-code-fast-1',
  context_window: 256_000,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 0.2,
      cached: 0.02,
    },
    output: {
      normal: 1.5,
    },
  },
} as const satisfies ModelMeta

const GROK_4_FAST_REASONING = {
  name: 'grok-4-fast-reasoning',
  context_window: 2_000_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 0.2,
      cached: 0.05,
    },
    output: {
      normal: 0.5,
    },
  },
} as const satisfies ModelMeta

const GROK_4_FAST_NON_REASONING = {
  name: 'grok-4-fast-non-reasoning',
  context_window: 2_000_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 0.2,
      cached: 0.05,
    },
    output: {
      normal: 0.5,
    },
  },
} as const satisfies ModelMeta

const GROK_4 = {
  name: 'grok-4',
  context_window: 256_000,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 3,
      cached: 0.75,
    },
    output: {
      normal: 15,
    },
  },
} as const satisfies ModelMeta

const GROK_3_MINI = {
  name: 'grok-3-mini',
  context_window: 131_072,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 0.3,
      cached: 0.075,
    },
    output: {
      normal: 0.5,
    },
  },
} as const satisfies ModelMeta

const GROK_3 = {
  name: 'grok-3',
  context_window: 131_072,
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 3,
      cached: 0.75,
    },
    output: {
      normal: 15,
    },
  },
} as const satisfies ModelMeta

const GROK_2_VISION = {
  name: 'grok-2-vision-1212',
  context_window: 32_768,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['structured_outputs', 'tool_calling'],
  },
  pricing: {
    input: {
      normal: 2,
    },
    output: {
      normal: 10,
    },
  },
} as const satisfies ModelMeta

const GROK_2_IMAGE = {
  name: 'grok-2-image-1212',
  supports: {
    input: ['text'],
    output: ['image'],
  },
  pricing: {
    input: {
      normal: 0.07,
    },
    output: {
      normal: 0.07,
    },
  },
} as const satisfies ModelMeta

/**
 * Grok Chat Models
 * Based on xAI's available models as of 2025
 */
export const GROK_CHAT_MODELS = [
  GROK_4_1_FAST_REASONING.name,
  GROK_4_1_FAST_NON_REASONING.name,
  GROK_CODE_FAST_1.name,
  GROK_4_FAST_REASONING.name,
  GROK_4_FAST_NON_REASONING.name,
  GROK_4.name,
  GROK_3.name,
  GROK_3_MINI.name,
  GROK_2_VISION.name,
] as const

/**
 * Grok Image Generation Models
 */
export const GROK_IMAGE_MODELS = [GROK_2_IMAGE.name] as const

/**
 * Type-only map from Grok chat model name to its supported input modalities.
 * Used for type inference when constructing multimodal messages.
 */
export type GrokModelInputModalitiesByName = {
  [GROK_4_1_FAST_REASONING.name]: typeof GROK_4_1_FAST_REASONING.supports.input
  [GROK_4_1_FAST_NON_REASONING.name]: typeof GROK_4_1_FAST_NON_REASONING.supports.input
  [GROK_CODE_FAST_1.name]: typeof GROK_CODE_FAST_1.supports.input
  [GROK_4_FAST_REASONING.name]: typeof GROK_4_FAST_REASONING.supports.input
  [GROK_4_FAST_NON_REASONING.name]: typeof GROK_4_FAST_NON_REASONING.supports.input
  [GROK_4.name]: typeof GROK_4.supports.input
  [GROK_3.name]: typeof GROK_3.supports.input
  [GROK_3_MINI.name]: typeof GROK_3_MINI.supports.input
  [GROK_2_VISION.name]: typeof GROK_2_VISION.supports.input
}

/**
 * Type-only map from Grok chat model name to its provider options type.
 * Since Grok uses OpenAI-compatible API, we reuse OpenAI provider options.
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
