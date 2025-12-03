import OpenAI_SDK from 'openai'
import { BaseAdapter } from '@tanstack/ai'
import { OPENAI_CHAT_MODELS, OPENAI_EMBEDDING_MODELS } from './model-meta'
import { validateTextProviderOptions } from './text/text-provider-options'
import { convertToolsToProviderFormat } from './tools'
import type { Responses } from 'openai/resources'
import type {
  ChatOptions,
  ContentPart,
  EmbeddingOptions,
  EmbeddingResult,
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type {
  OpenAIChatModelProviderOptionsByName,
  OpenAIModelInputModalitiesByName,
} from './model-meta'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from './text/text-provider-options'
import type {
  OpenAIAudioMetadata,
  OpenAIImageMetadata,
  OpenAIMessageMetadataByModality,
} from './message-types'

export interface OpenAIConfig {
  apiKey: string
  organization?: string
  baseURL?: string
}

/**
 * Alias for TextProviderOptions
 */
export type OpenAIProviderOptions = ExternalTextProviderOptions

/**
 * OpenAI-specific provider options for embeddings
 * Based on OpenAI Embeddings API documentation
 * @see https://platform.openai.com/docs/api-reference/embeddings/create
 */
interface OpenAIEmbeddingProviderOptions {
  /** Encoding format for embeddings: 'float' | 'base64' */
  encodingFormat?: 'float' | 'base64'
  /** Unique identifier for end-user (for abuse monitoring) */
  user?: string
}

export class OpenAI extends BaseAdapter<
  typeof OPENAI_CHAT_MODELS,
  typeof OPENAI_EMBEDDING_MODELS,
  OpenAIProviderOptions,
  OpenAIEmbeddingProviderOptions,
  OpenAIChatModelProviderOptionsByName,
  OpenAIModelInputModalitiesByName,
  OpenAIMessageMetadataByModality
> {
  name = 'openai' as const
  models = OPENAI_CHAT_MODELS
  embeddingModels = OPENAI_EMBEDDING_MODELS

  private client: OpenAI_SDK

  // Type-only map used by core AI to infer per-model provider options.
  // This is never set at runtime; it exists purely for TypeScript.
  // Using definite assignment assertion (!) since this is type-only.
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _modelProviderOptionsByName: OpenAIChatModelProviderOptionsByName
  // Type-only map for model input modalities; used for multimodal content type constraints
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _modelInputModalitiesByName?: OpenAIModelInputModalitiesByName
  // Type-only map for message metadata types; used for type-safe metadata autocomplete
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _messageMetadataByModality?: OpenAIMessageMetadataByModality

  constructor(config: OpenAIConfig) {
    super({})
    this.client = new OpenAI_SDK({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
    })
  }

  async *chatStream(
    options: ChatOptions<string, OpenAIProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    // Track tool call metadata by unique ID
    // OpenAI streams tool calls with deltas - first chunk has ID/name, subsequent chunks only have args
    // We assign our own indices as we encounter unique tool call IDs
    const toolCallMetadata = new Map<string, { index: number; name: string }>()
    const requestArguments = this.mapChatOptionsToOpenAI(options)

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

      // Chat Completions API uses SSE format - iterate directly
      yield* this.processOpenAIStreamChunks(
        response,
        toolCallMetadata,
        options,
        () => this.generateId(),
      )
    } catch (error: any) {
      console.error('>>> chatStream: Fatal error during response creation <<<')
      console.error('>>> Error message:', error?.message)
      console.error('>>> Error stack:', error?.stack)
      console.error('>>> Full error:', error)
      throw error
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    const response = await this.client.chat.completions.create({
      model: options.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: options.text },
      ],
      max_tokens: options.maxLength,
      temperature: 0.3,
      stream: false,
    })

    return {
      id: response.id,
      model: response.model,
      summary: response.choices[0]?.message.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    }
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: options.model || 'text-embedding-ada-002',
      input: options.input,
      dimensions: options.dimensions,
    })

    return {
      id: this.generateId(),
      model: response.model,
      embeddings: response.data.map((d) => d.embedding),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    }
  }

  private buildSummarizationPrompt(options: SummarizationOptions): string {
    let prompt = 'You are a professional summarizer. '

    switch (options.style) {
      case 'bullet-points':
        prompt += 'Provide a summary in bullet point format. '
        break
      case 'paragraph':
        prompt += 'Provide a summary in paragraph format. '
        break
      case 'concise':
        prompt += 'Provide a very concise summary in 1-2 sentences. '
        break
      default:
        prompt += 'Provide a clear and concise summary. '
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(', ')}. `
    }

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `
    }

    return prompt
  }

  private async *processOpenAIStreamChunks(
    stream: AsyncIterable<OpenAI_SDK.Responses.ResponseStreamEvent>,
    toolCallMetadata: Map<string, { index: number; name: string }>,
    options: ChatOptions,
    generateId: () => string,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''
    const timestamp = Date.now()
    let chunkCount = 0

    // Preserve response metadata across events
    let responseId: string | null = null
    let model: string = options.model

    const eventTypeCounts = new Map<string, number>()

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
              id: responseId || generateId(),
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
              id: responseId || generateId(),
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedReasoning,
            }
          }
          return {
            type: 'error',
            id: responseId || generateId(),
            model: model || options.model,
            timestamp,
            error: {
              message: contentPart.refusal,
            },
          }
        }
        // handle general response events
        if (
          chunk.type === 'response.created' ||
          chunk.type === 'response.incomplete' ||
          chunk.type === 'response.failed'
        ) {
          responseId = chunk.response.id
          model = chunk.response.model
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
        // Handle output text deltas (token-by-token streaming)
        // response.output_text.delta provides incremental text updates
        if (chunk.type === 'response.output_text.delta' && chunk.delta) {
          // Delta can be an array of strings or a single string
          const textDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (textDelta) {
            accumulatedContent += textDelta
            yield {
              type: 'content',
              id: responseId || generateId(),
              model: model || options.model,
              timestamp,
              delta: textDelta,
              content: accumulatedContent,
              role: 'assistant',
            }
          }
        }

        // Handle reasoning deltas (token-by-token thinking/reasoning streaming)
        // response.reasoning_text.delta provides incremental reasoning updates
        if (chunk.type === 'response.reasoning_text.delta' && chunk.delta) {
          // Delta can be an array of strings or a single string
          const reasoningDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (reasoningDelta) {
            accumulatedReasoning += reasoningDelta
            yield {
              type: 'thinking',
              id: responseId || generateId(),
              model: model || options.model,
              timestamp,
              delta: reasoningDelta,
              content: accumulatedReasoning,
            }
          }
        }

        // handle content_part added events for text, reasoning and refusals
        if (chunk.type === 'response.content_part.added') {
          const contentPart = chunk.part
          yield handleContentPart(contentPart)
        }

        // handle content deltas - this is where streaming happens!
        if (chunk.type === 'response.output_text.delta') {
          accumulatedContent += chunk.delta
          yield {
            type: 'content',
            id: responseId || generateId(),
            model: model || options.model,
            timestamp,
            delta: chunk.delta,
            content: accumulatedContent,
            role: 'assistant',
          }
        }

        if (chunk.type === 'response.reasoning_text.delta') {
          accumulatedReasoning += chunk.delta
          yield {
            type: 'thinking',
            id: responseId || generateId(),
            model: model || options.model,
            timestamp,
            delta: chunk.delta,
            content: accumulatedReasoning,
          }
        }

        if (chunk.type === 'response.content_part.done') {
          const contentPart = chunk.part

          yield handleContentPart(contentPart)
        }

        // handle output_item.added to capture function call metadata (name)
        if (chunk.type === 'response.output_item.added') {
          const item = chunk.item
          if (item.type === 'function_call' && item.id) {
            // Store the function name for later use
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

          // Get the function name from metadata (captured in output_item.added)
          const metadata = toolCallMetadata.get(item_id)
          const name = metadata?.name || ''

          yield {
            type: 'tool_call',
            id: responseId || generateId(),
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
          // Determine finish reason based on output
          // If there are function_call items in the output, it's a tool_calls finish
          const hasFunctionCalls = chunk.response.output.some(
            (item: any) => item.type === 'function_call',
          )

          yield {
            type: 'done',
            id: responseId || generateId(),
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
            id: responseId || generateId(),
            model: model || options.model,
            timestamp,
            error: {
              message: chunk.message,
              code: chunk.code ?? undefined,
            },
          }
        }
      }
    } catch (error: any) {
      console.log(
        '[OpenAI Adapter] Stream ended with error. Event type summary:',
        {
          totalChunks: chunkCount,
          eventTypes: Object.fromEntries(eventTypeCounts),
          error: error.message,
        },
      )
      yield {
        type: 'error',
        id: generateId(),
        model: options.model,
        timestamp,
        error: {
          message: error.message || 'Unknown error occurred',
          code: error.code,
        },
      }
    }
  }

  /**
   * Maps common options to OpenAI-specific format
   * Handles translation of normalized options to OpenAI's API format
   */
  private mapChatOptionsToOpenAI(options: ChatOptions) {
    const providerOptions = options.providerOptions as
      | Omit<
          InternalTextProviderOptions,
          | 'max_output_tokens'
          | 'tools'
          | 'metadata'
          | 'temperature'
          | 'input'
          | 'top_p'
        >
      | undefined
    const input = this.convertMessagesToInput(options.messages)
    if (providerOptions) {
      validateTextProviderOptions({ ...providerOptions, input })
    }

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const requestParams: Omit<
      OpenAI_SDK.Responses.ResponseCreateParams,
      'stream'
    > = {
      model: options.model,
      temperature: options.options?.temperature,
      max_output_tokens: options.options?.maxTokens,
      top_p: options.options?.topP,
      metadata: options.options?.metadata,
      instructions: options.systemPrompts?.join('\n'),
      ...providerOptions,
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
      // Handle tool messages - convert to FunctionToolCallOutput
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

      // Handle assistant messages
      if (message.role === 'assistant') {
        // If the assistant message has tool calls, add them as FunctionToolCall objects
        // OpenAI Responses API expects arguments as a string (JSON string)
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            // Keep arguments as string for Responses API
            // Our internal format stores arguments as a JSON string, which is what API expects
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

        // Add the assistant's text message if there is content
        if (message.content) {
          // Assistant messages are typically text-only
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

      // Handle user messages (default case) - support multimodal content
      const contentParts = this.normalizeContent(message.content)
      const openAIContent: Array<Responses.ResponseInputContent> = []

      for (const part of contentParts) {
        openAIContent.push(
          this.convertContentPartToOpenAI(
            part as ContentPart<
              OpenAIImageMetadata,
              OpenAIAudioMetadata,
              unknown,
              unknown
            >,
          ),
        )
      }

      // If no content parts, add empty text
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

  /**
   * Converts a ContentPart to OpenAI input content item.
   * Handles text, image, and audio content parts.
   */
  private convertContentPartToOpenAI(
    part: ContentPart<
      OpenAIImageMetadata,
      OpenAIAudioMetadata,
      unknown,
      unknown
    >,
  ): Responses.ResponseInputContent {
    switch (part.type) {
      case 'text':
        return {
          type: 'input_text',
          text: part.content,
        }
      case 'image': {
        const imageMetadata = part.metadata
        if (part.source.type === 'url') {
          return {
            type: 'input_image',
            image_url: part.source.value,
            detail: imageMetadata?.detail || 'auto',
          }
        }
        // For base64 data, construct a data URI
        return {
          type: 'input_image',
          image_url: part.source.value,
          detail: imageMetadata?.detail || 'auto',
        }
      }
      case 'audio': {
        if (part.source.type === 'url') {
          // OpenAI may support audio URLs in the future
          // For now, treat as data URI
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

  /**
   * Normalizes message content to an array of ContentPart.
   * Handles backward compatibility with string content.
   */
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

  /**
   * Extracts text content from a content value that may be string, null, or ContentPart array.
   */
  private extractTextContent(
    content: string | null | Array<ContentPart>,
  ): string {
    if (content === null) {
      return ''
    }
    if (typeof content === 'string') {
      return content
    }
    // It's an array of ContentPart
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}

/**
 * Creates an OpenAI adapter with simplified configuration
 * @param apiKey - Your OpenAI API key
 * @returns A fully configured OpenAI adapter instance
 *
 * @example
 * ```typescript
 * const openai = createOpenAI("sk-...");
 *
 * const ai = new AI({
 *   adapters: {
 *     openai,
 *   }
 * });
 * ```
 */
export function createOpenAI(
  apiKey: string,
  config?: Omit<OpenAIConfig, 'apiKey'>,
): OpenAI {
  return new OpenAI({ apiKey, ...config })
}

/**
 * Create an OpenAI adapter with automatic API key detection from environment variables.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI adapter instance
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const aiInstance = ai(openai());
 * ```
 */
export function openai(config?: Omit<OpenAIConfig, 'apiKey'>): OpenAI {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.OPENAI_API_KEY

  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is required. Please set it in your environment variables or use createOpenAI(apiKey, config) instead.',
    )
  }

  return createOpenAI(key, config)
}
