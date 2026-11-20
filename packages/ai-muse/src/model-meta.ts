import type { Modality, ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
import type { MuseTextProviderOptions } from './text/text-provider-options'

// Model data below is from Meta's official Model API docs (dev.meta.ai):
// "Pricing and rate limits", "Choose a model", and the per-model pages,
// checked 2026-11-11. Prices are USD per 1M tokens, Standard mode unless the
// model id says `-contributor`. Every reasoning model on the API has a
// 1,048,576-token context window. Muse Glimmer is an open-weight,
// self-hosted model — it is NOT served by the Model API and is deliberately
// absent here.

// Reasoning shapes: the levels a model has for `chat({ reasoning })`, and the
// provider value to send for each. Each model points at one of them.
const EFFORT_MINIMAL_TO_MAX = {
  levels: {
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  },
  budget: false,
} as const
const EFFORT_MINIMAL_TO_XHIGH = {
  levels: {
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
  },
  budget: false,
} as const

/**
 * Internal metadata structure describing a Muse model's capabilities and
 * pricing.
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
    input: Array<'text' | 'image'>
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
  /** Type-level description of which provider options this model supports. */
  providerOptions?: TProviderOptions
  /** The model's data for `chat({ reasoning })`. None: it does not reason. */
  reasoning?: ModelReasoning
}

const FEATURES = [
  'streaming',
  'tools',
  'json_object',
  'json_schema',
  'reasoning',
  'vision',
] as const

// Ember pricing is the ≤200K-input-token tier; requests over 200K input
// tokens bill at 3x ($0.30 / $0.012 cached / $1.50) for the whole request.
const EMBER_1_0 = {
  name: 'muse-ember-1.0',
  context_window: 1_048_576,
  max_completion_tokens: 524_288,
  pricing: {
    input: { normal: 0.1, cached: 0.004 },
    output: { normal: 0.5 },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [...FEATURES],
    tools: [] as const,
  },
  reasoning: EFFORT_MINIMAL_TO_MAX,
} as const satisfies ModelMeta<MuseTextProviderOptions>

const WONDER_1_0 = {
  name: 'muse-wonder-1.0',
  context_window: 1_048_576,
  max_completion_tokens: 131_072,
  pricing: {
    input: { normal: 4, cached: 0.2 },
    output: { normal: 20 },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [...FEATURES],
    tools: [] as const,
  },
  reasoning: EFFORT_MINIMAL_TO_MAX,
} as const satisfies ModelMeta<MuseTextProviderOptions>

const SPARK_1_3 = {
  name: 'muse-spark-1.3',
  context_window: 1_048_576,
  max_completion_tokens: 131_072,
  pricing: {
    input: { normal: 1.25, cached: 0.15 },
    output: { normal: 4.25 },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [...FEATURES],
    tools: [] as const,
  },
  // Spark 1.3 is the only Spark that accepts `max` effort.
  reasoning: EFFORT_MINIMAL_TO_MAX,
} as const satisfies ModelMeta<MuseTextProviderOptions>

const SPARK_1_3_CONTRIBUTOR = {
  name: 'muse-spark-1.3-contributor',
  context_window: 1_048_576,
  max_completion_tokens: 131_072,
  pricing: {
    input: { normal: 0.1, cached: 0.002 },
    output: { normal: 0.2 },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [...FEATURES],
    tools: [] as const,
  },
  // `max` is not available on the Contributor variant.
  reasoning: EFFORT_MINIMAL_TO_XHIGH,
} as const satisfies ModelMeta<MuseTextProviderOptions>

const SPARK_1_2 = {
  name: 'muse-spark-1.2',
  context_window: 1_048_576,
  max_completion_tokens: 131_072,
  pricing: {
    input: { normal: 1.25, cached: 0.15 },
    output: { normal: 4.25 },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [...FEATURES],
    tools: [] as const,
  },
  reasoning: EFFORT_MINIMAL_TO_XHIGH,
} as const satisfies ModelMeta<MuseTextProviderOptions>

const SPARK_1_2_CONTRIBUTOR = {
  name: 'muse-spark-1.2-contributor',
  context_window: 1_048_576,
  max_completion_tokens: 131_072,
  pricing: {
    input: { normal: 0.1, cached: 0.002 },
    output: { normal: 0.2 },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [...FEATURES],
    tools: [] as const,
  },
  reasoning: EFFORT_MINIMAL_TO_XHIGH,
} as const satisfies ModelMeta<MuseTextProviderOptions>

const SPARK_1_1 = {
  name: 'muse-spark-1.1',
  context_window: 1_048_576,
  max_completion_tokens: 32_768,
  pricing: {
    input: { normal: 1.25, cached: 0.15 },
    output: { normal: 4.25 },
  },
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    endpoints: ['chat'],
    features: [...FEATURES],
    tools: [] as const,
  },
  reasoning: EFFORT_MINIMAL_TO_XHIGH,
} as const satisfies ModelMeta<MuseTextProviderOptions>

/**
 * All supported Muse chat model identifiers.
 */
export const MUSE_CHAT_MODELS = [
  EMBER_1_0.name,
  WONDER_1_0.name,
  SPARK_1_3.name,
  SPARK_1_3_CONTRIBUTOR.name,
  SPARK_1_2.name,
  SPARK_1_2_CONTRIBUTOR.name,
  SPARK_1_1.name,
] as const

