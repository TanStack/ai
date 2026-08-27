import type {
  DefaultMessageMetadataByModality,
  JSONSchema,
  Modality,
  TextOptions,
  TokenUsage,
} from '../../types'
import type { AdapterYieldChunk } from '../../utilities/adapter-yield-chunk'
import type { CapabilityHandle } from './middleware/capabilities'

export interface TextAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

export interface StructuredOutputOptions<TProviderOptions extends object> {
  /** Text options for the request */
  chatOptions: TextOptions<TProviderOptions>
  /** JSON Schema for structured output - already converted from Zod in the ai layer */
  outputSchema: JSONSchema
}

export interface StructuredOutputResult<T = unknown> {
  /** The parsed data conforming to the schema */
  data: T
  /** The raw text response from the model before parsing */
  rawText: string
  /** Token usage information (if provided by the adapter) */
  usage?: TokenUsage
}

export interface TextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality>,
  TMessageMetadataByModality extends DefaultMessageMetadataByModality,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
  TToolCallMetadata = unknown,
  TSystemPromptMetadata = never,
> {
  /** Discriminator for adapter kind */
  readonly kind: 'text'
  /** Provider name identifier (e.g., 'openai', 'anthropic') */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  readonly requires?: ReadonlyArray<CapabilityHandle>

  '~types': {
    providerOptions: TProviderOptions
    inputModalities: TInputModalities
    messageMetadataByModality: TMessageMetadataByModality
    toolCapabilities: TToolCapabilities
    toolCallMetadata: TToolCallMetadata
    systemPromptMetadata: TSystemPromptMetadata
  }

  chatStream: (
    options: TextOptions<TProviderOptions>,
  ) => AsyncIterable<AdapterYieldChunk>

  structuredOutput: (
    options: StructuredOutputOptions<TProviderOptions>,
  ) => Promise<StructuredOutputResult<unknown>>

  structuredOutputStream?: (
    options: StructuredOutputOptions<TProviderOptions>,
  ) => AsyncIterable<AdapterYieldChunk>

  supportsCombinedToolsAndSchema?: (
    modelOptions?: TProviderOptions | undefined,
  ) => boolean

  combinedStructuredOutputSource?: (
    modelOptions?: TProviderOptions | undefined,
  ) => 'text' | 'event'
}

export type AnyTextAdapter = TextAdapter<any, any, any, any, any, any, any>

export abstract class BaseTextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality>,
  TMessageMetadataByModality extends DefaultMessageMetadataByModality,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
  TToolCallMetadata = unknown,
  TSystemPromptMetadata = never,
> implements TextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TMessageMetadataByModality,
  TToolCapabilities,
  TToolCallMetadata,
  TSystemPromptMetadata
> {
  readonly kind = 'text' as const
  abstract readonly name: string
  readonly model: TModel
  readonly requires?: ReadonlyArray<CapabilityHandle> = undefined

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
    inputModalities: TInputModalities
    messageMetadataByModality: TMessageMetadataByModality
    toolCapabilities: TToolCapabilities
    toolCallMetadata: TToolCallMetadata
    systemPromptMetadata: TSystemPromptMetadata
  }

  protected config: TextAdapterConfig

  constructor(config: TextAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk>

  abstract structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
