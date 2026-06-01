import type { ExtendedModelDef } from '@tanstack/ai'
import type { ClientOptions } from 'openai'

/** A model entry: either a bare id string or a rich createModel() def. */
export type CompatibleModelInput = string | ExtendedModelDef

/** Optimistic defaults applied to bare-string models. */
export type DefaultCompatInput = readonly ['text', 'image']
export type DefaultCompatFeatures = readonly [
  'streaming',
  'function_calling',
  'structured_outputs',
]

/** Union of all selectable model names from a `models` tuple. */
export type ModelNameOf<TModels extends ReadonlyArray<CompatibleModelInput>> = {
  [I in keyof TModels]: TModels[I] extends string
    ? TModels[I]
    : TModels[I] extends ExtendedModelDef<infer TName>
      ? TName
      : never
}[number]

/** Extract the rich def (if any) for model name `M`. */
type FindDef<
  TModels extends ReadonlyArray<CompatibleModelInput>,
  TModelName extends string,
> = Extract<Extract<TModels[number], ExtendedModelDef>, { name: TModelName }>

/** Resolve input modalities for model `M`. */
export type ResolveCompatInput<
  TModels extends ReadonlyArray<CompatibleModelInput>,
  TModelName extends string,
> = [FindDef<TModels, TModelName>] extends [never]
  ? DefaultCompatInput
  : FindDef<TModels, TModelName> extends ExtendedModelDef<any, infer TInput>
    ? TInput
    : DefaultCompatInput

/** Resolve provider options for model `M`. */
export type ResolveCompatOptions<
  TModels extends ReadonlyArray<CompatibleModelInput>,
  TModelName extends string,
> = [FindDef<TModels, TModelName>] extends [never]
  ? Record<string, any>
  : FindDef<TModels, TModelName> extends ExtendedModelDef<
        any,
        any,
        infer TOptions
      >
    ? TOptions extends Record<string, any>
      ? TOptions
      : Record<string, any>
    : Record<string, any>

/** Resolve provider tool capabilities for model `M`. */
export type ResolveCompatTools<
  TModels extends ReadonlyArray<CompatibleModelInput>,
  TModelName extends string,
> = [FindDef<TModels, TModelName>] extends [never]
  ? readonly []
  : FindDef<TModels, TModelName> extends ExtendedModelDef<
        any,
        any,
        any,
        any,
        infer TTools
      >
    ? TTools
    : readonly []

/** Which underlying OpenAI API the endpoint speaks. */
export type CompatibleApi = 'chat-completions' | 'responses'

/** Provider-factory configuration. */
export interface OpenAICompatibleConfig<
  TModels extends ReadonlyArray<CompatibleModelInput>,
> extends Omit<ClientOptions, 'apiKey' | 'baseURL'> {
  name?: string
  baseURL: string
  apiKey: string
  models: TModels
  api?: CompatibleApi
}

/** One-shot helper configuration (single model). */
export interface OpenAICompatibleTextConfig extends Omit<
  ClientOptions,
  'apiKey' | 'baseURL'
> {
  name?: string
  baseURL: string
  apiKey: string
  api?: CompatibleApi
}
