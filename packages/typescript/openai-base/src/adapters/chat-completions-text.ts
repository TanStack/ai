import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { generateId, transformNullsToUndefined } from '@tanstack/ai-utils'
import { createOpenAICompatibleClient } from '../utils/client'
import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import { convertToolsToChatCompletionsFormat } from './chat-completions-tool-converter'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type OpenAI_SDK from 'openai'
import type {
  ContentPart,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { OpenAICompatibleClientConfig } from '../types/config'

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

/**
 * OpenAI-compatible Chat Completions Text Adapter
 *
 * A generalized base class for providers that use the OpenAI Chat Completions API
 * (`/v1/chat/completions`). Providers like Grok, Groq, OpenRouter, and others can
 * extend this class and only need to:
 * - Set `baseURL` in the config
 * - Lock the generic type parameters to provider-specific types
 * - Override specific methods for quirks
 *
 * All methods that build requests or process responses are `protected` so subclasses
 * can override them.
 */
export class OpenAICompatibleChatCompletionsTextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any> = Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TMessageMetadata extends DefaultMessageMetadataByModality =
    DefaultMessageMetadataByModality,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TMessageMetadata,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name: string

  protected client: OpenAI_SDK

  constructor(
    config: OpenAICompatibleClientConfig,
    model: TModel,
    name: string = 'openai-compatible',
  ) {
    super({}, model)
    this.name = name
    this.client = createOpenAICompatibleClient(config)
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapOptionsToRequest(options)
    const timestamp = Date.now()

    // AG-UI lifecycle tracking (mutable state object for ESLint compatibility)
    const aguiState = {
      runId: generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    try {
      const stream = await this.client.chat.completions.create(
        {
          ...requestParams,
          stream: true,
          stream_options: { include_usage: true },
        },
        {
          headers: (options.request as RequestInit | undefined)?.headers as
            | Record<string, string>
            | undefined,
          signal: (options.request as RequestInit | undefined)?.signal,
        },
      )

      yield* this.processStreamChunks(stream, options, aguiState)
    } catch (error: unknown) {
      const err = error as Error & { code?: string }

      // Emit RUN_STARTED if not yet emitted
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield asChunk({
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          model: options.model,
          timestamp,
        })
      }

      // Emit AG-UI RUN_ERROR
      yield asChunk({
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        error: {
          message: err.message || 'Unknown error',
          code: err.code,
        },
      })

      console.error(
        `>>> [${this.name}] chatStream: Fatal error during response creation <<<`,
      )
      console.error('>>> Error message:', err.message)
      console.error('>>> Error stack:', err.stack)
      console.error('>>> Full error:', err)
    }
  }

  /**
   * Generate structured output using the provider's JSON Schema response format.
   * Uses stream: false to get the complete response in one call.
   *
   * OpenAI-compatible APIs have strict requirements for structured output:
   * - All properties must be in the `required` array
   * - Optional fields should have null added to their type union
   * - additionalProperties must be false for all objects
   *
   * The outputSchema is already JSON Schema (converted in the ai layer).
   * We apply provider-specific transformations for structured output compatibility.
   */
  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapOptionsToRequest(chatOptions)

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    try {
      // Strip stream_options which is only valid for streaming calls
      const {
        stream_options: _,
        stream: __,
        ...cleanParams
      } = requestParams as any
      const response = await this.client.chat.completions.create(
        {
          ...cleanParams,
          stream: false,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'structured_output',
              schema: jsonSchema,
              strict: true,
            },
          },
        },
        {
          headers: (chatOptions.request as RequestInit | undefined)?.headers as
            | Record<string, string>
            | undefined,
          signal: (chatOptions.request as RequestInit | undefined)?.signal,
        },
      )

      // Extract text content from the response
      const rawText = response.choices[0]?.message.content || ''

      // Parse the JSON response
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      // Transform null values to undefined to match original Zod schema expectations
      // Provider returns null for optional fields we made nullable in the schema
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

  /**
   * Applies provider-specific transformations for structured output compatibility.
   * Override this in subclasses to handle provider-specific quirks.
   */
  protected makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired: Array<string>,
  ): Record<string, any> {
    return makeStructuredOutputCompatible(schema, originalRequired)
  }

  /**
   * Processes streamed chunks from the Chat Completions API and yields AG-UI events.
   * Override this in subclasses to handle provider-specific stream behavior.
   */
  protected async *processStreamChunks(
    stream: AsyncIterable<OpenAI_SDK.Chat.Completions.ChatCompletionChunk>,
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

    // Track tool calls being streamed (arguments come in chunks)
    const toolCallsInProgress = new Map<
      number,
      {
        id: string
        name: string
        arguments: string
        started: boolean // Track if TOOL_CALL_START has been emitted
      }
    >()

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0]

        if (!choice) continue

        // Emit RUN_STARTED on first chunk
        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield asChunk({
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            model: chunk.model || options.model,
            timestamp,
          })
        }

        const delta = choice.delta
        const deltaContent = delta.content
        const deltaToolCalls = delta.tool_calls

        // Handle content delta
        if (deltaContent) {
          // Emit TEXT_MESSAGE_START on first text content
          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield asChunk({
              type: 'TEXT_MESSAGE_START',
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp,
              role: 'assistant',
            })
          }

          accumulatedContent += deltaContent

          // Emit AG-UI TEXT_MESSAGE_CONTENT
          yield asChunk({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model: chunk.model || options.model,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          })
        }

        // Handle tool calls - they come in as deltas
        if (deltaToolCalls) {
          for (const toolCallDelta of deltaToolCalls) {
            const index = toolCallDelta.index

            // Initialize or update the tool call in progress
            if (!toolCallsInProgress.has(index)) {
              toolCallsInProgress.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: '',
                started: false,
              })
            }

            const toolCall = toolCallsInProgress.get(index)!

            // Update with any new data from the delta
            if (toolCallDelta.id) {
              toolCall.id = toolCallDelta.id
            }
            if (toolCallDelta.function?.name) {
              toolCall.name = toolCallDelta.function.name
            }
            if (toolCallDelta.function?.arguments) {
              toolCall.arguments += toolCallDelta.function.arguments
            }

            // Emit TOOL_CALL_START when we have id and name
            if (toolCall.id && toolCall.name && !toolCall.started) {
              toolCall.started = true
              yield asChunk({
                type: 'TOOL_CALL_START',
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp,
                index,
              })
            }

            // Emit TOOL_CALL_ARGS for argument deltas
            if (toolCallDelta.function?.arguments && toolCall.started) {
              yield asChunk({
                type: 'TOOL_CALL_ARGS',
                toolCallId: toolCall.id,
                model: chunk.model || options.model,
                timestamp,
                delta: toolCallDelta.function.arguments,
              })
            }
          }
        }

        // Handle finish reason
        if (choice.finish_reason) {
          // Emit all completed tool calls
          if (
            choice.finish_reason === 'tool_calls' ||
            toolCallsInProgress.size > 0
          ) {
            for (const [, toolCall] of toolCallsInProgress) {
              // Parse arguments for TOOL_CALL_END
              let parsedInput: unknown = {}
              try {
                parsedInput = toolCall.arguments
                  ? JSON.parse(toolCall.arguments)
                  : {}
              } catch {
                parsedInput = {}
              }

              // Emit AG-UI TOOL_CALL_END
              yield asChunk({
                type: 'TOOL_CALL_END',
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp,
                input: parsedInput,
              })
            }
          }

          const computedFinishReason =
            choice.finish_reason === 'tool_calls' ||
            toolCallsInProgress.size > 0
              ? 'tool_calls'
              : 'stop'

          // Emit TEXT_MESSAGE_END if we had text content
          if (hasEmittedTextMessageStart) {
            yield asChunk({
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp,
            })
          }

          // Emit AG-UI RUN_FINISHED
          yield asChunk({
            type: 'RUN_FINISHED',
            runId: aguiState.runId,
            model: chunk.model || options.model,
            timestamp,
            usage: chunk.usage
              ? {
                  promptTokens: chunk.usage.prompt_tokens || 0,
                  completionTokens: chunk.usage.completion_tokens || 0,
                  totalTokens: chunk.usage.total_tokens || 0,
                }
              : undefined,
            finishReason: computedFinishReason,
          })
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      console.error(`[${this.name}] Stream ended with error:`, err.message)

      // Emit AG-UI RUN_ERROR
      yield asChunk({
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code,
        },
      })
    }
  }

  /**
   * Maps common TextOptions to Chat Completions API request format.
   * Override this in subclasses to add provider-specific options.
   */
  protected mapOptionsToRequest(
    options: TextOptions,
  ): OpenAI_SDK.Chat.Completions.ChatCompletionCreateParamsStreaming {
    const tools = options.tools
      ? convertToolsToChatCompletionsFormat(
          options.tools,
          this.makeStructuredOutputCompatible.bind(this),
        )
      : undefined

    // Build messages array with system prompts
    const messages: Array<OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam> =
      []

    // Add system prompts first
    if (options.systemPrompts && options.systemPrompts.length > 0) {
      messages.push({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    // Convert messages
    for (const message of options.messages) {
      messages.push(this.convertMessage(message))
    }

    const modelOptions = options.modelOptions

    return {
      ...modelOptions,
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      tools: tools as Array<OpenAI_SDK.Chat.Completions.ChatCompletionTool>,
      stream: true,
    }
  }

  /**
   * Converts a single ModelMessage to the Chat Completions API message format.
   * Override this in subclasses to handle provider-specific message formats.
   */
  protected convertMessage(
    message: ModelMessage,
  ): OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam {
    // Handle tool messages
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

    // Handle assistant messages
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

    // Handle user messages - support multimodal content
    const contentParts = this.normalizeContent(message.content)

    // If only text, use simple string format
    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
      return {
        role: 'user',
        content: contentParts[0].content,
      }
    }

    // Otherwise, use array format for multimodal
    const parts: Array<OpenAI_SDK.Chat.Completions.ChatCompletionContentPart> =
      []
    for (const part of contentParts) {
      const converted = this.convertContentPart(part)
      if (converted) {
        parts.push(converted)
      }
    }

    return {
      role: 'user',
      content: parts.length > 0 ? parts : '',
    }
  }

  /**
   * Converts a single ContentPart to the Chat Completions API content part format.
   * Override this in subclasses to handle additional content types or provider-specific metadata.
   */
  protected convertContentPart(
    part: ContentPart,
  ): OpenAI_SDK.Chat.Completions.ChatCompletionContentPart | null {
    if (part.type === 'text') {
      return { type: 'text', text: part.content }
    }

    if (part.type === 'image') {
      const imageMetadata = part.metadata as
        | { detail?: 'auto' | 'low' | 'high' }
        | undefined

      // For base64 data, construct a data URI using the mimeType from source
      const imageValue = part.source.value
      const imageUrl =
        part.source.type === 'data' && !imageValue.startsWith('data:')
          ? `data:${part.source.mimeType};base64,${imageValue}`
          : imageValue

      return {
        type: 'image_url',
        image_url: {
          url: imageUrl,
          detail: imageMetadata?.detail || 'auto',
        },
      }
    }

    // Unsupported content type — subclasses can override to handle more types
    return null
  }

  /**
   * Normalizes message content to an array of ContentPart.
   * Handles backward compatibility with string content.
   */
  protected normalizeContent(
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
  protected extractTextContent(
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
