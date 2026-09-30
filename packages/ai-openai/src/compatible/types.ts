import type {
  ExtendedModelDef,
  Modality,
  ReasoningLevel,
  ReasoningMap,
} from '@tanstack/ai'
import type { ClientOptions } from 'openai'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'
import type { OpenAICompatibleCompat } from './quirks'

/**
 * A model with its reasoning levels and request quirks. `reasoning`: `false`
 * for a model that does not reason, `true` for one with no level map (every
 * level up to `high` passes), or its level map. A catalog record of
 * `@tanstack/ai-models` fits: `{ name: record.id, input: record.input,
 * reasoning: record.reasoning && (record.reasoningMap ?? true), compat: record.compat }`.
 */
export interface CompatibleModelEntry<TName extends string = string> {
  name: TName
  input?: ReadonlyArray<Modality>
  reasoning?: boolean | ReasoningMap
  /** Wins over the provider's `compat`, field by field. */
  compat?: OpenAICompatibleCompat
}

/** A model entry: a bare id string, a createModel() def, or a model entry. */
export type CompatibleModelInput =
  | string
  | ExtendedModelDef
  | CompatibleModelEntry

/**
 * Optimistic default input modalities for bare-string models. (Function
 * calling and structured output are always available on the Chat Completions
 * path, so they need no separate type-level flag; `TToolCapabilities`
 * represents provider *built-in* tools, which bare strings don't declare.)
 */
export type DefaultCompatInput = readonly ['text', 'image']

/** Union of all selectable model names from a `models` tuple. */
export type ModelNameOf<TModels extends ReadonlyArray<CompatibleModelInput>> = {
  [I in keyof TModels]: TModels[I] extends string
    ? TModels[I]
    : TModels[I] extends { name: infer TName extends string }
      ? TName
      : never
}[number]

/** The entry (a def or a model entry) for model `M`, or `never`. */
type FindEntry<
  TModels extends ReadonlyArray<CompatibleModelInput>,
  TModelName extends string,
> = Extract<Exclude<TModels[number], string>, { name: TModelName }>

/**
 * The levels a level map supports, with pi's rules: a level mapped to `null`
 * is not supported, `xhigh` and `max` need a value, and every other level
 * passes.
 */
export type LevelsOfMap<TMap> = {
  [L in ReasoningLevel]: L extends keyof TMap
    ? TMap[L] extends null
      ? never
      : L
    : L extends 'xhigh' | 'max'
      ? never
      : L
}[ReasoningLevel]

/** Up to `high`: the levels of a reasoning model with no level map. */
type DefaultLevels = Exclude<ReasoningLevel, 'xhigh' | 'max'>

/**
 * The reasoning capability of model `M`, for `chat({ reasoning })`. A bare
 * string or a def: every level up to `high`. `reasoning: false`: none.
 */
export type ResolveCompatReasoning<
  TModels extends ReadonlyArray<CompatibleModelInput>,
  TModelName extends string,
> = [FindEntry<TModels, TModelName>] extends [never]
  ? { levels: DefaultLevels; budget: false }
  : FindEntry<TModels, TModelName> extends { reasoning: infer TReasoning }
    ? TReasoning extends false
      ? never
      : TReasoning extends ReasoningMap
        ? { levels: LevelsOfMap<TReasoning>; budget: false }
        : { levels: DefaultLevels; budget: false }
    : { levels: DefaultLevels; budget: false }

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
  ? [FindEntry<TModels, TModelName>] extends [never]
    ? DefaultCompatInput
    : FindEntry<TModels, TModelName> extends {
          input: infer TInput extends ReadonlyArray<Modality>
        }
      ? TInput
      : DefaultCompatInput
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
>
  extends
    Omit<ClientOptions, 'apiKey' | 'baseURL'>,
    OpenAIBaseTextAdapterOptions {
  name?: string
  baseURL: string
  apiKey: NonNullable<ClientOptions['apiKey']>
  models: TModels
  api?: CompatibleApi
  /**
   * The provider's request quirks (thinking format, token field, replay).
   * A model entry's `compat` wins, field by field. Without it, the request is
   * the plain OpenAI shape.
   */
  compat?: OpenAICompatibleCompat
}

/** One-shot helper configuration (single model). */
export interface OpenAICompatibleTextConfig
  extends
    Omit<ClientOptions, 'apiKey' | 'baseURL'>,
    OpenAIBaseTextAdapterOptions {
  name?: string
  baseURL: string
  apiKey: NonNullable<ClientOptions['apiKey']>
  api?: CompatibleApi
  /** The model's request quirks. See {@link OpenAICompatibleConfig.compat}. */
  compat?: OpenAICompatibleCompat
  /** The model's reasoning: `false`, `true` (no level map), or its level map. */
  reasoning?: boolean | ReasoningMap
}
