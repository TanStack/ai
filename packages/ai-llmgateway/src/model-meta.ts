import type { LLMGatewayTextProviderOptions } from './text/text-provider-options'

/**
 * Internal metadata structure describing an LLM Gateway model's capabilities
 * and pricing.
 *
 * LLM Gateway routes hundreds of models from many providers through one
 * OpenAI-compatible endpoint. This file curates a set of flagship models
 * with per-model metadata for type safety; any model listed on
 * https://llmgateway.io/models works at runtime — pass its id with a type
 * assertion, or prefer a curated model for full type support. Prices are
 * USD per million tokens and follow the gateway's provider-passthrough
 * pricing (they may drift; the models page is the source of truth).
 *
 * Model ids accept an optional `provider/` prefix (e.g. `openai/gpt-5.5`)
 * to pin routing to a specific provider — the unprefixed ids below let the
 * gateway pick the best available provider.
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
    output: Array<'text'>
    endpoints: Array<'chat'>
    features: Array<
      | 'streaming'
      | 'tools'
      | 'json_object'
      | 'json_schema'
      | 'reasoning'
      | 'vision'
    >
    tools?: ReadonlyArray<never>
  }
  /**
     * Type-level description of which provider options this model supports.
     */
  providerOptions?: TProviderOptions
}

