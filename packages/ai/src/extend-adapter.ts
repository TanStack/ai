import type { Modality } from './types'

export interface ExtendedModelDef<
  TName extends string = string,
  TInput extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TOptions = unknown,
  TFeatures extends ReadonlyArray<string> = ReadonlyArray<string>,
  TTools extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
  /** The model name identifier */
  name: TName
  /** Supported input modalities for this model */
  input: TInput
  /** Type brand for provider options - use `{} as YourOptionsType` */
  modelOptions: TOptions
  /** Optional declared features (e.g. 'reasoning', 'structured_outputs') */
  features?: TFeatures
  /** Optional declared provider tools (e.g. 'web_search') */
  tools?: TTools
}

/** Capability bag accepted by the object form of `createModel`. */
export interface ModelCapabilities<
  TInput extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TFeatures extends ReadonlyArray<string> = ReadonlyArray<string>,
  TTools extends ReadonlyArray<string> = ReadonlyArray<string>,
  TOptions = unknown,
> {
  input?: TInput
  features?: TFeatures
  tools?: TTools
  modelOptions?: TOptions
}

// Overload 1 — legacy positional input array (unchanged behavior)
export function createModel<
  const TName extends string,
  const TInput extends ReadonlyArray<Modality>,
>(name: TName, input: TInput): ExtendedModelDef<TName, TInput>
// Overload 2 — capabilities object
export function createModel<
  const TName extends string,
  const TCaps extends ModelCapabilities,
>(
  name: TName,
  capabilities: TCaps,
): ExtendedModelDef<
  TName,
  TCaps['input'] extends ReadonlyArray<Modality>
    ? TCaps['input']
    : ReadonlyArray<Modality>,
  TCaps['modelOptions'],
  TCaps['features'] extends ReadonlyArray<string>
    ? TCaps['features']
    : ReadonlyArray<string>,
  TCaps['tools'] extends ReadonlyArray<string>
    ? TCaps['tools']
    : ReadonlyArray<string>
>
// Implementation
export function createModel(
  name: string,
  second: ReadonlyArray<Modality> | ModelCapabilities,
): ExtendedModelDef {
  if (Array.isArray(second)) {
    return { name, input: second, modelOptions: {} }
  }
  const caps = second as ModelCapabilities
  return {
    name,
    input: caps.input ?? (['text'] as ReadonlyArray<Modality>),
    modelOptions: caps.modelOptions ?? {},
    features: caps.features,
    tools: caps.tools,
  }
}

type ExtractCustomModelNames<TDefs extends ReadonlyArray<ExtendedModelDef>> =
  TDefs[number]['name']

type AnyAdapterFactory = (model: never, ...args: Array<never>) => unknown

type InferFactoryModels<TFactory> = TFactory extends (
  model: infer TModel,
  ...args: Array<never>
) => unknown
  ? TModel extends string
    ? TModel
    : string
  : string

type InferAdapterReturn<TFactory> = TFactory extends (
  ...args: Array<never>
) => infer TReturn
  ? TReturn
  : never

type InferRestArgs<TFactory extends AnyAdapterFactory> =
  Parameters<TFactory> extends [unknown?, ...infer TRest] ? TRest : []

type ExtendedFactory<
  TFactory extends AnyAdapterFactory,
  TDefs extends ReadonlyArray<ExtendedModelDef>,
> = (
  model: InferFactoryModels<TFactory> | ExtractCustomModelNames<TDefs>,
  ...args: InferRestArgs<TFactory>
) => InferAdapterReturn<TFactory>

export function extendAdapter<
  TFactory extends AnyAdapterFactory,
  const TDefs extends ReadonlyArray<ExtendedModelDef>,
>(factory: TFactory, _customModels: TDefs): ExtendedFactory<TFactory, TDefs>
// The implementation signature stays at the honest `AnyAdapterFactory` width;
// the overload above performs the deliberate model-union widening.
export function extendAdapter(
  factory: AnyAdapterFactory,
  _customModels: ReadonlyArray<ExtendedModelDef>,
): AnyAdapterFactory {
  return factory
}