/**
 * Union type of all supported Muse chat model names.
 */
export type MuseChatModels = (typeof MUSE_CHAT_MODELS)[number]

/**
 * Type-only map from Muse chat model name to its supported input modalities.
 */
export type MuseModelInputModalitiesByName = {
  [EMBER_1_0.name]: typeof EMBER_1_0.supports.input
  [WONDER_1_0.name]: typeof WONDER_1_0.supports.input
  [SPARK_1_3.name]: typeof SPARK_1_3.supports.input
  [SPARK_1_3_CONTRIBUTOR.name]: typeof SPARK_1_3_CONTRIBUTOR.supports.input
  [SPARK_1_2.name]: typeof SPARK_1_2.supports.input
  [SPARK_1_2_CONTRIBUTOR.name]: typeof SPARK_1_2_CONTRIBUTOR.supports.input
  [SPARK_1_1.name]: typeof SPARK_1_1.supports.input
}

/**
 * Runtime map from chat model name to its supported input modalities, for the
 * text adapter's `inputModalities`. `satisfies` keeps it equal to
 * {@link MuseModelInputModalitiesByName}. An unknown name gives `undefined`.
 */
export const MUSE_MODEL_INPUT_MODALITIES: Readonly<
  Record<string, ReadonlyArray<Modality>>
> = {
  [EMBER_1_0.name]: EMBER_1_0.supports.input,
  [WONDER_1_0.name]: WONDER_1_0.supports.input,
  [SPARK_1_3.name]: SPARK_1_3.supports.input,
  [SPARK_1_3_CONTRIBUTOR.name]: SPARK_1_3_CONTRIBUTOR.supports.input,
  [SPARK_1_2.name]: SPARK_1_2.supports.input,
  [SPARK_1_2_CONTRIBUTOR.name]: SPARK_1_2_CONTRIBUTOR.supports.input,
  [SPARK_1_1.name]: SPARK_1_1.supports.input,
} satisfies MuseModelInputModalitiesByName

/**
 * Type-only map from Muse chat model name to its provider options type.
 */
export type MuseChatModelProviderOptionsByName = {
  [K in (typeof MUSE_CHAT_MODELS)[number]]: MuseTextProviderOptions
}

/**
 * Type-only map from Muse chat model name to its supported provider tools.
 * Muse exposes no provider-specific tool factories, so every model gets an
 * empty tuple. This makes passing another provider's ProviderTool to a Muse
 * adapter a compile-time type error.
 */
export type MuseChatModelToolCapabilitiesByName = {
  [EMBER_1_0.name]: typeof EMBER_1_0.supports.tools
  [WONDER_1_0.name]: typeof WONDER_1_0.supports.tools
  [SPARK_1_3.name]: typeof SPARK_1_3.supports.tools
  [SPARK_1_3_CONTRIBUTOR.name]: typeof SPARK_1_3_CONTRIBUTOR.supports.tools
  [SPARK_1_2.name]: typeof SPARK_1_2.supports.tools
  [SPARK_1_2_CONTRIBUTOR.name]: typeof SPARK_1_2_CONTRIBUTOR.supports.tools
  [SPARK_1_1.name]: typeof SPARK_1_1.supports.tools
}

/**
 * Resolves the provider options type for a specific Muse model.
 */
export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof MuseChatModelProviderOptionsByName
    ? MuseChatModelProviderOptionsByName[TModel]
    : MuseTextProviderOptions

/**
 * Resolve input modalities for a specific model. If the model has explicit
 * modalities in the map, use those; otherwise use text only.
 */
export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof MuseModelInputModalitiesByName
    ? MuseModelInputModalitiesByName[TModel]
    : readonly ['text']

// Reasoning
//
// Each model's `reasoning` field holds its data for `chat({ reasoning })`: the
// levels it has, with the provider value for each, and whether it takes a
// thinking token budget.

const MUSE_REASONING = {
  [EMBER_1_0.name]: EMBER_1_0.reasoning,
  [WONDER_1_0.name]: WONDER_1_0.reasoning,
  [SPARK_1_3.name]: SPARK_1_3.reasoning,
  [SPARK_1_3_CONTRIBUTOR.name]: SPARK_1_3_CONTRIBUTOR.reasoning,
  [SPARK_1_2.name]: SPARK_1_2.reasoning,
  [SPARK_1_2_CONTRIBUTOR.name]: SPARK_1_2_CONTRIBUTOR.reasoning,
  [SPARK_1_1.name]: SPARK_1_1.reasoning,
}

/**
 * Each chat model's reasoning levels, and whether it takes a token budget, for
 * `chat({ reasoning })`. Derived from the `reasoning` field. A model that is
 * not here does not reason.
 */
export type MuseModelReasoningByName = {
  [K in keyof typeof MUSE_REASONING]: ModelReasoningCapability<
    (typeof MUSE_REASONING)[K]
  >
}

/**
 * Runtime map from chat model name to its reasoning data, for the text
 * adapter. An unknown name gives `undefined`: the adapter sends no reasoning
 * field.
 */
export const MUSE_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  MUSE_REASONING
