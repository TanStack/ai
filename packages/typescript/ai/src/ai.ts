/**
 * @module ai
 *
 * Unified ai function that infers its entire API from the adapter's kind.
 * Uses conditional types to ensure proper type checking based on adapter kind and options.
 */

import { activityMap } from './activities'
import type {
  AIOptionsUnion,
  AIResultUnion,
} from './activities'
import type { TextAdapter } from './activities/text/adapter'
import type { EmbeddingAdapter } from './activities/embedding/adapter'
import type { SummarizeAdapter } from './activities/summarize/adapter'
import type { ImageAdapter } from './activities/image/adapter'
import type { z } from 'zod'
import type {
  ConstrainedModelMessage,
  DefaultMessageMetadataByModality,
  EmbeddingResult,
  ImageGenerationResult,
  Modality,
  StreamChunk,
  SummarizationResult,
  TextOptions,
} from './types'

// ===========================
// Adapter Union Type
// ===========================

/** Union of all adapter types that can be passed to ai() */
export type GenerateAdapter =
  | TextAdapter<ReadonlyArray<string>, object, any, any, any>
  | EmbeddingAdapter<ReadonlyArray<string>, object>
  | SummarizeAdapter<ReadonlyArray<string>, object>
  | ImageAdapter<ReadonlyArray<string>, object, any, any>

/** Alias for backwards compatibility */
export type AnyAdapter = GenerateAdapter

// ===========================
// Adapter Union Type w/ Kind
// ===========================

/** Union of all adapter types with their kind discriminator */
type AnyAiAdapter =
  | (TextAdapter<ReadonlyArray<string>, object, any, any, any> & {
    kind: 'text'
  })
  | (EmbeddingAdapter<ReadonlyArray<string>, object> & { kind: 'embedding' })
  | (SummarizeAdapter<ReadonlyArray<string>, object> & { kind: 'summarize' })
  | (ImageAdapter<ReadonlyArray<string>, object, any, any> & { kind: 'image' })

// ===========================
// Provider Options Extraction
// ===========================

type AdapterBaseProviderOptions<TAdapter> =
  TAdapter extends { _providerOptions: infer P }
  ? P extends object
  ? P
  : object
  : TAdapter extends { _providerOptions?: infer P }
  ? P extends object
  ? P
  : object
  : object

// Extract the model-specific provider options map from an adapter
// Handle both optional and non-optional declarations
type ExtractModelProviderOptionsMap<TAdapter> =
  TAdapter extends { _modelProviderOptionsByName: infer M }
  ? M extends Record<string, object>
  ? M
  : never
  : TAdapter extends { _modelProviderOptionsByName?: infer M }
  ? M extends Record<string, object>
  ? M
  : never
  : never

// Get provider options for a specific model
// If the adapter has per-model options and the model is in the map, use those
// Otherwise fall back to base provider options
type ProviderOptionsForModel<TAdapter, TModel extends string> =
  ExtractModelProviderOptionsMap<TAdapter> extends never
  ? AdapterBaseProviderOptions<TAdapter>
  : TModel extends keyof ExtractModelProviderOptionsMap<TAdapter>
  ? ExtractModelProviderOptionsMap<TAdapter>[TModel]
  : AdapterBaseProviderOptions<TAdapter>

type EmbeddingProviderOptions<TAdapter> = AdapterBaseProviderOptions<TAdapter>

type SummarizeProviderOptions<TAdapter> = AdapterBaseProviderOptions<TAdapter>

// ===========================
// Internal Option Types
// ===========================

// Explicit embedding options - provides clear autocomplete and required field enforcement
type AIEmbeddingOptions<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>,
  TModel extends ExtractEmbeddingModels<TAdapter>,
