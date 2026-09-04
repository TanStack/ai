import type { MistralTextProviderOptions } from './text/text-provider-options'
import type {
  CodestralEmbedProviderOptions,
  MistralEmbedProviderOptions,
} from './embedding/embedding-provider-options'

/** Provider options for vision-capable Mistral models (pixtral-*). */
const CODESTRAL_2508 = {
  name: 'codestral-2508',
  context_window: 256_000,
  max_completion_tokens: 204_800,
  supports: {
    input: ['text', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema'],
  },
  pricing: {
    input: {
      normal: 0.3,
      cached: 0.03,
    },
    output: {
      normal: 0.9,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const LABS_LEANSTRAL_1_5 = {
  name: 'labs-leanstral-1-5',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const LABS_LEANSTRAL_1_5_1 = {
  name: 'labs-leanstral-1-5-1',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_14B_2512 = {
  name: 'ministral-14b-2512',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
  pricing: {
    input: {
      normal: 0.2,
      cached: 0.02,
    },
    output: {
      normal: 0.2,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_14B_LATEST = {
  name: 'ministral-14b-latest',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_3B_2512 = {
  name: 'ministral-3b-2512',
  context_window: 131_072,
  max_completion_tokens: 104_857,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
  pricing: {
    input: {
      normal: 0.1,
      cached: 0.01,
    },
    output: {
      normal: 0.1,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_8B_2512 = {
  name: 'ministral-8b-2512',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
  pricing: {
    input: {
      normal: 0.15,
      cached: 0.015,
    },
    output: {
      normal: 0.15,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_LARGE_2512 = {
  name: 'mistral-large-2512',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
  pricing: {
    input: {
      normal: 0.5,
      cached: 0.05,
    },
    output: {
      normal: 1.5,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_MEDIUM = {
  name: 'mistral-medium',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_MEDIUM_2604 = {
  name: 'mistral-medium-2604',
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming'],
  },
  pricing: {
    input: {
      normal: 0,
    },
    output: {
      normal: 0,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_MEDIUM_3_5 = {
  name: 'mistral-medium-3-5',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image', 'document'],
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
  },
  pricing: {
    input: {
      normal: 1.5,
    },
    output: {
      normal: 7.5,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_SMALL_2603 = {
  name: 'mistral-small-2603',
  context_window: 262_144,
  max_completion_tokens: 209_715,
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
  },
  pricing: {
    input: {
      normal: 0.15,
      cached: 0.015,
    },
    output: {
      normal: 0.6,
    },
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

export type MistralVisionProviderOptions = MistralTextProviderOptions

/** Provider options for reasoning-capable Mistral models (magistral-*). */
export type MistralReasoningProviderOptions = MistralTextProviderOptions

/**
 * Internal metadata structure describing a Mistral model's capabilities
 * and approximate pricing (USD per million tokens).
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
    input: Array<'text' | 'image' | 'audio' | 'document'>
    output: Array<'text'>
    endpoints: Array<'chat' | 'embeddings'>

    features: Array<
      | 'streaming'
      | 'tools'
      | 'json_object'
      | 'json_schema'
      | 'reasoning'
      | 'vision'
      | 'code'
    >
  }
  providerOptions?: TProviderOptions
}

const MISTRAL_LARGE_LATEST = {
  name: 'mistral-large-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.5 },
    output: { normal: 1.5 },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_MEDIUM_LATEST = {
  name: 'mistral-medium-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.4 },
    output: { normal: 2 },
  },
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_SMALL_LATEST = {
  name: 'mistral-small-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.1 },
    output: { normal: 0.3 },
  },
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_8B_LATEST = {
  name: 'ministral-8b-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.1 },
    output: { normal: 0.1 },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_3B_LATEST = {
  name: 'ministral-3b-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.04 },
    output: { normal: 0.04 },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const CODESTRAL_LATEST = {
  name: 'codestral-latest',
  context_window: 256_000,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.3 },
    output: { normal: 0.9 },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'code'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const PIXTRAL_LARGE_LATEST = {
  name: 'pixtral-large-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 2 },
    output: { normal: 6 },
  },
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const PIXTRAL_12B_2409 = {
  name: 'pixtral-12b-2409',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.15 },
    output: { normal: 0.15 },
  },
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'vision'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MAGISTRAL_MEDIUM_LATEST = {
  name: 'magistral-medium-latest',
  context_window: 40_000,
  max_completion_tokens: 40_000,
  pricing: {
    input: { normal: 2 },
    output: { normal: 5 },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'reasoning', 'json_object', 'json_schema'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MAGISTRAL_SMALL_LATEST = {
  name: 'magistral-small-latest',
  context_window: 40_000,
  max_completion_tokens: 40_000,
  pricing: {
    input: { normal: 0.5 },
    output: { normal: 1.5 },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'reasoning', 'json_object', 'json_schema'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const OPEN_MISTRAL_NEMO = {
  name: 'open-mistral-nemo',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.15 },
    output: { normal: 0.15 },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

// Vertex Model Garden IDs. These are not the Mistral API catalog.
// Source: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/mistral
const MISTRAL_MEDIUM_3 = {
  name: 'mistral-medium-3',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.4 },
    output: { normal: 2 },
  },
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_SMALL_2503 = {
  name: 'mistral-small-2503',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.1 },
    output: { normal: 0.3 },
  },
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const CODESTRAL_2 = {
  name: 'codestral-2',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  pricing: {
    input: { normal: 0.3 },
    output: { normal: 0.9 },
  },
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'code'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

/**
 * All supported Mistral chat model identifiers.
 */
export const MISTRAL_CHAT_MODELS = [
  CODESTRAL_2508.name,
  LABS_LEANSTRAL_1_5.name,
  LABS_LEANSTRAL_1_5_1.name,
  MINISTRAL_14B_2512.name,
  MINISTRAL_14B_LATEST.name,
  MINISTRAL_3B_2512.name,
  MINISTRAL_8B_2512.name,
  MISTRAL_LARGE_2512.name,
  MISTRAL_MEDIUM.name,
  MISTRAL_MEDIUM_2604.name,
  MISTRAL_MEDIUM_3_5.name,
  MISTRAL_SMALL_2603.name,
  MISTRAL_LARGE_LATEST.name,
  MISTRAL_MEDIUM_LATEST.name,
  MISTRAL_SMALL_LATEST.name,
  MINISTRAL_8B_LATEST.name,
  MINISTRAL_3B_LATEST.name,
  CODESTRAL_LATEST.name,
  PIXTRAL_LARGE_LATEST.name,
  PIXTRAL_12B_2409.name,
  MAGISTRAL_MEDIUM_LATEST.name,
  MAGISTRAL_SMALL_LATEST.name,
  OPEN_MISTRAL_NEMO.name,
] as const

/**
 * Union type of all supported Mistral chat model names.
 */
export type MistralChatModels = (typeof MISTRAL_CHAT_MODELS)[number]

/**
 * Mistral chat models on Vertex AI / Gemini Enterprise Agent Platform.
 * This list is the Google partner catalog, not the Mistral API catalog.
 * OCR (`mistral-ocr-2505`) is not a chat model.
 */
export const MISTRAL_VERTEX_CHAT_MODELS = [
  MISTRAL_MEDIUM_3.name,
  MISTRAL_SMALL_2503.name,
  CODESTRAL_2.name,
] as const

export type MistralVertexChatModel = (typeof MISTRAL_VERTEX_CHAT_MODELS)[number]
export type MistralTextAdapterModel = MistralChatModels | MistralVertexChatModel

/**
 * Type-only map from Mistral chat model name to its supported input modalities.
 */
export type MistralModelInputModalitiesByName = {
  [MISTRAL_LARGE_LATEST.name]: typeof MISTRAL_LARGE_LATEST.supports.input
  [MISTRAL_MEDIUM_LATEST.name]: typeof MISTRAL_MEDIUM_LATEST.supports.input
  [MISTRAL_SMALL_LATEST.name]: typeof MISTRAL_SMALL_LATEST.supports.input
  [MINISTRAL_8B_LATEST.name]: typeof MINISTRAL_8B_LATEST.supports.input
  [MINISTRAL_3B_LATEST.name]: typeof MINISTRAL_3B_LATEST.supports.input
  [CODESTRAL_LATEST.name]: typeof CODESTRAL_LATEST.supports.input
  [PIXTRAL_LARGE_LATEST.name]: typeof PIXTRAL_LARGE_LATEST.supports.input
  [PIXTRAL_12B_2409.name]: typeof PIXTRAL_12B_2409.supports.input
  [MAGISTRAL_MEDIUM_LATEST.name]: typeof MAGISTRAL_MEDIUM_LATEST.supports.input
  [MAGISTRAL_SMALL_LATEST.name]: typeof MAGISTRAL_SMALL_LATEST.supports.input
  [OPEN_MISTRAL_NEMO.name]: typeof OPEN_MISTRAL_NEMO.supports.input
  [MISTRAL_MEDIUM_3.name]: typeof MISTRAL_MEDIUM_3.supports.input
  [MISTRAL_SMALL_2503.name]: typeof MISTRAL_SMALL_2503.supports.input
  [CODESTRAL_2.name]: typeof CODESTRAL_2.supports.input
  [CODESTRAL_2508.name]: typeof CODESTRAL_2508.supports.input
  [LABS_LEANSTRAL_1_5.name]: typeof LABS_LEANSTRAL_1_5.supports.input
  [LABS_LEANSTRAL_1_5_1.name]: typeof LABS_LEANSTRAL_1_5_1.supports.input
  [MINISTRAL_14B_2512.name]: typeof MINISTRAL_14B_2512.supports.input
  [MINISTRAL_14B_LATEST.name]: typeof MINISTRAL_14B_LATEST.supports.input
  [MINISTRAL_3B_2512.name]: typeof MINISTRAL_3B_2512.supports.input
  [MINISTRAL_8B_2512.name]: typeof MINISTRAL_8B_2512.supports.input
  [MISTRAL_LARGE_2512.name]: typeof MISTRAL_LARGE_2512.supports.input
  [MISTRAL_MEDIUM.name]: typeof MISTRAL_MEDIUM.supports.input
  [MISTRAL_MEDIUM_2604.name]: typeof MISTRAL_MEDIUM_2604.supports.input
  [MISTRAL_MEDIUM_3_5.name]: typeof MISTRAL_MEDIUM_3_5.supports.input
  [MISTRAL_SMALL_2603.name]: typeof MISTRAL_SMALL_2603.supports.input
}

/**
 * Type-only map from Mistral chat model name to its provider options type.
 */
export type MistralChatModelProviderOptionsByName = {
  [MISTRAL_LARGE_LATEST.name]: MistralTextProviderOptions
  [MISTRAL_MEDIUM_LATEST.name]: MistralVisionProviderOptions
  [MISTRAL_SMALL_LATEST.name]: MistralVisionProviderOptions
  [MINISTRAL_8B_LATEST.name]: MistralTextProviderOptions
  [MINISTRAL_3B_LATEST.name]: MistralTextProviderOptions
  [CODESTRAL_LATEST.name]: MistralTextProviderOptions
  [PIXTRAL_LARGE_LATEST.name]: MistralVisionProviderOptions
  [PIXTRAL_12B_2409.name]: MistralVisionProviderOptions
  [MAGISTRAL_MEDIUM_LATEST.name]: MistralReasoningProviderOptions
  [MAGISTRAL_SMALL_LATEST.name]: MistralReasoningProviderOptions
  [OPEN_MISTRAL_NEMO.name]: MistralTextProviderOptions
  [MISTRAL_MEDIUM_3.name]: MistralVisionProviderOptions
  [MISTRAL_SMALL_2503.name]: MistralVisionProviderOptions
  [CODESTRAL_2.name]: MistralTextProviderOptions
  [CODESTRAL_2508.name]: MistralTextProviderOptions
  [LABS_LEANSTRAL_1_5.name]: MistralTextProviderOptions
  [LABS_LEANSTRAL_1_5_1.name]: MistralTextProviderOptions
  [MINISTRAL_14B_2512.name]: MistralTextProviderOptions
  [MINISTRAL_14B_LATEST.name]: MistralTextProviderOptions
  [MINISTRAL_3B_2512.name]: MistralTextProviderOptions
  [MINISTRAL_8B_2512.name]: MistralTextProviderOptions
  [MISTRAL_LARGE_2512.name]: MistralTextProviderOptions
  [MISTRAL_MEDIUM.name]: MistralTextProviderOptions
  [MISTRAL_MEDIUM_2604.name]: MistralTextProviderOptions
  [MISTRAL_MEDIUM_3_5.name]: MistralTextProviderOptions
  [MISTRAL_SMALL_2603.name]: MistralTextProviderOptions
}

/**
 * Embedding models (based on endpoints: "embeddings")
 */
export const MISTRAL_EMBEDDING_MODELS = [
  'mistral-embed',
  'codestral-embed',
] as const

/**
 * Union type of all supported Mistral embedding model names.
 */
export type MistralEmbeddingModel = (typeof MISTRAL_EMBEDDING_MODELS)[number]

/**
 * Type-only map from embedding model name to its provider options type.
 *
 * `mistral-embed` accepts no provider options (fixed 1024-dim output);
 * `codestral-embed` additionally supports `outputDtype`.
 */
export type MistralEmbeddingModelProviderOptionsByName = {
  'mistral-embed': MistralEmbedProviderOptions
  'codestral-embed': CodestralEmbedProviderOptions
}

/**
 * Per-model input modalities for embedding models. Mistral embedding models
 * are text-only, so image inputs fail at compile time.
 */
export type MistralEmbeddingModelInputModalitiesByName = {
  'mistral-embed': readonly ['text']
  'codestral-embed': readonly ['text']
}

/**
 * Resolves the provider options type for a specific Mistral model.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof MistralChatModelProviderOptionsByName
    ? MistralChatModelProviderOptionsByName[TModel]
    : MistralTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof MistralModelInputModalitiesByName
    ? MistralModelInputModalitiesByName[TModel]
    : readonly ['text']
