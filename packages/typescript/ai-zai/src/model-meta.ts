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
  /**
   * Type-level description of which provider options this model supports.
   */
  providerOptions?: TProviderOptions
}

/**
 * GLM-4.7: Latest flagship model
 * Released December 2025
 * Features enhanced coding, reasoning, and agentic capabilities
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
    features: [
      'streaming',
      'function_calling',
      'structured_outputs',
    ],
    tools: [
      'web_search',
      'code_interpreter',
      'mcp',
    ],
  },
  pricing: {
    input: {
      normal: 0.001,
      cached: 0.0005,
    },
    output: {
      normal: 0.002,
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
    features: [
      'streaming',
      'function_calling',
      'structured_outputs',
    ],
    tools: [
      'web_search',
      'image_generation',
      'code_interpreter',
      'mcp',
    ],
  },
  pricing: {
    input: {
      normal: 0.002,
    },
    output: {
      normal: 0.003,
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
 * Released September 2025
 * Enhanced coding and reasoning capabilities
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
    features: [
      'streaming',
      'function_calling',
      'structured_outputs',
    ],
    tools: [
      'web_search',
      'code_interpreter',
    ],
  },
  pricing: {
    input: {
      normal: 0.001,
    },
    output: {
      normal: 0.002,
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

export const ZAI_CHAT_MODELS = [
  GLM_4_7.name,
  GLM_4_6V.name,
  GLM_4_6.name,
] as const

export type ZAIModelMap = {
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
 * Mapping of Z.AI model names to their supported input modalities.
 */
export type ZAIModelInputModalitiesByName = {
  [GLM_4_7.name]: typeof GLM_4_7.supports.input
  [GLM_4_6V.name]: typeof GLM_4_6V.supports.input
  [GLM_4_6.name]: typeof GLM_4_6.supports.input
}

/**
 * Complete metadata registry for Z.AI models.
 */
export const ZAI_MODEL_META = {
  [GLM_4_7.name]: GLM_4_7,
  [GLM_4_6V.name]: GLM_4_6V,
  [GLM_4_6.name]: GLM_4_6,
} as const
