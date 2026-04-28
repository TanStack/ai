import type {
  ZAIBaseOptions,
  ZAIMetadataOptions,
  ZAIReasoningOptions,
  ZAIStreamingOptions,
  ZAIStructuredOutputOptions,
  ZAIToolsOptions,
} from './text/text-provider-options'

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video'>
    output: Array<'text' | 'image' | 'audio' | 'video'>
    endpoints: Array<
      | 'chat'
      | 'chat-completions'
      | 'assistants'
      | 'speech_generation'
      | 'image-generation'
      | 'fine-tuning'
      | 'batch'
      | 'image-edit'
      | 'moderation'
      | 'translation'
      | 'realtime'
      | 'audio'
      | 'video'
      | 'transcription'
    >
    features: Array<
      | 'streaming'
      | 'function_calling'
      | 'structured_outputs'
      | 'predicted_outcomes'
      | 'distillation'
      | 'fine_tuning'
    >
    tools?: Array<
      | 'web_search'
      | 'file_search'
      | 'image_generation'
      | 'code_interpreter'
      | 'mcp'
      | 'computer_use'
    >
  }
  context_window?: number
  max_output_tokens?: number
  knowledge_cutoff?: string
  pricing: {
    input: {
      normal: number
      cached?: number
    }
    output: {
      normal: number
    }
  }
  providerOptions?: TProviderOptions
}

// ============================================================================
// GLM-5 Series
// ============================================================================

/**
 * GLM-5.1: Long-horizon task flagship model
 * Released April 2026
 * Designed for long-running autonomous tasks (up to 8 hours),
 * with enhanced coding, reasoning, and agentic capabilities.
 * Pricing: $1.4/M input, $0.26/M cached, $4.4/M output
 */
const GLM_5_1 = {
  name: 'glm-5.1',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2026-03-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat', 'chat-completions'],
    features: ['streaming', 'function_calling', 'structured_outputs'],
    tools: ['web_search', 'code_interpreter', 'mcp'],
  },
  pricing: {
    input: {
      normal: 1.4,
      cached: 0.26,
    },
    output: {
      normal: 4.4,
    },
  },
} as const satisfies ModelMeta<
  ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
>

/**
 * GLM-5-Turbo: Fast high-performance text model
 * Released April 2026
 * Optimized for speed with strong coding and reasoning capabilities.
 * Pricing: $1.2/M input, $0.24/M cached, $4.0/M output
 */
const GLM_5_TURBO = {
  name: 'glm-5-turbo',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2026-03-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat', 'chat-completions'],
    features: ['streaming', 'function_calling', 'structured_outputs'],
    tools: ['web_search', 'code_interpreter', 'mcp'],
  },
  pricing: {
    input: {
      normal: 1.2,
      cached: 0.24,
    },
    output: {
      normal: 4.0,
    },
  },
} as const satisfies ModelMeta<
  ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
>

/**
 * GLM-5: Base fifth-generation text model
 * Released April 2026
 * Strong general-purpose capabilities with tool use support.
 * Pricing: $1.0/M input, $0.2/M cached, $3.2/M output
 */
const GLM_5 = {
  name: 'glm-5',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2026-03-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat', 'chat-completions'],
    features: ['streaming', 'function_calling', 'structured_outputs'],
    tools: ['web_search', 'code_interpreter', 'mcp'],
  },
  pricing: {
    input: {
      normal: 1.0,
      cached: 0.2,
    },
    output: {
      normal: 3.2,
    },
  },
} as const satisfies ModelMeta<
  ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
>

/**
 * GLM-5V-Turbo: Multimodal Agent foundation model
 * Released April 2026
 * First multimodal agent model from Zhipu, supports image, video, file, and text input.
 * Optimized for visual programming and complex agent workflows.
 * Pricing: $1.2/M input, $0.24/M cached, $4.0/M output
 */
const GLM_5V_TURBO = {
  name: 'glm-5v-turbo',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2026-03-01',
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    endpoints: ['chat', 'chat-completions'],
    features: ['streaming', 'function_calling', 'structured_outputs'],
    tools: ['web_search', 'image_generation', 'code_interpreter', 'mcp'],
  },
  pricing: {
    input: {
      normal: 1.2,
      cached: 0.24,
    },
    output: {
      normal: 4.0,
    },
  },
} as const satisfies ModelMeta<
  ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
>

// ============================================================================
// GLM-4 Series
// ============================================================================

/**
 * GLM-4.7: Previous flagship model
 * Released December 2025
 * Features enhanced coding, reasoning, and agentic capabilities
 * Pricing: $0.6/M input, $0.11/M cached, $2.2/M output
 */
const GLM_4_7 = {
  name: 'glm-4.7',
  context_window: 200_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2025-12-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat', 'chat-completions'],
    features: ['streaming', 'function_calling', 'structured_outputs'],
    tools: ['web_search', 'code_interpreter', 'mcp'],
  },
  pricing: {
    input: {
      normal: 0.6,
      cached: 0.11,
    },
    output: {
      normal: 2.2,
    },
  },
} as const satisfies ModelMeta<
  ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
