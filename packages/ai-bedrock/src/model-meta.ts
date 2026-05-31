import { GENERATED_BEDROCK_MODELS } from './model-catalog.generated'
import type { BedrockTextProviderOptions } from './text/text-provider-options'

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

/** No provider-specific tools — empty tuple makes cross-provider ProviderTool a compile error. */
export type BedrockChatModelToolCapabilitiesByName = {
  [E in Entry as E['id']]: readonly []
}

export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof BedrockChatModelProviderOptionsByName
    ? BedrockChatModelProviderOptionsByName[TModel]
    : BedrockTextProviderOptions

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof BedrockModelInputModalitiesByName
    ? BedrockModelInputModalitiesByName[TModel]
    : readonly ['text']
