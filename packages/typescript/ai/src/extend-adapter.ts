import type { Modality } from './types'

// ===========================
// Extended Model Definition
// ===========================

/**
 * Definition for a custom model to add to an adapter.
 *
 * @template TName - The model name as a literal string type
 * @template TInput - Array of supported input modalities
 * @template TOptions - Provider options type for this model
 *
 * @example
 * ```typescript
 * const customModels = [
 *   createModel('my-custom-model', ['text', 'image']),
 * ] as const
 * ```
 */
export interface ExtendedModelDef<
  TName extends string = string,
  TInput extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TOptions = unknown,
> {
  /** The model name identifier */
  name: TName
  /** Supported input modalities for this model */
  input: TInput
  /** Type brand for provider options - use `{} as YourOptionsType` */
  modelOptions: TOptions
}

/**
 * Creates a custom model definition for use with `extendAdapter`.
 *
 * This is a helper function that provides proper type inference without
 * requiring manual `as const` casts on individual properties.
 *
 * @template TName - The model name (inferred from argument)
 * @template TInput - The input modalities array (inferred from argument)
 *
 * @param name - The model name identifier (literal string)
 * @param input - Array of supported input modalities
 * @returns A properly typed model definition for use with `extendAdapter`
 *
 * @example
 * ```typescript
 * import { extendAdapter, createModel } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * // Define custom models with full type inference
 * const customModels = [
 *   createModel('my-fine-tuned-gpt4', ['text', 'image']),
 *   createModel('local-llama', ['text']),
 * ] as const
 *
 * const myOpenai = extendAdapter(openaiText, customModels)
 * ```
 */
export function createModel<
  const TName extends string,
  const TInput extends ReadonlyArray<Modality>,
>(name: TName, input: TInput): ExtendedModelDef<TName, TInput> {
  return {
    name,
    input,
    modelOptions: {} as unknown,
  }
}

// ===========================
// Type Extraction Utilities
// ===========================

/**
 * Extract the model name union from an array of model definitions.
 */
type ExtractCustomModelNames<TDefs extends ReadonlyArray<ExtendedModelDef>> =
  TDefs[number]['name']

// ===========================
// Factory Type Inference
// ===========================

/**
 * Infer the model parameter type from an adapter factory function.
 * For generic functions like `<T extends Union>(model: T)`, this gets `T` which
 * TypeScript treats as the constraint union when used in parameter position.
 */
type InferFactoryModels<TFactory> = TFactory extends (
  model: infer TModel,
  ...args: Array<any>
) => any
  ? TModel extends string
    ? TModel
    : string
  : string

/**
 * Infer the config parameter type from an adapter factory function.
 */
type InferConfig<TFactory> = TFactory extends (
  model: any,
  config?: infer TConfig,
) => any
  ? TConfig
  : undefined

/**
 * Infer the adapter return type from a factory function.
 */
type InferAdapterReturn<TFactory> = TFactory extends (
  ...args: Array<any>
) => infer TReturn
  ? TReturn
  : never

// ===========================
// extendAdapter Function
// ===========================

/**
 * Extends an existing adapter factory with additional custom models.
 *
 * The extended adapter accepts both original models (with full original type inference)
 * and custom models (with types from your definitions).
 *
 * At runtime, this simply passes through to the original factory - no validation is performed.
 * The original factory's signature is fully preserved, including any config parameters.
 *
 * @param factory - The original adapter factory function (e.g., `openaiText`, `anthropicText`)
 * @param models - Array of custom model definitions with `name` and `input`
 * @returns A new factory function that accepts both original and custom models
 *
 * @example
 * ```typescript
 * import { extendAdapter, createModel } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * // Define custom models
 * const customModels = [
 *   createModel('my-fine-tuned-gpt4', ['text', 'image']),
 *   createModel('local-llama', ['text']),
 * ] as const
 *
 * // Create extended adapter
 * const myOpenai = extendAdapter(openaiText, customModels)
 *
 * // Use with original models - full type inference preserved
 * const gpt4 = myOpenai('gpt-4o')
 *
 * // Use with custom models
 * const custom = myOpenai('my-fine-tuned-gpt4')
 *
 * // Type error: 'invalid-model' is not a valid model
 * // myOpenai('invalid-model')
 *
 * // Works with chat()
 * chat({
 *   adapter: myOpenai('my-fine-tuned-gpt4'),
 *   messages: [...]
 * })
 * ```
 */
export function extendAdapter<
  TFactory extends (...args: Array<any>) => any,
  const TDefs extends ReadonlyArray<ExtendedModelDef>,
>(
  factory: TFactory,
  _customModels: TDefs,
): (
  model: InferFactoryModels<TFactory> | ExtractCustomModelNames<TDefs>,
  ...args: InferConfig<TFactory> extends undefined
    ? []
    : [config?: InferConfig<TFactory>]
) => InferAdapterReturn<TFactory> {
  // At runtime, we simply pass through to the original factory.
  // The _customModels parameter is only used for type inference.
  // No runtime validation - users are trusted to pass valid model names.
  return factory as any
}