>

/**
 * GLM-4.6V: Multimodal vision model
 * Released December 2024
 * Supports text, image, and video inputs
 */
const GLM_4_6V = {
  name: 'glm-4.6v',
  context_window: 128_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2024-12-01',
  supports: {
    input: ['text', 'image', 'video'],
    output: ['text'],
    endpoints: ['chat', 'chat-completions'],
    features: ['streaming', 'function_calling', 'structured_outputs'],
    tools: ['web_search', 'image_generation', 'code_interpreter', 'mcp'],
  },
  pricing: {
    input: {
      normal: 0.14,
    },
    output: {
      normal: 0.42,
    },
  },
} as const satisfies ModelMeta<
  ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
>

/**
 * GLM-4.6: Previous flagship model
 * Released September 2024
 * Enhanced coding and reasoning capabilities
 * Pricing: $0.6/M input, $0.11/M cached, $2.2/M output
 */
const GLM_4_6 = {
  name: 'glm-4.6',
  context_window: 128_000,
  max_output_tokens: 128_000,
  knowledge_cutoff: '2024-09-01',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat', 'chat-completions'],
    features: ['streaming', 'function_calling', 'structured_outputs'],
    tools: ['web_search', 'code_interpreter'],
  },
  pricing: {
    input: {
      normal: 0.6,
      cached: 0.11,
    },
    output: {
      normal: 2.2,
    },
  },
} as const satisfies ModelMeta<
  ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
>

// ============================================================================
// Exports
// ============================================================================

export const ZAI_CHAT_MODELS = [
  // GLM-5 series
  GLM_5_1.name,
  GLM_5_TURBO.name,
  GLM_5.name,
  GLM_5V_TURBO.name,
  // GLM-4 series
  GLM_4_7.name,
  GLM_4_6V.name,
  GLM_4_6.name,
] as const

export type ZAIChatModel = (typeof ZAI_CHAT_MODELS)[number]

/**
 * Type-only map from chat model name to its provider options type.
 * Used by the core AI types (via the adapter) to narrow
 * `providerOptions` based on the selected model.
 *
 * Manually defined to ensure accurate type narrowing per model.
 */
export type ZAIChatModelProviderOptionsByName = {
  // GLM-5 series
  [GLM_5_1.name]: ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
  [GLM_5_TURBO.name]: ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
  [GLM_5.name]: ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
  [GLM_5V_TURBO.name]: ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
  // GLM-4 series
  [GLM_4_7.name]: ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
  [GLM_4_6V.name]: ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
  [GLM_4_6.name]: ZAIBaseOptions &
    ZAIReasoningOptions &
    ZAIStructuredOutputOptions &
    ZAIToolsOptions &
    ZAIStreamingOptions &
    ZAIMetadataOptions
}

/**
 * Type-only map from chat model name to its supported provider tools.
 * Keyed on each model's `.name` field. Value is the `typeof supports.tools`
 * tuple from each model constant.
 */
export type ZAIChatModelToolCapabilitiesByName = {
  [GLM_5_1.name]: typeof GLM_5_1.supports.tools
  [GLM_5_TURBO.name]: typeof GLM_5_TURBO.supports.tools
  [GLM_5.name]: typeof GLM_5.supports.tools
  [GLM_5V_TURBO.name]: typeof GLM_5V_TURBO.supports.tools
  [GLM_4_7.name]: typeof GLM_4_7.supports.tools
  [GLM_4_6V.name]: typeof GLM_4_6V.supports.tools
  [GLM_4_6.name]: typeof GLM_4_6.supports.tools
}

/**
 * Type-only map from chat model name to its supported input modalities.
 * Based on the 'supports.input' arrays defined for each model.
 * Used by the core AI types to constrain ContentPart types based on the selected model.
 */
export type ZAIModelInputModalitiesByName = {
  [GLM_5_1.name]: typeof GLM_5_1.supports.input
  [GLM_5_TURBO.name]: typeof GLM_5_TURBO.supports.input
  [GLM_5.name]: typeof GLM_5.supports.input
  [GLM_5V_TURBO.name]: typeof GLM_5V_TURBO.supports.input
  [GLM_4_7.name]: typeof GLM_4_7.supports.input
  [GLM_4_6V.name]: typeof GLM_4_6V.supports.input
  [GLM_4_6.name]: typeof GLM_4_6.supports.input
}

export const ZAI_MODEL_META = {
  [GLM_5_1.name]: GLM_5_1,
  [GLM_5_TURBO.name]: GLM_5_TURBO,
  [GLM_5.name]: GLM_5,
  [GLM_5V_TURBO.name]: GLM_5V_TURBO,
  [GLM_4_7.name]: GLM_4_7,
  [GLM_4_6V.name]: GLM_4_6V,
  [GLM_4_6.name]: GLM_4_6,
} as const
