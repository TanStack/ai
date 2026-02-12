import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { convertToolsToProviderFormat } from '../tools'
import {
  createGroqClient,
  generateId,
  getGroqApiKeyFromEnv,
  makeGroqStructuredOutputCompatible,
  transformNullsToUndefined,
} from '../utils'
import type {
  GROQ_CHAT_MODELS,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type GROQ_SDK from 'groq-sdk'
import type { ChatCompletionCreateParamsStreaming, ChatCompletionTool } from 'groq-sdk/resources/chat/completions'
import type {
  ContentPart,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { InternalTextProviderOptions } from '../text/text-provider-options'
import type {
  ChatCompletionMessageParam,
  GroqImageMetadata,
  GroqMessageMetadataByModality,
} from '../message-types'
import type { GroqClientConfig } from '../utils'

/**
 * Configuration for Groq text adapter
 */
export interface GroqTextConfig extends GroqClientConfig { }

/**
 * Alias for TextProviderOptions for external use
 */
export type { ExternalTextProviderOptions as GroqTextProviderOptions } from '../text/text-provider-options'

/**
 * Groq Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Groq chat/text completion functionality.
 * Uses the Groq SDK which provides an OpenAI-compatible Chat Completions API.
 */
export class GroqTextAdapter<
  TModel extends (typeof GROQ_CHAT_MODELS)[number],
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  GroqMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'groq' as const

  private client: GROQ_SDK

  constructor(config: GroqTextConfig, model: TModel) {
    super({}, model)
    this.client = createGroqClient(config)
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToGroq(options)
    const timestamp = Date.now()

    const aguiState = {
      runId: generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    try {
      const stream = await this.client.chat.completions.create({
        ...requestParams,
        stream: true,
      } as ChatCompletionCreateParamsStreaming)

      yield* this.processGroqStreamChunks(
        stream as AsyncIterable<GROQ_SDK.Chat.ChatCompletionChunk>,
        options,
        aguiState,
      )
    } catch (error: unknown) {
      const err = error as Error & { code?: string }

      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield {
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          model: options.model,
          timestamp,
        }
      }

      yield {
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        error: {
          message: err.message || 'Unknown error',
          code: err.code,
        },
      }

      console.error('>>> chatStream: Fatal error during response creation <<<')
      console.error('>>> Error message:', err.message)
      console.error('>>> Error stack:', err.stack)
      console.error('>>> Full error:', err)
    }
  }

  /**
   * Generate structured output using Groq's JSON Schema response format.
   * Uses stream: false to get the complete response in one call.
   *
   * Groq has strict requirements for structured output:
   * - All properties must be in the `required` array
   * - Optional fields should have null added to their type union
   * - additionalProperties must be false for all objects
   *
   * The outputSchema is already JSON Schema (converted in the ai layer).
   * We apply Groq-specific transformations for structured output compatibility.
   */
  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapTextOptionsToGroq(chatOptions)

    const jsonSchema = makeGroqStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    try {
      const response = await this.client.chat.completions.create({
        ...requestParams,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            schema: jsonSchema,
            strict: true,
          },
        },
      })

      const rawText = response.choices[0]?.message.content || ''

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
      console.error('>>> structuredOutput: Error during response creation <<<')
      console.error('>>> Error message:', err.message)
      throw error
    }
  }

  /**
   * Processes streaming chunks from the Groq API and yields AG-UI stream events.
   * Handles text content deltas, tool call assembly, and lifecycle events.
   */
  private async *processGroqStreamChunks(
    stream: AsyncIterable<GROQ_SDK.Chat.Completions.ChatCompletionChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      messageId: string
      timestamp: number
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    const timestamp = aguiState.timestamp
    let hasEmittedTextMessageStart = false

    const toolCallsInProgress = new Map<
      number,
      {
        id: string
        name: string
        arguments: string
        started: boolean
      }
    >()

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0]

        if (!choice) continue

        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield {
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            model: chunk.model || options.model,
            timestamp,
          }
        }

        const delta = choice.delta
        const deltaContent = delta.content
        const deltaToolCalls = delta.tool_calls

        if (deltaContent) {
          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield {
              type: 'TEXT_MESSAGE_START',
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp,
              role: 'assistant',
            }
          }

          accumulatedContent += deltaContent

          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model: chunk.model || options.model,
            timestamp,
            delta: deltaContent || '',
            content: accumulatedContent,
          }
        }

        if (deltaToolCalls) {
          for (const toolCallDelta of deltaToolCalls) {
            const index = toolCallDelta.index

            if (!toolCallsInProgress.has(index)) {
              toolCallsInProgress.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: '',
                started: false,
              })
            }

            const toolCall = toolCallsInProgress.get(index)!

            if (toolCallDelta.id) {
              toolCall.id = toolCallDelta.id
            }
            if (toolCallDelta.function?.name) {
              toolCall.name = toolCallDelta.function.name
            }
            if (toolCallDelta.function?.arguments) {
              toolCall.arguments += toolCallDelta.function.arguments
            }

            if (toolCall.id && toolCall.name && !toolCall.started) {
              toolCall.started = true
              yield {
                type: 'TOOL_CALL_START',
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp,
                index,
              }
            }

            if (toolCallDelta.function?.arguments && toolCall.started) {
              yield {
                type: 'TOOL_CALL_ARGS',
                toolCallId: toolCall.id,
                model: chunk.model || options.model,
                timestamp,
                delta: toolCallDelta.function.arguments,
              }
            }
          }
        }

        if (choice.finish_reason) {
          if (
            choice.finish_reason === 'tool_calls' ||
            toolCallsInProgress.size > 0
          ) {
            for (const [, toolCall] of toolCallsInProgress) {
              let parsedInput: unknown = {}
              try {
                parsedInput = toolCall.arguments
                  ? JSON.parse(toolCall.arguments)
                  : {}
              } catch {
                parsedInput = {}
              }

              yield {
                type: 'TOOL_CALL_END',
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp,
                input: parsedInput,
              }
            }
          }

          const computedFinishReason =
            choice.finish_reason === 'tool_calls' ||
              toolCallsInProgress.size > 0
              ? 'tool_calls'
              : 'stop'

          if (hasEmittedTextMessageStart) {
            yield {
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp,
            }
          }

          yield {
            type: 'RUN_FINISHED',
            runId: aguiState.runId,
            model: chunk.model || options.model,
            timestamp,
            usage: chunk.x_groq?.usage
              ? {
                promptTokens: chunk.x_groq.usage.prompt_tokens || 0,
                completionTokens: chunk.x_groq.usage.completion_tokens || 0,
                totalTokens: chunk.x_groq.usage.total_tokens || 0,
              }
              : undefined,
            finishReason: computedFinishReason,
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      console.log('[Groq Adapter] Stream ended with error:', err.message)

      yield {
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code,
        },
      }
    }
  }

  /**
   * Maps common TextOptions to Groq-specific Chat Completions request parameters.
   */
  private mapTextOptionsToGroq(
    options: TextOptions,
  ): ChatCompletionCreateParamsStreaming {
    const modelOptions = options.modelOptions as
      | Omit<
        InternalTextProviderOptions,
        'max_tokens' | 'tools' | 'temperature' | 'input' | 'top_p'
      >
      | undefined

    if (modelOptions) {
      validateTextProviderOptions({
        ...modelOptions,
        model: options.model,
      })
    }

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const messages: Array<ChatCompletionMessageParam> = []

    if (options.systemPrompts && options.systemPrompts.length > 0) {
      messages.push({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    for (const message of options.messages) {
      messages.push(this.convertMessageToGroq(message))
    }

    return {
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      tools: tools as Array<ChatCompletionTool>,
      stream: true,
    }
  }

  /**
   * Converts a TanStack AI ModelMessage to a Groq ChatCompletionMessageParam.
   * Handles tool, assistant, and user messages including multimodal content.
   */
  private convertMessageToGroq(
    message: ModelMessage,
  ): ChatCompletionMessageParam {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId || '',
        content:
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content),
      }
    }

    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments),
        },
      }))

      return {
        role: 'assistant',
        content: this.extractTextContent(message.content),
        ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      }
    }

    const contentParts = this.normalizeContent(message.content)

    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
      return {
        role: 'user',
        content: contentParts[0].content,
      }
    }

    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail?: string } }
    > = []
    for (const part of contentParts) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.content })
      } else if (part.type === 'image') {
        const imageMetadata = part.metadata as GroqImageMetadata | undefined
        const imageValue = part.source.value
        const imageUrl =
          part.source.type === 'data' && !imageValue.startsWith('data:')
            ? `data:${part.source.mimeType};base64,${imageValue}`
            : imageValue
        parts.push({
          type: 'image_url',
          image_url: {
            url: imageUrl,
            detail: imageMetadata?.detail || 'auto',
          },
        })
      }
    }

    return {
      role: 'user',
      content: parts.length > 0 ? (parts as any) : '',
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
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}

/**
 * Creates a Groq text adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b')
 * @param apiKey - Your Groq API key
 * @param config - Optional additional configuration
 * @returns Configured Groq text adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGroqText('llama-3.3-70b-versatile', "gsk_...");
 * // adapter has type-safe providerOptions for llama-3.3-70b-versatile
 * ```
 */
export function createGroqText<
  TModel extends (typeof GROQ_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqTextConfig, 'apiKey'>,
): GroqTextAdapter<TModel> {
  return new GroqTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Groq text adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `GROQ_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Groq text adapter instance with resolved types
 * @throws Error if GROQ_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GROQ_API_KEY from environment
 * const adapter = groqText('llama-3.3-70b-versatile');
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function groqText<TModel extends (typeof GROQ_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<GroqTextConfig, 'apiKey'>,
): GroqTextAdapter<TModel> {
  const apiKey = getGroqApiKeyFromEnv()
  return createGroqText(model, apiKey, config)
}
