import type { OrcaRouterTextProviderOptions } from './text/text-provider-options'

/**
 * Internal metadata structure describing an OrcaRouter model's capabilities
 * and pricing.
 *
 * OrcaRouter routes hundreds of models from many providers through one
 * OpenAI-compatible endpoint. This file curates a set of flagship models
 * with per-model metadata for type safety; any model listed on
 * https://www.orcarouter.ai works at runtime — pass its id with a type
 * assertion, or prefer a curated model for full type support. Prices are
 * USD per million tokens and follow the gateway's provider-passthrough
 * pricing (they may drift; the models page is the source of truth).
 *
 * Model ids use a `provider/model` prefix (e.g. `openai/gpt-5.5-pro`) to
 * pin routing to a specific provider — the same convention as OpenRouter.
 * The `orcarouter/fusion` family enables automatic adaptive routing across
 * fallback models.
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

const ORCAROUTER_FUSION = {
  name: 'orcarouter/fusion',
  context_window: 1_000_000,
  max_completion_tokens: 128_000,
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0,
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
} as const satisfies ModelMeta<OrcaRouterTextProviderOptions>

const GPT_5_5_PRO = {
  name: 'openai/gpt-5.5-pro',
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
} as const satisfies ModelMeta<OrcaRouterTextProviderOptions>

const CLAUDE_OPUS_4_8 = {
  name: 'anthropic/claude-opus-4.8',
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
} as const satisfies ModelMeta<OrcaRouterTextProviderOptions>

const CLAUDE_SONNET_5 = {
  name: 'anthropic/claude-sonnet-5',
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
} as const satisfies ModelMeta<OrcaRouterTextProviderOptions>

const GEMINI_3_1_PRO_PREVIEW = {
  name: 'google/gemini-3.1-pro-preview',
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
} as const satisfies ModelMeta<OrcaRouterTextProviderOptions>

const DEEPSEEK_V4_PRO = {
  name: 'deepseek/deepseek-v4-pro-0813',
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
} as const satisfies ModelMeta<OrcaRouterTextProviderOptions>

const GROK_4_3 = {
  name: 'grok/grok-4.3',
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
} as const satisfies ModelMeta<OrcaRouterTextProviderOptions>

/**
 * Curated OrcaRouter chat model identifiers.
 *
 * Any model on https://www.orcarouter.ai works at runtime; these curated
 * entries carry per-model type metadata (input modalities, provider
 * options).
 */
export const ORCAROUTER_CHAT_MODELS = [
  ORCAROUTER_FUSION.name,
  GPT_5_5_PRO.name,
  CLAUDE_OPUS_4_8.name,
  CLAUDE_SONNET_5.name,
  GEMINI_3_1_PRO_PREVIEW.name,
  DEEPSEEK_V4_PRO.name,
  GROK_4_3.name,
] as const

/**
 * Union type of all curated OrcaRouter chat model names.
 */
export type OrcaRouterChatModels = (typeof ORCAROUTER_CHAT_MODELS)[number]

/**
 * Model id accepted by the OrcaRouter adapters: a curated model name (with
 * autocomplete and per-model type metadata) or any other model id from
 * https://www.orcarouter.ai, prefixed with `provider/` to pin routing to a
 * specific provider. `orcarouter/fusion` enables adaptive automatic routing.
 * Uncurated ids fall back to text-only input and the generic provider
 * options.
 */
export type OrcaRouterModelId = OrcaRouterChatModels | (string & {})

/**
 * Type-only map from OrcaRouter chat model name to its supported input
 * modalities.
 */
export type OrcaRouterModelInputModalitiesByName = {
  [ORCAROUTER_FUSION.name]: typeof ORCAROUTER_FUSION.supports.input
  [GPT_5_5_PRO.name]: typeof GPT_5_5_PRO.supports.input
  [CLAUDE_OPUS_4_8.name]: typeof CLAUDE_OPUS_4_8.supports.input
  [CLAUDE_SONNET_5.name]: typeof CLAUDE_SONNET_5.supports.input
  [GEMINI_3_1_PRO_PREVIEW.name]: typeof GEMINI_3_1_PRO_PREVIEW.supports.input
  [DEEPSEEK_V4_PRO.name]: typeof DEEPSEEK_V4_PRO.supports.input
  [GROK_4_3.name]: typeof GROK_4_3.supports.input
}

/**
 * Type-only map from OrcaRouter chat model name to its provider options
 * type.
 */
export type OrcaRouterChatModelProviderOptionsByName = {
  [K in (typeof ORCAROUTER_CHAT_MODELS)[number]]: OrcaRouterTextProviderOptions
}

/**
 * Type-only map from OrcaRouter chat model name to its supported provider
 * tools. OrcaRouter exposes no provider-specific tool factories, so every
 * model gets an empty tuple. This ensures that passing an Anthropic/OpenAI
 * ProviderTool to an OrcaRouter adapter produces a compile-time type error.
 */
export type OrcaRouterChatModelToolCapabilitiesByName = {
  [ORCAROUTER_FUSION.name]: typeof ORCAROUTER_FUSION.supports.tools
  [GPT_5_5_PRO.name]: typeof GPT_5_5_PRO.supports.tools
  [CLAUDE_OPUS_4_8.name]: typeof CLAUDE_OPUS_4_8.supports.tools
  [CLAUDE_SONNET_5.name]: typeof CLAUDE_SONNET_5.supports.tools
  [GEMINI_3_1_PRO_PREVIEW.name]: typeof GEMINI_3_1_PRO_PREVIEW.supports.tools
  [DEEPSEEK_V4_PRO.name]: typeof DEEPSEEK_V4_PRO.supports.tools
  [GROK_4_3.name]: typeof GROK_4_3.supports.tools
}

/**
 * Resolves the provider options type for a specific OrcaRouter model.
 * Falls back to the generic options for uncurated model ids.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OrcaRouterChatModelProviderOptionsByName
    ? OrcaRouterChatModelProviderOptionsByName[TModel]
    : OrcaRouterTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use
 * text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OrcaRouterModelInputModalitiesByName
    ? OrcaRouterModelInputModalitiesByName[TModel]
    : readonly ['text']
