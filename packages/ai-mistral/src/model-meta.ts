import type { Modality, ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
import type { MistralTextProviderOptions } from './text/text-provider-options'
import type {
  CodestralEmbedProviderOptions,
  MistralEmbedProviderOptions,
} from './embedding/embedding-provider-options'

// Reasoning shapes: the levels a model has for `chat({ reasoning })`, and
// the provider value to send for each. Each model points at one of them.
const EFFORT_NONE_HIGH = {
  levels: { off: 'none', high: 'high' },
  budget: false,
} as const
const EFFORT_OFF_HIGH = {
  levels: { off: 'off', high: 'high' },
  budget: false,
} as const

const CODESTRAL_2508 = {
  name: 'codestral-2508',
  context_window: 256_000,
  max_completion_tokens: 204_800,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const LABS_LEANSTRAL_1_5 = {
  name: 'labs-leanstral-1-5',
  context_window: 262_144,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const LABS_LEANSTRAL_1_5_1 = {
  name: 'labs-leanstral-1-5-1',
  context_window: 262_144,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_14B_2512 = {
  name: 'ministral-14b-2512',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_14B_LATEST = {
  name: 'ministral-14b-latest',
  context_window: 262_144,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_3B_2512 = {
  name: 'ministral-3b-2512',
  context_window: 131_072,
  max_completion_tokens: 104_857,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_8B_2512 = {
  name: 'ministral-8b-2512',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_LARGE_2512 = {
  name: 'mistral-large-2512',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_MEDIUM = {
  name: 'mistral-medium',
  context_window: 262_144,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_MEDIUM_2604 = {
  name: 'mistral-medium-2604',
  context_window: 262_144,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_MEDIUM_3_5 = {
  name: 'mistral-medium-3-5',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_SMALL_2603 = {
  name: 'mistral-small-2603',
  context_window: 262_144,
  max_completion_tokens: 209_715,
  supports: {
    input: ['text', 'image', 'audio'],
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
} as const satisfies ModelMeta<MistralTextProviderOptions>

/** Provider options for vision-capable Mistral models. */
export type MistralVisionProviderOptions = MistralTextProviderOptions

/** Provider options for reasoning-capable Mistral models (magistral-*). */
export type MistralReasoningProviderOptions = MistralTextProviderOptions

/**
 * Internal metadata structure describing a Mistral model's capabilities.
 */
interface ModelMeta<TProviderOptions = unknown> {
  name: string
  context_window?: number
  max_completion_tokens?: number
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
  /** The model's data for `chat({ reasoning })`. None: it does not reason. */
  reasoning?: ModelReasoning
}

const MISTRAL_LARGE_LATEST = {
  name: 'mistral-large-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
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
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
  reasoning: EFFORT_NONE_HIGH,
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MISTRAL_SMALL_LATEST = {
  name: 'mistral-small-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
  supports: {
    input: ['text', 'image', 'document'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'vision'],
  },
  reasoning: EFFORT_NONE_HIGH,
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MINISTRAL_8B_LATEST = {
  name: 'ministral-8b-latest',
  context_window: 131_072,
  max_completion_tokens: 8_192,
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
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'json_object', 'json_schema', 'code'],
  },
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MAGISTRAL_MEDIUM_LATEST = {
  name: 'magistral-medium-latest',
  context_window: 40_000,
  max_completion_tokens: 40_000,
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'reasoning', 'json_object', 'json_schema'],
  },
  reasoning: EFFORT_OFF_HIGH,
} as const satisfies ModelMeta<MistralTextProviderOptions>

const MAGISTRAL_SMALL_LATEST = {
  name: 'magistral-small-latest',
  context_window: 40_000,
  max_completion_tokens: 40_000,
  supports: {
    input: ['text'],
    output: ['text'],
    endpoints: ['chat'],
    features: ['streaming', 'tools', 'reasoning', 'json_object', 'json_schema'],
  },
  // Not in models.dev. The same as Magistral Medium: prompt_mode only.
  reasoning: EFFORT_OFF_HIGH,
} as const satisfies ModelMeta<MistralTextProviderOptions>

// Vertex Model Garden IDs. These are not the Mistral API catalog.
// Source: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/mistral
const MISTRAL_MEDIUM_3 = {
  name: 'mistral-medium-3',
  context_window: 131_072,
  max_completion_tokens: 8_192,
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
  MAGISTRAL_MEDIUM_LATEST.name,
  MAGISTRAL_SMALL_LATEST.name,
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
  [MAGISTRAL_MEDIUM_LATEST.name]: typeof MAGISTRAL_MEDIUM_LATEST.supports.input
  [MAGISTRAL_SMALL_LATEST.name]: typeof MAGISTRAL_SMALL_LATEST.supports.input
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
 * Runtime map from chat model name to its supported input modalities, for the
 * text adapter's `inputModalities`. `satisfies` keeps it equal to
 * {@link MistralModelInputModalitiesByName}. An unknown name gives `undefined`.
 */
export const MISTRAL_MODEL_INPUT_MODALITIES: Readonly<
  Record<string, ReadonlyArray<Modality>>
> = {
  [MISTRAL_LARGE_LATEST.name]: MISTRAL_LARGE_LATEST.supports.input,
  [MISTRAL_MEDIUM_LATEST.name]: MISTRAL_MEDIUM_LATEST.supports.input,
  [MISTRAL_SMALL_LATEST.name]: MISTRAL_SMALL_LATEST.supports.input,
  [MINISTRAL_8B_LATEST.name]: MINISTRAL_8B_LATEST.supports.input,
  [MINISTRAL_3B_LATEST.name]: MINISTRAL_3B_LATEST.supports.input,
  [CODESTRAL_LATEST.name]: CODESTRAL_LATEST.supports.input,
  [MAGISTRAL_MEDIUM_LATEST.name]: MAGISTRAL_MEDIUM_LATEST.supports.input,
  [MAGISTRAL_SMALL_LATEST.name]: MAGISTRAL_SMALL_LATEST.supports.input,
  [MISTRAL_MEDIUM_3.name]: MISTRAL_MEDIUM_3.supports.input,
  [MISTRAL_SMALL_2503.name]: MISTRAL_SMALL_2503.supports.input,
  [CODESTRAL_2.name]: CODESTRAL_2.supports.input,
  [CODESTRAL_2508.name]: CODESTRAL_2508.supports.input,
  [LABS_LEANSTRAL_1_5.name]: LABS_LEANSTRAL_1_5.supports.input,
  [LABS_LEANSTRAL_1_5_1.name]: LABS_LEANSTRAL_1_5_1.supports.input,
  [MINISTRAL_14B_2512.name]: MINISTRAL_14B_2512.supports.input,
  [MINISTRAL_14B_LATEST.name]: MINISTRAL_14B_LATEST.supports.input,
  [MINISTRAL_3B_2512.name]: MINISTRAL_3B_2512.supports.input,
  [MINISTRAL_8B_2512.name]: MINISTRAL_8B_2512.supports.input,
  [MISTRAL_LARGE_2512.name]: MISTRAL_LARGE_2512.supports.input,
  [MISTRAL_MEDIUM.name]: MISTRAL_MEDIUM.supports.input,
  [MISTRAL_MEDIUM_2604.name]: MISTRAL_MEDIUM_2604.supports.input,
  [MISTRAL_MEDIUM_3_5.name]: MISTRAL_MEDIUM_3_5.supports.input,
  [MISTRAL_SMALL_2603.name]: MISTRAL_SMALL_2603.supports.input,
} satisfies MistralModelInputModalitiesByName

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
  [MAGISTRAL_MEDIUM_LATEST.name]: MistralReasoningProviderOptions
  [MAGISTRAL_SMALL_LATEST.name]: MistralReasoningProviderOptions
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

// Reasoning
//
// Each model's `reasoning` field holds its data for `chat({ reasoning })`: the
// levels it has, with the provider value for each, and whether it takes a
// thinking token budget. The data comes from models.dev. The generator that
// writes it comes with the model catalog later. Until then, the sync scripts
// keep these fields as they are.

const MISTRAL_REASONING = {
  [MISTRAL_MEDIUM_LATEST.name]: MISTRAL_MEDIUM_LATEST.reasoning,
  [MISTRAL_SMALL_LATEST.name]: MISTRAL_SMALL_LATEST.reasoning,
  [MAGISTRAL_MEDIUM_LATEST.name]: MAGISTRAL_MEDIUM_LATEST.reasoning,
  [MAGISTRAL_SMALL_LATEST.name]: MAGISTRAL_SMALL_LATEST.reasoning,
}

/**
 * Each chat model's reasoning levels, and whether it takes a token budget,
 * for `chat({ reasoning })`. Derived from the `reasoning` field. A model
 * that is not here does not reason.
 */
export type MistralModelReasoningByName = {
  [K in keyof typeof MISTRAL_REASONING]: ModelReasoningCapability<
    (typeof MISTRAL_REASONING)[K]
  >
}

/**
 * Runtime map from chat model name to its reasoning data, for the text adapter.
 * An unknown name gives `undefined`: the adapter sends no reasoning field.
 */
export const MISTRAL_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  MISTRAL_REASONING