> = {
  /** The embedding adapter to use */
  adapter: TAdapter & { kind: 'embedding' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Text input to embed (single string or array of strings) - REQUIRED */
  input: string | Array<string>
  /** Optional: Number of dimensions for the embedding vector */
  dimensions?: number
  /** Provider-specific options */
  providerOptions?: EmbeddingProviderOptions<TAdapter>
}

// Explicit summarize options - provides clear autocomplete and required field enforcement
type AISummarizeOptions<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>,
  TModel extends ExtractSummarizeModels<TAdapter>,
  TStream extends boolean = false,
> = {
  /** The summarize adapter to use */
  adapter: TAdapter & { kind: 'summarize' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** The text to summarize - REQUIRED */
  text: string
  /** Maximum length of the summary (in words or characters, provider-dependent) */
  maxLength?: number
  /** Style of summary to generate */
  style?: 'bullet-points' | 'paragraph' | 'concise'
  /** Topics or aspects to focus on in the summary */
  focus?: Array<string>
  /** Whether to stream the response */
  stream?: TStream
  /** Provider-specific options */
  providerOptions?: SummarizeProviderOptions<TAdapter>
}

// Explicit image options - provides clear autocomplete and required field enforcement
type AIImageOptions<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  TModel extends ExtractImageModels<TAdapter>,
> = {
  /** The image adapter to use */
  adapter: TAdapter & { kind: 'image' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** The prompt describing the image to generate - REQUIRED */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") - autocompletes based on model */
  size?: ImageSizeForModel<TAdapter, TModel>
  /** Provider-specific options */
  providerOptions?: ImageProviderOptionsForModel<TAdapter, TModel>
}

// Extract model-specific size options from an ImageAdapter
type ImageSizeForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, any, any, infer SizeByName>
  ? string extends keyof SizeByName
  ? string
  : TModel extends keyof SizeByName
  ? SizeByName[TModel]
  : string
  : string

// Extract model-specific provider options from an ImageAdapter
type ImageProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, infer BaseOptions, infer ModelOptions, any>
  ? string extends keyof ModelOptions
  ? BaseOptions
  : TModel extends keyof ModelOptions
  ? ModelOptions[TModel]
  : BaseOptions
  : object

// ===========================
// Conditional Options / Return Types
// ===========================

// Extract models directly from adapter type to avoid deferred resolution
type ExtractTextModels<T> = T extends TextAdapter<infer M, any, any, any, any>
  ? M[number]
  : string

type ExtractEmbeddingModels<T> = T extends EmbeddingAdapter<infer M, any>
  ? M[number]
  : string

type ExtractSummarizeModels<T> = T extends SummarizeAdapter<infer M, any>
  ? M[number]
  : string

type ExtractImageModels<T> = T extends ImageAdapter<infer M, any, any, any>
  ? M[number]
  : string

// Extract input modalities for a specific model from a TextAdapter
type InputModalitiesForModel<TAdapter, TModel extends string> =
  TAdapter extends TextAdapter<any, any, any, infer ModalitiesByName, any>
  ? TModel extends keyof ModalitiesByName
  ? ModalitiesByName[TModel]
  : ReadonlyArray<Modality>
  : ReadonlyArray<Modality>

// Extract message metadata by modality from a TextAdapter
type MessageMetadataForAdapter<TAdapter> =
  TAdapter extends TextAdapter<any, any, any, any, infer MetadataByModality>
  ? MetadataByModality
  : DefaultMessageMetadataByModality

// Text options type that takes model as a parameter for proper narrowing
// Use NoInfer on providerOptions to prevent inference widening
// Explicitly define all properties to prevent excess property acceptance
type AITextOptions<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends ExtractTextModels<TAdapter>,
  TSchema extends z.ZodType | undefined,
  TStream extends boolean,
> = {
  /** The text adapter to use */
  adapter: TAdapter & { kind: 'text' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Conversation messages - content types are constrained by the model's supported input modalities */
  messages: Array<ConstrainedModelMessage<
    InputModalitiesForModel<TAdapter, TModel>,
    MessageMetadataForAdapter<TAdapter>['image'],
    MessageMetadataForAdapter<TAdapter>['audio'],
    MessageMetadataForAdapter<TAdapter>['video'],
    MessageMetadataForAdapter<TAdapter>['document'],
    MessageMetadataForAdapter<TAdapter>['text']
  >>
  /** System prompts to prepend to the conversation */
  systemPrompts?: TextOptions['systemPrompts']
  /** Tools for function calling (auto-executed when called) */
  tools?: TextOptions['tools']
  /** Additional options like temperature, maxTokens, etc. */
  options?: TextOptions['options']
  /** Provider-specific options (narrowed by model) */
  providerOptions?: NoInfer<ProviderOptionsForModel<TAdapter, TModel>>
  /** AbortController for cancellation */
  abortController?: TextOptions['abortController']
  /** Strategy for controlling the agent loop */
  agentLoopStrategy?: TextOptions['agentLoopStrategy']
  /** Unique conversation identifier for tracking */
  conversationId?: TextOptions['conversationId']
  /** Optional Zod schema for structured output */
  outputSchema?: TSchema
  /** Whether to stream the text result (default: true) */
  stream?: TStream
}

type AIOptionsFor<
  TAdapter extends AnyAiAdapter,
  TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TTextStream extends boolean = true,
  TSummarizeStream extends boolean = false,
> = TAdapter extends { kind: 'text' }
  ? AITextOptions<
    Extract<TAdapter, TextAdapter<ReadonlyArray<string>, object, any, any, any>>,
    TModel & ExtractTextModels<TAdapter>,
    TSchema,
    TTextStream
  >
  : TAdapter extends { kind: 'embedding' }
  ? AIEmbeddingOptions<
    Extract<TAdapter, EmbeddingAdapter<ReadonlyArray<string>, object>>,
    TModel & ExtractEmbeddingModels<TAdapter>
  >
  : TAdapter extends { kind: 'summarize' }
  ? AISummarizeOptions<
    Extract<TAdapter, SummarizeAdapter<ReadonlyArray<string>, object>>,
    TModel & ExtractSummarizeModels<TAdapter>,
    TSummarizeStream
  >
  : TAdapter extends { kind: 'image' }
  ? AIImageOptions<
    Extract<TAdapter, ImageAdapter<ReadonlyArray<string>, object, any, any>>,
    TModel & ExtractImageModels<TAdapter>
  >
  : never

type AIReturnFor<
  TAdapter extends AnyAiAdapter,
  TSchema extends z.ZodType | undefined = undefined,
  TTextStream extends boolean = true,
  TSummarizeStream extends boolean = false,
> = TAdapter extends { kind: 'text' }
  ? TSchema extends z.ZodType
  ? Promise<z.infer<TSchema>>
  : TTextStream extends false
  ? Promise<string>
  : AsyncIterable<StreamChunk>
  : TAdapter extends { kind: 'embedding' }
  ? Promise<EmbeddingResult>
  : TAdapter extends { kind: 'summarize' }
  ? TSummarizeStream extends true
  ? AsyncIterable<StreamChunk>
  : Promise<SummarizationResult>
  : TAdapter extends { kind: 'image' }
  ? Promise<ImageGenerationResult>
  : never

// ===========================
// AI Function
// ===========================

/**
 * Unified AI function - routes to the appropriate activity based on adapter kind.
 *
 * This is the main entry point for all AI operations. The adapter's `kind` property
 * determines which activity is executed:
 * - `'text'` → Text activity (streaming, tools, structured output)
 * - `'embedding'` → Embedding activity (vector generation)
 * - `'summarize'` → Summarize activity (text summarization)
 * - `'image'` → Image activity (image generation)
 *
 * @example Chat generation (streaming)
 * ```ts
 * import { ai } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * for await (const chunk of ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Chat with tools (agentic)
 * ```ts
 * for await (const chunk of ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'What is the weather?' }],
 *   tools: [weatherTool]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Structured output (with or without tools)
 * ```ts
 * import { z } from 'zod'
 *
 * const result = await ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Generate a person' }],
 *   outputSchema: z.object({ name: z.string(), age: z.number() })
 * })
 * // result is { name: string, age: number }
 * ```
 *
 * @example Embedding generation
 * ```ts
 * import { openaiEmbed } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiEmbed(),
 *   model: 'text-embedding-3-small',
 *   input: 'Hello, world!'
 * })
 * ```
 *
 * @example Summarization
 * ```ts
 * import { openaiSummarize } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiSummarize(),
 *   model: 'gpt-4o-mini',
 *   text: 'Long text to summarize...'
 * })
 * ```
 *
 * @example Image generation
 * ```ts
 * import { openaiImage } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiImage(),
 *   model: 'dall-e-3',
 *   prompt: 'A serene mountain landscape'
 * })
 * ```
 */
export function ai<
  TAdapter extends AnyAiAdapter,
  const TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TTextStream extends boolean = true,
  TSummarizeStream extends boolean = false,
>(
  options: AIOptionsFor<TAdapter, TModel, TSchema, TTextStream, TSummarizeStream>,
): AIReturnFor<TAdapter, TSchema, TTextStream, TSummarizeStream>

// Implementation
export function ai(
  options: AIOptionsUnion,
): AIResultUnion {
  const { adapter } = options

  const handler = activityMap.get(adapter.kind)
  if (!handler) {
    throw new Error(`Unknown adapter kind: ${adapter.kind}`)
  }

  return handler(options)
}

// ===========================
// Re-exported Types
// ===========================

// Re-export adapter types
export type { TextAdapter } from './activities/text/adapter'
export type { EmbeddingAdapter } from './activities/embedding/adapter'
export type { SummarizeAdapter } from './activities/summarize/adapter'
export type { ImageAdapter } from './activities/image/adapter'

// Re-export type helpers
export type {
  TextModels,
  EmbeddingModels,
  SummarizeModels,
  ImageModels,
} from './activities'

// Re-export activity option types and legacy aliases used by the package entrypoint
export type {
  AIAdapter,
  AnyAIAdapter,
  GenerateOptions,
  TextGenerateOptions,
  EmbeddingGenerateOptions,
  SummarizeGenerateOptions,
  ImageGenerateOptions,
  GenerateTextOptions,
  GenerateEmbeddingOptions,
  GenerateSummarizeOptions,
  GenerateImageOptions,
} from './activities'
