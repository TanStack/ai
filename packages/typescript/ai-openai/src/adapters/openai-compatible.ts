import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools'
import {
  createOpenAIClient,
  generateId,
  makeOpenAIStructuredOutputCompatible,
  transformNullsToUndefined,
} from '../utils'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type OpenAI_SDK from 'openai'
import type { Responses } from 'openai/resources'
import type {
  ConstrainedModelMessage,
  ContentPart,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { OpenAIClientConfig } from '../utils'

// ===========================
// Generic Configuration Types
// ===========================

/**
 * Configuration for OpenAI-compatible adapters.
 * Includes all standard OpenAI config plus an optional custom name.
 */
export interface OpenAICompatibleConfig extends OpenAIClientConfig {
  /**
   * Custom name for this adapter (e.g., 'qwen', 'grok', 'together').
   * Defaults to 'openai-compatible' if not specified.
   */
  name?: string
}

/**
 * Default metadata for modalities - can be overridden by custom providers.
 */
export interface DefaultImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface DefaultAudioMetadata {
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

// ===========================
// Generic Adapter Implementation
// ===========================

/**
 * OpenAI-Compatible Text Adapter
 *
 * A generic adapter that uses the OpenAI SDK under the hood but accepts
 * custom type parameters for models, provider options, modalities, and metadata.
 *
 * This is useful for providers that use OpenAI-compatible APIs but have their
 * own model names, provider-specific options, and input modalities.
 *
 * @typeParam TModels - Union type or tuple of model names (e.g., 'qwen-turbo' | 'qwen-plus')
 * @typeParam TModel - The specific model being used (constrained to TModels)
 * @typeParam TProviderOptionsByModel - Map from model name to its provider options
 * @typeParam TInputModalitiesByModel - Map from model name to its input modalities
 * @typeParam TMessageMetadata - Metadata types for message content parts
 *
 * @example
 * ```typescript
 * // Define your models
 * const QWEN_MODELS = ['qwen-turbo', 'qwen-plus', 'qwen-max'] as const
 *
 * // Define provider options per model
 * type QwenProviderOptionsByModel = {
 *   'qwen-turbo': { enable_search?: boolean }
 *   'qwen-plus': { enable_search?: boolean; plugins?: string[] }
 *   'qwen-max': { enable_search?: boolean; plugins?: string[] }
 * }
 *
 * // Define input modalities per model
 * type QwenInputModalitiesByModel = {
 *   'qwen-turbo': readonly ['text']
 *   'qwen-plus': readonly ['text', 'image']
 *   'qwen-max': readonly ['text', 'image', 'audio']
 * }
 *
 * // Create the adapter
 * const adapter = new OpenAICompatibleTextAdapter<
 *   typeof QWEN_MODELS,
 *   'qwen-plus',
 *   QwenProviderOptionsByModel,
 *   QwenInputModalitiesByModel
 * >({ apiKey: '...', baseURL: '...', name: 'qwen' }, 'qwen-plus')
 * ```
 */
export class OpenAICompatibleTextAdapter<
  TModels extends ReadonlyArray<string>,
  TModel extends TModels[number],
  TProviderOptionsByModel extends Record<string, object> = Record<
    string,
    object
  >,
  TInputModalitiesByModel extends Record<string, ReadonlyArray<Modality>> =
    Record<string, ReadonlyArray<Modality>>,
  TMessageMetadata extends DefaultMessageMetadataByModality =
    DefaultMessageMetadataByModality,
  // Resolved types based on the specific model
  TProviderOptions extends object = TModel extends keyof TProviderOptionsByModel
    ? TProviderOptionsByModel[TModel]
    : object,
  TInputModalities extends ReadonlyArray<Modality> =
    TModel extends keyof TInputModalitiesByModel
      ? TInputModalitiesByModel[TModel]
      : readonly ['text', 'image'],
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TMessageMetadata
> {
  readonly kind = 'text' as const
  readonly name: string

  protected client: OpenAI_SDK

  constructor(config: OpenAICompatibleConfig, model: TModel) {
    super({}, model)
    this.client = createOpenAIClient(config)
    this.name = config.name || 'openai-compatible'
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const toolCallMetadata = new Map<string, { index: number; name: string }>()
    const requestArguments = this.mapTextOptionsToOpenAI(options)

    try {
      const response = await this.client.responses.create(
        {
          ...requestArguments,
          stream: true,
        },
        {
          headers: options.request?.headers,
          signal: options.request?.signal,
        },
      )

      yield* this.processOpenAIStreamChunks(
        response,
        toolCallMetadata,
        options,
        () => generateId(this.name),
      )
    } catch (error: unknown) {
      const err = error as Error
      console.error(
        `>>> [${this.name}] chatStream: Fatal error during response creation <<<`,
      )
      console.error('>>> Error message:', err.message)
      console.error('>>> Error stack:', err.stack)
      throw error
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestArguments = this.mapTextOptionsToOpenAI(chatOptions)

    const jsonSchema = makeOpenAIStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    try {
      const response = await this.client.responses.create(
        {
          ...requestArguments,
          stream: false,
          text: {
            format: {
              type: 'json_schema',
              name: 'structured_output',
              schema: jsonSchema,
              strict: true,
            },
          },
        },
        {
          headers: chatOptions.request?.headers,
          signal: chatOptions.request?.signal,
        },
      )

      const rawText = this.extractTextFromResponse(response)

      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      const transformed = transformNullsToUndefined(parsed)

      return {
        data: transformed,
        rawText,
      }
    } catch (error: unknown) {
      const err = error as Error
      console.error(
        `>>> [${this.name}] structuredOutput: Error during response creation <<<`,
      )
      console.error('>>> Error message:', err.message)
      throw error
    }
  }

  private extractTextFromResponse(
    response: OpenAI_SDK.Responses.Response,
  ): string {
    let textContent = ''

    for (const item of response.output) {
      if (item.type === 'message') {
        for (const part of item.content) {
          if (part.type === 'output_text') {
            textContent += part.text
          }
        }
      }
    }

    return textContent
  }

  private async *processOpenAIStreamChunks(
    stream: AsyncIterable<OpenAI_SDK.Responses.ResponseStreamEvent>,
    toolCallMetadata: Map<string, { index: number; name: string }>,
    options: TextOptions,
    genId: () => string,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''
    const timestamp = Date.now()
    let chunkCount = 0

    let hasStreamedContentDeltas = false
    let hasStreamedReasoningDeltas = false

    let responseId: string | null = null
    let model: string = options.model

    try {
      for await (const chunk of stream) {
        chunkCount++
        const handleContentPart = (
          contentPart:
            | OpenAI_SDK.Responses.ResponseOutputText
            | OpenAI_SDK.Responses.ResponseOutputRefusal
            | OpenAI_SDK.Responses.ResponseContentPartAddedEvent.ReasoningText,
        ): StreamChunk => {
          if (contentPart.type === 'output_text') {
            accumulatedContent += contentPart.text
            return {
              type: 'content',
              id: responseId || genId(),
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedContent,
              role: 'assistant',
            }
          }

          if (contentPart.type === 'reasoning_text') {
            accumulatedReasoning += contentPart.text
            return {
              type: 'thinking',
              id: responseId || genId(),
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedReasoning,
            }
          }
          return {
            type: 'error',
            id: responseId || genId(),
            model: model || options.model,
            timestamp,
            error: {
              message: contentPart.refusal,
            },
          }
        }

        if (
          chunk.type === 'response.created' ||
          chunk.type === 'response.incomplete' ||
          chunk.type === 'response.failed'
        ) {
          responseId = chunk.response.id
          model = chunk.response.model
          hasStreamedContentDeltas = false
          hasStreamedReasoningDeltas = false
          accumulatedContent = ''
          accumulatedReasoning = ''
          if (chunk.response.error) {
            yield {
              type: 'error',
              id: chunk.response.id,
              model: chunk.response.model,
              timestamp,
              error: chunk.response.error,
            }
          }
          if (chunk.response.incomplete_details) {
            yield {
              type: 'error',
              id: chunk.response.id,
              model: chunk.response.model,
              timestamp,
              error: {
                message: chunk.response.incomplete_details.reason ?? '',
              },
            }
          }
        }

        if (chunk.type === 'response.output_text.delta' && chunk.delta) {
          const textDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (textDelta) {
            accumulatedContent += textDelta
            hasStreamedContentDeltas = true
            yield {
              type: 'content',
              id: responseId || genId(),
              model: model || options.model,
              timestamp,
              delta: textDelta,
              content: accumulatedContent,
              role: 'assistant',
            }
          }
        }

        if (chunk.type === 'response.reasoning_text.delta' && chunk.delta) {
          const reasoningDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (reasoningDelta) {
            accumulatedReasoning += reasoningDelta
            hasStreamedReasoningDeltas = true
            yield {
              type: 'thinking',
              id: responseId || genId(),
              model: model || options.model,
              timestamp,
              delta: reasoningDelta,
              content: accumulatedReasoning,
            }
          }
        }

        if (
          chunk.type === 'response.reasoning_summary_text.delta' &&
          chunk.delta
        ) {
          const summaryDelta =
            typeof chunk.delta === 'string' ? chunk.delta : ''

          if (summaryDelta) {
            accumulatedReasoning += summaryDelta
            hasStreamedReasoningDeltas = true
            yield {
              type: 'thinking',
              id: responseId || genId(),
              model: model || options.model,
              timestamp,
              delta: summaryDelta,
              content: accumulatedReasoning,
            }
          }
        }

        if (chunk.type === 'response.content_part.added') {
          const contentPart = chunk.part
          yield handleContentPart(contentPart)
        }

        if (chunk.type === 'response.content_part.done') {
          const contentPart = chunk.part

          if (contentPart.type === 'output_text' && hasStreamedContentDeltas) {
            continue
          }
          if (
            contentPart.type === 'reasoning_text' &&
            hasStreamedReasoningDeltas
          ) {
            continue
          }

          yield handleContentPart(contentPart)
        }

        if (chunk.type === 'response.output_item.added') {
          const item = chunk.item
          if (item.type === 'function_call' && item.id) {
            if (!toolCallMetadata.has(item.id)) {
              toolCallMetadata.set(item.id, {
                index: chunk.output_index,
                name: item.name || '',
              })
            }
          }
        }

        if (chunk.type === 'response.function_call_arguments.done') {
          const { item_id, output_index } = chunk

          const metadata = toolCallMetadata.get(item_id)
          const name = metadata?.name || ''

          yield {
            type: 'tool_call',
            id: responseId || genId(),
            model: model || options.model,
            timestamp,
            index: output_index,
            toolCall: {
              id: item_id,
              type: 'function',
              function: {
                name,
                arguments: chunk.arguments,
              },
            },
          }
        }

        if (chunk.type === 'response.completed') {
          const hasFunctionCalls = chunk.response.output.some(
            (item: unknown) =>
              (item as { type: string }).type === 'function_call',
          )

          yield {
            type: 'done',
            id: responseId || genId(),
            model: model || options.model,
            timestamp,
            usage: {
              promptTokens: chunk.response.usage?.input_tokens || 0,
              completionTokens: chunk.response.usage?.output_tokens || 0,
              totalTokens: chunk.response.usage?.total_tokens || 0,
            },
            finishReason: hasFunctionCalls ? 'tool_calls' : 'stop',
          }
        }

        if (chunk.type === 'error') {
          yield {
            type: 'error',
            id: responseId || genId(),
            model: model || options.model,
            timestamp,
            error: {
              message: chunk.message,
              code: chunk.code ?? undefined,
            },
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      console.log(
        `[${this.name} Adapter] Stream ended with error. Event type summary:`,
        {
          totalChunks: chunkCount,
          error: err.message,
        },
      )
      yield {
        type: 'error',
        id: genId(),
        model: options.model,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code,
        },
      }
    }
  }

  private mapTextOptionsToOpenAI(options: TextOptions) {
    const modelOptions = options.modelOptions as object | undefined
    const input = this.convertMessagesToInput(options.messages)

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const requestParams: Omit<
      OpenAI_SDK.Responses.ResponseCreateParams,
      'stream'
    > = {
      model: options.model,
      temperature: options.temperature,
      max_output_tokens: options.maxTokens,
      top_p: options.topP,
      metadata: options.metadata,
      instructions: options.systemPrompts?.join('\n'),
      ...modelOptions,
      input,
      tools,
    }

    return requestParams
  }

  private convertMessagesToInput(
    messages: Array<ModelMessage>,
  ): Responses.ResponseInput {
    const result: Responses.ResponseInput = []

    for (const message of messages) {
      if (message.role === 'tool') {
        result.push({
          type: 'function_call_output',
          call_id: message.toolCallId || '',
          output:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
        })
        continue
      }

      if (message.role === 'assistant') {
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            const argumentsString =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments)

            result.push({
              type: 'function_call',
              call_id: toolCall.id,
              name: toolCall.function.name,
              arguments: argumentsString,
            })
          }
        }

        if (message.content) {
          const contentStr = this.extractTextContent(message.content)
          if (contentStr) {
            result.push({
              type: 'message',
              role: 'assistant',
              content: contentStr,
            })
          }
        }

        continue
      }

      const contentParts = this.normalizeContent(message.content)
      const openAIContent: Array<Responses.ResponseInputContent> = []

      for (const part of contentParts) {
        openAIContent.push(this.convertContentPartToOpenAI(part))
      }

      if (openAIContent.length === 0) {
        openAIContent.push({ type: 'input_text', text: '' })
      }

      result.push({
        type: 'message',
        role: 'user',
        content: openAIContent,
      })
    }

    return result
  }

  private convertContentPartToOpenAI(
    part: ContentPart,
  ): Responses.ResponseInputContent {
    switch (part.type) {
      case 'text':
        return {
          type: 'input_text',
          text: part.content,
        }
      case 'image': {
        const imageMetadata = part.metadata as DefaultImageMetadata | undefined
        if (part.source.type === 'url') {
          return {
            type: 'input_image',
            image_url: part.source.value,
            detail: imageMetadata?.detail || 'auto',
          }
        }
        return {
          type: 'input_image',
          image_url: part.source.value,
          detail: imageMetadata?.detail || 'auto',
        }
      }
      case 'audio': {
        if (part.source.type === 'url') {
          return {
            type: 'input_file',
            file_url: part.source.value,
          }
        }
        return {
          type: 'input_file',
          file_data: part.source.value,
        }
      }

      default:
        throw new Error(`Unsupported content part type: ${part.type}`)
    }
  }

  private normalizeContent(
    content: string | null | Array<ContentPart>,
  ): Array<ContentPart> {
    if (content === null) {
      return []
    }
    if (typeof content === 'string') {
      return [{ type: 'text', content: content }]
    }
    return content
  }

  private extractTextContent(
    content: string | null | Array<ContentPart>,
  ): string {
    if (content === null) {
      return ''
    }
    if (typeof content === 'string') {
      return content
    }
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}

// ===========================
// Factory Function Types
// ===========================

/**
 * Configuration for creating an OpenAI-compatible provider wrapper.
 */
export interface OpenAICompatibleProviderConfig {
  /**
   * Provider name for identification (e.g., 'qwen', 'grok').
   */
  name: string

  /**
   * Base URL for the OpenAI-compatible API endpoint.
   */
  baseURL: string

  /**
   * API key for authentication.
   */
  apiKey: string

  /**
   * Optional organization ID.
   */
  organization?: string
}

/**
 * Helper to check if type is exactly empty object by checking Required<T>.
 * An empty object {} has no keys even after Required.
 * A type like { a?: string } has 'a' as a key after Required.
 */
type IsExactlyEmptyObject<T> = keyof T extends never
  ? T extends Record<string, never>
    ? true
    : {} extends Required<T>
      ? true
      : false
  : false

/**
 * Utility type to make empty object types strict (disallow extra properties).
 * When T is an empty object {}, it becomes Record<string, never> which rejects any properties.
 * Objects with defined keys (even optional ones) are left unchanged.
 * This ensures that modelOptions for a model with no defined options cannot accept arbitrary properties.
 */
type StrictEmptyObject<T> =
  IsExactlyEmptyObject<T> extends true ? Record<string, never> : T

/**
 * Utility type to make empty metadata objects strict across all modalities.
 * Only converts empty {} to Record<string, never>, preserving non-empty types.
 */
type StrictMetadataByModality<T extends DefaultMessageMetadataByModality> = {
  text: StrictEmptyObject<T['text']>
  image: StrictEmptyObject<T['image']>
  audio: StrictEmptyObject<T['audio']>
  video: StrictEmptyObject<T['video']>
  document: StrictEmptyObject<T['document']>
}

/**
 * Resolves the provider options for a specific model, with strict empty object handling.
 */
type ResolveProviderOptions<
  TModel extends string,
  TProviderOptionsByModel extends Record<string, object>,
> = TModel extends keyof TProviderOptionsByModel
  ? StrictEmptyObject<TProviderOptionsByModel[TModel]>
  : Record<string, never>

/**
 * Resolves the input modalities for a specific model.
 */
type ResolveInputModalities<
  TModel extends string,
  TInputModalitiesByModel extends Record<string, ReadonlyArray<Modality>>,
> = TModel extends keyof TInputModalitiesByModel
  ? TInputModalitiesByModel[TModel]
  : readonly ['text', 'image', 'audio']

/**
 * Creates an InputModalitiesTypes object for a specific model.
 * This is used to constrain message content based on the model's capabilities.
 */
type CreateInputModalitiesTypes<
  TModel extends string,
  TInputModalitiesByModel extends Record<string, ReadonlyArray<Modality>>,
  TMessageMetadata extends DefaultMessageMetadataByModality,
> = {
  inputModalities: ResolveInputModalities<TModel, TInputModalitiesByModel>
  messageMetadataByModality: StrictMetadataByModality<TMessageMetadata>
}

/**
 * Text options with model constraint for OpenAI-compatible providers.
 * Properly constrains messages based on the model's input modalities and custom metadata.
 */
export type OpenAICompatibleTextOptions<
  TModels extends ReadonlyArray<string>,
  TModel extends TModels[number],
  TProviderOptionsByModel extends Record<string, object>,
  TInputModalitiesByModel extends Record<string, ReadonlyArray<Modality>> =
    Record<string, ReadonlyArray<Modality>>,
  TMessageMetadata extends DefaultMessageMetadataByModality =
    DefaultMessageMetadataByModality,
> = Omit<TextOptions, 'model' | 'modelOptions' | 'messages'> & {
  model: TModel
  modelOptions?: ResolveProviderOptions<TModel, TProviderOptionsByModel>
  messages: Array<
    ConstrainedModelMessage<
      CreateInputModalitiesTypes<
        TModel,
        TInputModalitiesByModel,
        TMessageMetadata
      >
    >
  >
}

/**
 * Structured output options with model constraint for OpenAI-compatible providers.
 */
export type OpenAICompatibleStructuredOutputOptions<
  TModels extends ReadonlyArray<string>,
  TModel extends TModels[number],
  TProviderOptionsByModel extends Record<string, object>,
  TInputModalitiesByModel extends Record<string, ReadonlyArray<Modality>> =
    Record<string, ReadonlyArray<Modality>>,
  TMessageMetadata extends DefaultMessageMetadataByModality =
    DefaultMessageMetadataByModality,
> = {
  chatOptions: OpenAICompatibleTextOptions<
    TModels,
    TModel,
    TProviderOptionsByModel,
    TInputModalitiesByModel,
    TMessageMetadata
  >
  outputSchema: StructuredOutputOptions<object>['outputSchema']
}

/**
 * Result from createOpenAICompatibleProvider - provides chatStream and structuredOutput methods.
 */
export interface OpenAICompatibleProvider<
  TModels extends ReadonlyArray<string>,
  TModel extends TModels[number],
  TProviderOptionsByModel extends Record<string, object>,
  TInputModalitiesByModel extends Record<string, ReadonlyArray<Modality>>,
  TMessageMetadata extends DefaultMessageMetadataByModality,
> {
  /**
   * Stream chat completions from the model.
   */
  chatStream: (
    options: Omit<
      OpenAICompatibleTextOptions<
        TModels,
        TModel,
        TProviderOptionsByModel,
        TInputModalitiesByModel,
        TMessageMetadata
      >,
      'model'
    >,
  ) => AsyncIterable<StreamChunk>

  /**
   * Generate structured output using the provider's native JSON Schema response format.
   */
  structuredOutput: (options: {
    chatOptions: Omit<
      OpenAICompatibleTextOptions<
        TModels,
        TModel,
        TProviderOptionsByModel,
        TInputModalitiesByModel,
        TMessageMetadata
      >,
      'model'
    >
    outputSchema: StructuredOutputOptions<object>['outputSchema']
  }) => Promise<StructuredOutputResult<unknown>>

  /**
   * The model this provider is configured for.
   */
  model: TModel

  /**
   * The provider name.
   */
  name: string
}

/**
 * Creates a typed OpenAI-compatible provider wrapper.
 *
 * Use this function to create custom providers that use OpenAI-compatible APIs
 * but have their own model definitions, provider options, and type safety.
 *
 * @example
 * ```typescript
 * // Define your models
 * const QWEN_MODELS = ['qwen-turbo', 'qwen-plus', 'qwen-max'] as const
 *
 * // Define provider options per model (optional - defaults to empty object)
 * type QwenProviderOptionsByModel = {
 *   'qwen-turbo': { enable_search?: boolean }
 *   'qwen-plus': { enable_search?: boolean; plugins?: string[] }
 *   'qwen-max': { enable_search?: boolean; plugins?: string[] }
 * }
 *
 * // Define input modalities per model (optional - defaults to text/image/audio)
 * type QwenInputModalitiesByModel = {
 *   'qwen-turbo': readonly ['text']
 *   'qwen-plus': readonly ['text', 'image']
 *   'qwen-max': readonly ['text', 'image', 'audio']
 * }
 *
 * // Create the provider
 * const qwen = createOpenAICompatibleProvider<
 *   typeof QWEN_MODELS,
 *   'qwen-plus',
 *   QwenProviderOptionsByModel,
 *   QwenInputModalitiesByModel
 * >(
 *   {
 *     name: 'qwen',
 *     apiKey: 'your-api-key',
 *     baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
 *   },
 *   'qwen-plus',
 * )
 *
 * // Use the provider - model is already bound
 * qwen.chatStream({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * })
 * ```
 */
export function createOpenAICompatibleProvider<
  TModels extends ReadonlyArray<string>,
  TModel extends TModels[number],
  TProviderOptionsByModel extends Record<string, object> = Record<
    string,
    object
  >,
  TInputModalitiesByModel extends Record<string, ReadonlyArray<Modality>> =
    Record<string, ReadonlyArray<Modality>>,
  TMessageMetadata extends DefaultMessageMetadataByModality =
    DefaultMessageMetadataByModality,
>(
  config: OpenAICompatibleProviderConfig,
  model: TModel,
): OpenAICompatibleProvider<
  TModels,
  TModel,
  TProviderOptionsByModel,
  TInputModalitiesByModel,
  TMessageMetadata
> {
  const adapter = new OpenAICompatibleTextAdapter<
    TModels,
    TModel,
    TProviderOptionsByModel,
    TInputModalitiesByModel,
    TMessageMetadata
  >(config, model)

  // Create a wrapper that implements the OpenAICompatibleProvider interface
  // by injecting the bound model into chatStream and structuredOutput calls
  return {
    chatStream: (options) =>
      adapter.chatStream({
        ...options,
        model,
        // Type assertion needed because the adapter's generic inference differs slightly
        // from the interface's resolved types, but they are semantically equivalent
      } as Parameters<typeof adapter.chatStream>[0]),
    structuredOutput: (options) =>
      adapter.structuredOutput({
        chatOptions: {
          ...options.chatOptions,
          model,
        } as Parameters<typeof adapter.structuredOutput>[0]['chatOptions'],
        outputSchema: options.outputSchema,
      }),
    model,
    name: adapter.name,
  }
}

// ===========================
// Simplified Type Helpers
// ===========================

/**
 * Helper type to define provider options for all models with a common base.
 * Use this when all your models share the same provider options.
 *
 * @example
 * ```typescript
 * type MyProviderOptions = {
 *   customOption?: boolean
 *   anotherOption?: string
 * }
 *
 * type MyProviderOptionsByModel = UniformProviderOptions<
 *   typeof MY_MODELS,
 *   MyProviderOptions
 * >
 * ```
 */
export type UniformProviderOptions<
  TModels extends ReadonlyArray<string>,
  TOptions extends object,
> = {
  [K in TModels[number]]: TOptions
}

/**
 * Helper type to define uniform input modalities for all models.
 *
 * @example
 * ```typescript
 * type MyInputModalities = UniformInputModalities<
 *   typeof MY_MODELS,
 *   readonly ['text', 'image']
 * >
 * ```
 */
export type UniformInputModalities<
  TModels extends ReadonlyArray<string>,
  TModalities extends ReadonlyArray<Modality>,
> = {
  [K in TModels[number]]: TModalities
}
