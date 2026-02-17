import type { GroqTextProviderOptions } from './text/text-provider-options'

/**
 * Internal metadata structure describing a Groq model's capabilities and pricing.
 */
interface ModelMeta<TProviderOptions = unknown> {
  name: string
  context_window?: number
  max_completion_tokens?: number
  pricing: {
    input?: { normal: number; cached?: number }
    output?: { normal: number }
  }
  supports: {
    input: Array<'text' | 'image' | 'audio'>
    output: Array<'text' | 'audio'>
    endpoints: Array<'chat' | 'tts' | 'transcription' | 'batch'>

    features: Array<
      | 'streaming'
      | 'tools'
      | 'json_object'
      | 'browser_search'
      | 'code_execution'
      | 'reasoning'
      | 'content_moderation'
      | 'json_schema'
      | 'vision'
    >
  }
  /**
   * Type-level description of which provider options this model supports.
   */
  providerOptions?: TProviderOptions
}

const LLAMA_3_3_70B_VERSATILE = {
  name: 'llama-3.3-70b-versatile',
  context_window: 131_072,
  max_completion_tokens: 32_768,
  pricing: {
    input: {
      normal: 0.59,
    },
    output: {
      normal: 0.79,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const LLAMA_4_MAVERICK_17B_128E_INSTRUCT = {
  name: 'meta-llama/llama-4-maverick-17b-128e-instruct',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: {
      normal: 0.2,
    },
    output: {
      normal: 0.6,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const LLAMA_4_SCOUT_17B_16E_INSTRUCT = {
  name: 'meta-llama/llama-4-scout-17b-16e-instruct',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: {
      normal: 0.05,
    },
    output: {
      normal: 0.08,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const LLAMA_GUARD_4_12B = {
  name: 'meta-llama/llama-guard-4-12b',
  context_window: 131_072,
  max_completion_tokens: 1024,
  pricing: {
    input: {
      normal: 0.2,
    },
    output: {
      normal: 0.2,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'json_object', 'content_moderation', 'vision'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const LLAMA_PROMPT_GUARD_2_86M = {
  name: 'meta-llama/llama-prompt-guard-2-86m',
  context_window: 512,
  max_completion_tokens: 512,
  pricing: {
    input: {
      normal: 0.04,
    },
    output: {
      normal: 0.04,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'content_moderation', 'json_object'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const LLAMA_3_1_8B_INSTANT = {
  name: 'llama-3.1-8b-instant',
  context_window: 131_072,
  max_completion_tokens: 131_072,
  pricing: {
    input: {
      normal: 0.05,
    },
    output: {
      normal: 0.08,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'json_object', 'tools'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const LLAMA_PROMPT_GUARD_2_22M = {
  name: 'meta-llama/llama-prompt-guard-2-22m',
  context_window: 512,
  max_completion_tokens: 512,
  pricing: {
    input: {
      normal: 0.03,
    },
    output: {
      normal: 0.03,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'content_moderation'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const GPT_OSS_120B = {
  name: 'openai/gpt-oss-120b',
  context_window: 131_072,
  max_completion_tokens: 65_536,
  pricing: {
    input: {
      normal: 0.15,
      cached: 0.075,
    },
    output: {
      normal: 0.6,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'json_object',
      'json_schema',
      'tools',
      'browser_search',
      'code_execution',
      'reasoning',
    ],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const GPT_OSS_SAFEGUARD_20B = {
  name: 'openai/gpt-oss-safeguard-20b',
  context_window: 131_072,
  max_completion_tokens: 65_536,
  pricing: {
    input: {
      normal: 0.075,
      cached: 0.037,
    },
    output: {
      normal: 0.3,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'browser_search',
      'code_execution',
      'json_object',
      'json_schema',
      'reasoning',
      'content_moderation',
    ],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const GPT_OSS_20B = {
  name: 'openai/gpt-oss-20b',
  context_window: 131_072,
  max_completion_tokens: 65536,
  pricing: {
    input: {
      normal: 0.075,
      cached: 0.037,
    },
    output: {
      normal: 0.3,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'browser_search',
      'code_execution',
      'json_object',
      'json_schema',
      'reasoning',
    ],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const KIMI_K2_INSTRUCT_0905 = {
  name: 'moonshotai/kimi-k2-instruct-0905',
  context_window: 262_144,
  max_completion_tokens: 16_384,
  pricing: {
    input: {
      normal: 1,
      cached: 0.5,
    },
    output: {
      normal: 3,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'json_object', 'json_schema'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

const QWEN3_32B = {
  name: 'qwen/qwen3-32b',
  context_window: 131_072,
  max_completion_tokens: 40_960,
  pricing: {
    input: {
      normal: 0.29,
    },
    output: {
      normal: 0.59,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'reasoning'],
  },
} as const satisfies ModelMeta<GroqTextProviderOptions>

/**
 * All supported Groq chat model identifiers.
 */
export const GROQ_CHAT_MODELS = [
  LLAMA_3_1_8B_INSTANT.name,
  LLAMA_3_3_70B_VERSATILE.name,
  LLAMA_4_MAVERICK_17B_128E_INSTRUCT.name,
  LLAMA_4_SCOUT_17B_16E_INSTRUCT.name,
  LLAMA_GUARD_4_12B.name,
  LLAMA_PROMPT_GUARD_2_86M.name,
  LLAMA_PROMPT_GUARD_2_22M.name,
  GPT_OSS_20B.name,
  GPT_OSS_120B.name,
  GPT_OSS_SAFEGUARD_20B.name,
  KIMI_K2_INSTRUCT_0905.name,
  QWEN3_32B.name,
]

/**
 * Union type of all supported Groq chat model names.
 */
export type GroqChatModels = (typeof GROQ_CHAT_MODELS)[number]

/**
 * Type-only map from Groq chat model name to its supported input modalities.
 */
export type GroqModelInputModalitiesByName = {
  [LLAMA_3_1_8B_INSTANT.name]: typeof LLAMA_3_1_8B_INSTANT.supports.input
  [LLAMA_3_3_70B_VERSATILE.name]: typeof LLAMA_3_3_70B_VERSATILE.supports.input
  [LLAMA_4_MAVERICK_17B_128E_INSTRUCT.name]: typeof LLAMA_4_MAVERICK_17B_128E_INSTRUCT.supports.input
  [LLAMA_4_SCOUT_17B_16E_INSTRUCT.name]: typeof LLAMA_4_SCOUT_17B_16E_INSTRUCT.supports.input
  [LLAMA_GUARD_4_12B.name]: typeof LLAMA_GUARD_4_12B.supports.input
  [LLAMA_PROMPT_GUARD_2_86M.name]: typeof LLAMA_PROMPT_GUARD_2_86M.supports.input
  [LLAMA_PROMPT_GUARD_2_22M.name]: typeof LLAMA_PROMPT_GUARD_2_22M.supports.input
  [GPT_OSS_20B.name]: typeof GPT_OSS_20B.supports.input
  [GPT_OSS_120B.name]: typeof GPT_OSS_120B.supports.input
  [GPT_OSS_SAFEGUARD_20B.name]: typeof GPT_OSS_SAFEGUARD_20B.supports.input
  [KIMI_K2_INSTRUCT_0905.name]: typeof KIMI_K2_INSTRUCT_0905.supports.input
  [QWEN3_32B.name]: typeof QWEN3_32B.supports.input
}

/**
 * Type-only map from Groq chat model name to its provider options type.
 */
export type GroqChatModelProviderOptionsByName = {
  [K in (typeof GROQ_CHAT_MODELS)[number]]: GroqTextProviderOptions
}

/**
 * Resolves the provider options type for a specific Groq model.
 * Falls back to generic GroqTextProviderOptions for unknown models.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof GroqChatModelProviderOptionsByName
  ? GroqChatModelProviderOptionsByName[TModel]
  : GroqTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GroqModelInputModalitiesByName
  ? GroqModelInputModalitiesByName[TModel]
  : readonly ['text']
