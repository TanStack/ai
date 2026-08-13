import { GENERATED_BEDROCK_MODELS } from './model-catalog.generated.js'
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
// Every catalog entry advertises `converse: true` (Converse is the universal
// Bedrock surface), so the id list is the full catalog — no runtime filter needed.
export const BEDROCK_CONVERSE_MODELS: ReadonlyArray<BedrockConverseModels> =
  GENERATED_BEDROCK_MODELS.map((m) => m.id)

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