const GPT_5_6_TERRA = {
  name: 'gpt-5.6-terra',
  context_window: 1_050_000,
  max_completion_tokens: 128_000,
  pricing: {
    input: {
      normal: 2.5,
      cached: 0.25,
    },
    output: {
      normal: 15,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const GPT_5_5 = {
  name: 'gpt-5.5',
  context_window: 1_050_000,
  max_completion_tokens: 128_000,
  pricing: {
    input: {
      normal: 5,
      cached: 0.5,
    },
    output: {
      normal: 30,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const GPT_5_4_MINI = {
  name: 'gpt-5.4-mini',
  context_window: 400_000,
  max_completion_tokens: 128_000,
  pricing: {
    input: {
      normal: 0.75,
      cached: 0.075,
    },
    output: {
      normal: 4.5,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const CLAUDE_OPUS_5 = {
  name: 'claude-opus-5',
  context_window: 1_000_000,
  max_completion_tokens: 128_000,
  pricing: {
    input: {
      normal: 5,
      cached: 0.5,
    },
    output: {
      normal: 25,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'reasoning', 'vision'],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const CLAUDE_SONNET_5 = {
  name: 'claude-sonnet-5',
  context_window: 1_000_000,
  max_completion_tokens: 128_000,
  pricing: {
    input: {
      normal: 2,
      cached: 0.2,
    },
    output: {
      normal: 10,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'reasoning', 'vision'],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const CLAUDE_HAIKU_4_5 = {
  name: 'claude-haiku-4-5',
  context_window: 200_000,
  max_completion_tokens: 64_000,
  pricing: {
    input: {
      normal: 1,
      cached: 0.1,
    },
    output: {
      normal: 5,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const GEMINI_PRO_LATEST = {
  name: 'gemini-pro-latest',
  context_window: 1_048_576,
  max_completion_tokens: 65_536,
  pricing: {
    input: {
      normal: 2,
      cached: 0.2,
    },
    output: {
      normal: 12,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const GEMINI_3_6_FLASH = {
  name: 'gemini-3.6-flash',
  context_window: 1_048_576,
  max_completion_tokens: 65_536,
  pricing: {
    input: {
      normal: 1.5,
      cached: 0.15,
    },
    output: {
      normal: 7.5,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const KIMI_K3 = {
  name: 'kimi-k3',
  context_window: 1_048_576,
  max_completion_tokens: 1_048_576,
  pricing: {
    input: {
      normal: 3,
      cached: 0.3,
    },
    output: {
      normal: 15,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const GLM_5_2 = {
  name: 'glm-5.2',
  context_window: 1_000_000,
  max_completion_tokens: 128_000,
  pricing: {
    input: {
      normal: 1.4,
      cached: 0.26,
    },
    output: {
      normal: 4.4,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'reasoning'],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const DEEPSEEK_V4_PRO = {
  name: 'deepseek-v4-pro',
  context_window: 1_050_000,
  max_completion_tokens: 393_216,
  pricing: {
    input: {
      normal: 0.435,
    },
    output: {
      normal: 0.87,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'reasoning'],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const QWEN_3_7_MAX = {
  name: 'qwen3.7-max',
  context_window: 1_000_000,
  max_completion_tokens: 65_536,
  pricing: {
    input: {
      normal: 2.5,
      cached: 0.5,
    },
    output: {
      normal: 7.5,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'reasoning'],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const MINIMAX_M2_5 = {
  name: 'minimax-m2.5',
  context_window: 204_800,
  max_completion_tokens: 131_100,
  pricing: {
    input: {
      normal: 0.3,
      cached: 0.03,
    },
    output: {
      normal: 1.2,
    },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'reasoning'],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

const GROK_4_5 = {
  name: 'grok-4-5',
  context_window: 500_000,
  pricing: {
    input: {
      normal: 2,
      cached: 0.5,
    },
    output: {
      normal: 6,
    },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [
      'streaming',
      'tools',
      'json_object',
      'json_schema',
      'reasoning',
      'vision',
    ],
    tools: [] as const,
  },
} as const satisfies ModelMeta<LLMGatewayTextProviderOptions>

/**
 * Curated LLM Gateway chat model identifiers.
 *
 * Any model on https://llmgateway.io/models works at runtime; these curated
 * entries carry per-model type metadata (input modalities, provider
 * options).
 */
export const LLMGATEWAY_CHAT_MODELS = [
  GPT_5_6_TERRA.name,
  GPT_5_5.name,
  GPT_5_4_MINI.name,
  CLAUDE_OPUS_5.name,
  CLAUDE_SONNET_5.name,
  CLAUDE_HAIKU_4_5.name,
  GEMINI_PRO_LATEST.name,
  GEMINI_3_6_FLASH.name,
  KIMI_K3.name,
  GLM_5_2.name,
  DEEPSEEK_V4_PRO.name,
  QWEN_3_7_MAX.name,
  MINIMAX_M2_5.name,
  GROK_4_5.name,
] as const

/**
 * Union type of all curated LLM Gateway chat model names.
 */
export type LLMGatewayChatModels = (typeof LLMGATEWAY_CHAT_MODELS)[number]

/**
 * Model id accepted by the LLM Gateway adapters: a curated model name (with
 * autocomplete and per-model type metadata) or any other model id from
 * https://llmgateway.io/models, optionally prefixed with `provider/` to pin
 * routing to a specific provider. Uncurated ids fall back to text-only
 * input and the generic provider options.
 */
export type LLMGatewayModelId = LLMGatewayChatModels | (string & {})

/**
 * Type-only map from LLM Gateway chat model name to its supported input
 * modalities.
 */
export type LLMGatewayModelInputModalitiesByName = {
  [GPT_5_6_TERRA.name]: typeof GPT_5_6_TERRA.supports.input
  [GPT_5_5.name]: typeof GPT_5_5.supports.input
  [GPT_5_4_MINI.name]: typeof GPT_5_4_MINI.supports.input
  [CLAUDE_OPUS_5.name]: typeof CLAUDE_OPUS_5.supports.input
  [CLAUDE_SONNET_5.name]: typeof CLAUDE_SONNET_5.supports.input
  [CLAUDE_HAIKU_4_5.name]: typeof CLAUDE_HAIKU_4_5.supports.input
  [GEMINI_PRO_LATEST.name]: typeof GEMINI_PRO_LATEST.supports.input
  [GEMINI_3_6_FLASH.name]: typeof GEMINI_3_6_FLASH.supports.input
  [KIMI_K3.name]: typeof KIMI_K3.supports.input
  [GLM_5_2.name]: typeof GLM_5_2.supports.input
  [DEEPSEEK_V4_PRO.name]: typeof DEEPSEEK_V4_PRO.supports.input
  [QWEN_3_7_MAX.name]: typeof QWEN_3_7_MAX.supports.input
  [MINIMAX_M2_5.name]: typeof MINIMAX_M2_5.supports.input
  [GROK_4_5.name]: typeof GROK_4_5.supports.input
}

/**
 * Type-only map from LLM Gateway chat model name to its provider options
 * type.
 */
export type LLMGatewayChatModelProviderOptionsByName = {
  [K in (typeof LLMGATEWAY_CHAT_MODELS)[number]]: LLMGatewayTextProviderOptions
}

/**
 * Type-only map from LLM Gateway chat model name to its supported provider
 * tools. LLM Gateway exposes no provider-specific tool factories, so every
 * model gets an empty tuple. This ensures that passing an Anthropic/OpenAI
 * ProviderTool to an LLM Gateway adapter produces a compile-time type error.
 */
export type LLMGatewayChatModelToolCapabilitiesByName = {
  [GPT_5_6_TERRA.name]: typeof GPT_5_6_TERRA.supports.tools
  [GPT_5_5.name]: typeof GPT_5_5.supports.tools
  [GPT_5_4_MINI.name]: typeof GPT_5_4_MINI.supports.tools
  [CLAUDE_OPUS_5.name]: typeof CLAUDE_OPUS_5.supports.tools
  [CLAUDE_SONNET_5.name]: typeof CLAUDE_SONNET_5.supports.tools
  [CLAUDE_HAIKU_4_5.name]: typeof CLAUDE_HAIKU_4_5.supports.tools
  [GEMINI_PRO_LATEST.name]: typeof GEMINI_PRO_LATEST.supports.tools
  [GEMINI_3_6_FLASH.name]: typeof GEMINI_3_6_FLASH.supports.tools
  [KIMI_K3.name]: typeof KIMI_K3.supports.tools
  [GLM_5_2.name]: typeof GLM_5_2.supports.tools
  [DEEPSEEK_V4_PRO.name]: typeof DEEPSEEK_V4_PRO.supports.tools
  [QWEN_3_7_MAX.name]: typeof QWEN_3_7_MAX.supports.tools
  [MINIMAX_M2_5.name]: typeof MINIMAX_M2_5.supports.tools
  [GROK_4_5.name]: typeof GROK_4_5.supports.tools
}

/**
 * Resolves the provider options type for a specific LLM Gateway model.
 * Falls back to the generic options for uncurated model ids.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof LLMGatewayChatModelProviderOptionsByName
    ? LLMGatewayChatModelProviderOptionsByName[TModel]
    : LLMGatewayTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use
 * text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof LLMGatewayModelInputModalitiesByName
    ? LLMGatewayModelInputModalitiesByName[TModel]
    : readonly ['text']
