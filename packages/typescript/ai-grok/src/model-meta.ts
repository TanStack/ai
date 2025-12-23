import type { ReasoningOptions } from './text/text-provider-options'
import type { GrokTextProviderOptions } from './adapters/text'
import type { GrokImageProviderOptions } from './image/image-provider-options'

interface ModelMeta<TProviderOptions = unknown> {
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
  /**
   * Type-level description of which provider options this model supports.
   */
  providerOptions?: TProviderOptions
}

const GROK_4_1_FAST_REASONING = {
  name: 'grok-4.1-fast-reasoning',
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
} as const satisfies ModelMeta<GrokTextProviderOptions>

const GROK_4_1_FAST_NON_REASONING = {
  name: 'grok-4.1-fast-non-reasoning',
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
} as const satisfies ModelMeta<GrokTextProviderOptions>

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
} as const satisfies ModelMeta<GrokTextProviderOptions>

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
} as const satisfies ModelMeta<GrokTextProviderOptions>

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
} as const satisfies ModelMeta<GrokTextProviderOptions>

const GROK_4_0709 = {
  name: 'grok-4-0709',
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
} as const satisfies ModelMeta<GrokTextProviderOptions>

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
} as const satisfies ModelMeta<GrokTextProviderOptions>

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
} as const satisfies ModelMeta<GrokTextProviderOptions>

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
} as const satisfies ModelMeta<GrokTextProviderOptions>

const GROK_2_IMAGE = {
  name: 'grok-2-image-1212',
  supports: {
    input: ['text'],
    output: ['text'],
  },
  pricing: {
    input: {
      normal: 0.07,
    },
    output: {
      normal: 0.07,
    },
  },
} as const satisfies ModelMeta<GrokTextProviderOptions>
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
  GROK_4_0709.name,
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
  // Text-only models
  [GROK_4_1_FAST_REASONING.name]: typeof GROK_4_1_FAST_REASONING.supports.input
  [GROK_4_1_FAST_NON_REASONING.name]: typeof GROK_4_1_FAST_NON_REASONING.supports.input
  [GROK_CODE_FAST_1.name]: typeof GROK_CODE_FAST_1.supports.input
  [GROK_4_FAST_REASONING.name]: typeof GROK_4_FAST_REASONING.supports.input
  [GROK_4_FAST_NON_REASONING.name]: typeof GROK_4_FAST_NON_REASONING.supports.input
  [GROK_4_0709.name]: typeof GROK_4_0709.supports.input
  [GROK_3.name]: typeof GROK_3.supports.input
  [GROK_3_MINI.name]: typeof GROK_3_MINI.supports.input
  // Multimodal model
  [GROK_2_VISION.name]: typeof GROK_2_VISION.supports.input
}

/**
 * Type-only map from Grok chat model name to its provider options type.
 * Since Grok uses OpenAI-compatible API, we can reuse OpenAI provider options patterns.
 * For now, all models share the same provider options structure.
 */
export type GrokChatModelProviderOptionsByName = {
  [GROK_4_1_FAST_REASONING.name]: GrokTextProviderOptions & ReasoningOptions
  [GROK_4_1_FAST_NON_REASONING.name]: GrokTextProviderOptions
  [GROK_CODE_FAST_1.name]: GrokTextProviderOptions & ReasoningOptions
  [GROK_4_FAST_REASONING.name]: GrokTextProviderOptions & ReasoningOptions
  [GROK_4_FAST_NON_REASONING.name]: GrokTextProviderOptions
  [GROK_4_0709.name]: GrokTextProviderOptions & ReasoningOptions
  [GROK_3.name]: GrokTextProviderOptions
  [GROK_3_MINI.name]: GrokTextProviderOptions & ReasoningOptions
  [GROK_2_VISION.name]: GrokTextProviderOptions
}

/**
 * Grok-specific provider options
 * Based on OpenAI-compatible API options
 */
export interface GrokProviderOptions {
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
    : GrokTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GrokModelInputModalitiesByName
    ? GrokModelInputModalitiesByName[TModel]
    : readonly ['text']

/**
 * Type-only map from model name to its specific provider options.
 */
export type GrokImageModelProviderOptionsByName = {
  [GROK_2_IMAGE.name]: GrokImageProviderOptions
}

/**
 * Type-only map from model name to its supported sizes.
 */
export type GrokImageModelSizeByName = {
  [GROK_2_IMAGE.name]: never
}
