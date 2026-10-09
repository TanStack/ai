import { GENERATED_BEDROCK_MODELS } from './model-catalog.generated.js'
import type { ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
import type { BedrockTextProviderOptions } from './text/text-provider-options'
import type { BedrockConverseProviderOptions } from './converse/provider-options'
import type {
  BedrockCohereEmbeddingProviderOptions,
  BedrockEmbeddingProviderOptions,
  BedrockTitanImageEmbeddingProviderOptions,
  BedrockTitanTextEmbeddingProviderOptions,
} from './embedding/embedding-provider-options'

type Entry = (typeof GENERATED_BEDROCK_MODELS)[number]

/**
 * Type-level per-API filter over the generated catalog. Because the catalog is
 * `as const`, `Extract` preserves literal `id` unions (no widening to `string`).
 */
type IdsWhere<TApi extends 'converse' | 'chat' | 'responses'> = Extract<
  Entry,
  { apis: Record<TApi, true> }
>['id']

export type BedrockConverseModels = IdsWhere<'converse'>
export type BedrockChatModels = IdsWhere<'chat'>
export type BedrockResponsesModels = IdsWhere<'responses'>

/** Runtime catalogs. Cast-free narrowing via a type predicate (the ai-bedrock pattern). */
export const BEDROCK_CONVERSE_MODELS: ReadonlyArray<BedrockConverseModels> =
  GENERATED_BEDROCK_MODELS.filter(
    (m): m is Extract<Entry, { apis: { converse: true } }> => m.apis.converse,
  ).map((m) => m.id)

export const BEDROCK_CHAT_MODELS: ReadonlyArray<BedrockChatModels> =
  GENERATED_BEDROCK_MODELS.filter(
    (m): m is Extract<Entry, { apis: { chat: true } }> => m.apis.chat,
  ).map((m) => m.id)

export const BEDROCK_RESPONSES_MODELS: ReadonlyArray<BedrockResponsesModels> =
  GENERATED_BEDROCK_MODELS.filter(
    (m): m is Extract<Entry, { apis: { responses: true } }> => m.apis.responses,
  ).map((m) => m.id)

/** Per-model input modalities (drives type-safe multimodal content). Covers ALL models. */
export type BedrockModelInputModalitiesByName = {
  [E in Entry as E['id']]: E['input']
}

/** Provider options per model. Same options for every model; keyed over the full catalog. */
export type BedrockChatModelProviderOptionsByName = {
  [E in Entry as E['id']]: BedrockTextProviderOptions
}

/** Converse provider options per model (narrower than the Chat Completions set). */
export type BedrockConverseModelProviderOptionsByName = {
  [E in Entry as E['id']]: BedrockConverseProviderOptions
}

/** No provider-specific tools — empty tuple makes cross-provider ProviderTool a compile error. */
export type BedrockChatModelToolCapabilitiesByName = {
  [E in Entry as E['id']]: readonly []
}

export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof BedrockChatModelProviderOptionsByName
    ? BedrockChatModelProviderOptionsByName[TModel]
    : BedrockTextProviderOptions

export type ResolveConverseProviderOptions<TModel extends string> =
  TModel extends keyof BedrockConverseModelProviderOptionsByName
    ? BedrockConverseModelProviderOptionsByName[TModel]
    : BedrockConverseProviderOptions

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof BedrockModelInputModalitiesByName
    ? BedrockModelInputModalitiesByName[TModel]
    : readonly ['text']

// ============================================================================
// Reasoning
// ============================================================================
//
// Each model's data for `chat({ reasoning })`: the provider value for each
// level (`null`: the model does not have it), and whether it takes a
// thinking token budget. The data comes from models.dev. The generator that
// writes it comes with the model catalog later. Until then, edit these
// entries by hand. scripts/fetch-bedrock-models.ts does not touch them.

const BEDROCK_REASONING = {
  'openai.gpt-oss-120b-1:0': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  'openai.gpt-oss-20b-1:0': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    map: { off: 'off', minimal: null, low: null, medium: null, high: 'high' },
    budget: true,
  },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': {
    map: { off: 'off', minimal: null, low: null, medium: null, high: 'high' },
    budget: true,
  },
  'us.deepseek.r1-v1:0': { budget: false },
  'google.gemma-4-31b': {
    map: {
      off: 'none',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  'google.gemma-4-26b-a4b': {
    map: {
      off: 'none',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  'google.gemma-4-e2b': {
    map: {
      off: 'none',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
} as const satisfies Partial<Record<Entry['id'], ModelReasoning>>

/**
 * Each model's reasoning levels, and whether it takes a token budget, for
 * `chat({ reasoning })`. A model that is not here does not reason.
 */
export type BedrockModelReasoningByName = {
  [K in keyof typeof BEDROCK_REASONING]: ModelReasoningCapability<
    (typeof BEDROCK_REASONING)[K]
  >
}

/**
 * Runtime map from model id to its reasoning data, for the text adapters. An
 * unknown id gives `undefined`: the adapter sends no reasoning field.
 */
export const BEDROCK_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  BEDROCK_REASONING

/**
 * The Claude families that reject a forced tool (`any` or a named `tool`) on
 * every request, with or without thinking. A Bedrock id has the family name
 * inside it, for example `us.anthropic.claude-opus-5-5-...`.
 * ponytail: names, not catalog entries, because the generated catalog has no
 * entry for these models yet. Move it to the catalog when it has them.
 */
export const BEDROCK_CLAUDE_NO_FORCED_TOOL_FAMILIES: ReadonlyArray<string> = [
  'claude-fable-5-1',
  'claude-mythos-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
]

// ============================================================================
// Embedding models
// ============================================================================

/**
 * Embedding models reachable through Bedrock's `InvokeModel` API. These are
 * not part of the generated Converse catalog (embedding models have no
 * conversational surface), so they're maintained by hand here.
 */
export const BEDROCK_EMBEDDING_MODELS = [
  'amazon.titan-embed-text-v2:0',
  'amazon.titan-embed-image-v1',
  'cohere.embed-english-v3',
  'cohere.embed-multilingual-v3',
] as const

export type BedrockEmbeddingModel = (typeof BEDROCK_EMBEDDING_MODELS)[number]

/**
 * Type-only map from embedding model name to its provider options type.
 * The Cohere models make `modelOptions` REQUIRED at the `embed()` call site
 * because `inputType` is a required field.
 */
export type BedrockEmbeddingModelProviderOptionsByName = {
  'amazon.titan-embed-text-v2:0': BedrockTitanTextEmbeddingProviderOptions
  'amazon.titan-embed-image-v1': BedrockTitanImageEmbeddingProviderOptions
  'cohere.embed-english-v3': BedrockCohereEmbeddingProviderOptions
  'cohere.embed-multilingual-v3': BedrockCohereEmbeddingProviderOptions
}

/**
 * Per-model input modalities for embedding models. Titan Multimodal accepts
 * text and/or images (including fused text+image items embedded into one
 * vector); the rest are text-only, so image inputs fail at compile time.
 */
export type BedrockEmbeddingModelInputModalitiesByName = {
  'amazon.titan-embed-text-v2:0': readonly ['text']
  'amazon.titan-embed-image-v1': readonly ['text', 'image']
  'cohere.embed-english-v3': readonly ['text']
  'cohere.embed-multilingual-v3': readonly ['text']
}

export type ResolveEmbeddingProviderOptions<TModel extends string> =
  TModel extends keyof BedrockEmbeddingModelProviderOptionsByName
    ? BedrockEmbeddingModelProviderOptionsByName[TModel]
    : BedrockEmbeddingProviderOptions
