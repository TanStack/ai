import type { MistralTextProviderOptions } from './text/text-provider-options'
import type {
  CodestralEmbedProviderOptions,
  MistralEmbedProviderOptions,
} from './embedding/embedding-provider-options'

/** Provider options for vision-capable Mistral models (pixtral-*). */
export type MistralVisionProviderOptions = MistralTextProviderOptions

/** Provider options for reasoning-capable Mistral models (magistral-*). */
export type MistralReasoningProviderOptions = MistralTextProviderOptions

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

export const MISTRAL_CHAT_MODELS = [
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

export type MistralChatModels = (typeof MISTRAL_CHAT_MODELS)[number]

export const MISTRAL_VERTEX_CHAT_MODELS = [
  MISTRAL_MEDIUM_3.name,
  MISTRAL_SMALL_2503.name,
  CODESTRAL_2.name,
] as const

export type MistralVertexChatModel = (typeof MISTRAL_VERTEX_CHAT_MODELS)[number]
export type MistralTextAdapterModel = MistralChatModels | MistralVertexChatModel

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
}

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
}

export const MISTRAL_EMBEDDING_MODELS = [
  'mistral-embed',
  'codestral-embed',
] as const

export type MistralEmbeddingModel = (typeof MISTRAL_EMBEDDING_MODELS)[number]

export type MistralEmbeddingModelProviderOptionsByName = {
  'mistral-embed': MistralEmbedProviderOptions
  'codestral-embed': CodestralEmbedProviderOptions
}

export type MistralEmbeddingModelInputModalitiesByName = {
  'mistral-embed': readonly ['text']
  'codestral-embed': readonly ['text']
}

export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof MistralChatModelProviderOptionsByName
    ? MistralChatModelProviderOptionsByName[TModel]
    : MistralTextProviderOptions

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof MistralModelInputModalitiesByName
    ? MistralModelInputModalitiesByName[TModel]
    : readonly ['text']
