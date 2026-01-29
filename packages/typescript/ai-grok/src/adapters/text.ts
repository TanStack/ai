import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { convertToolsToProviderFormat } from '../tools'
import {
  createGrokClient,
  generateId,
  getGrokApiKeyFromEnv,
  makeGrokStructuredOutputCompatible,
  transformNullsToUndefined,
} from '../utils'
import type {
  GROK_CHAT_MODELS,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type OpenAI_SDK from 'openai'
import type {
  ContentPart,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { InternalTextProviderOptions } from '../text/text-provider-options'
import type {
  GrokImageMetadata,
  GrokMessageMetadataByModality,
} from '../message-types'
import type { GrokClientConfig } from '../utils'

/**
 * Configuration for Grok text adapter
 */
export interface GrokTextConfig extends GrokClientConfig {}

/**
 * Alias for TextProviderOptions for external use
 */
export type { ExternalTextProviderOptions as GrokTextProviderOptions } from '../text/text-provider-options'

/**
 * Grok Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Grok chat/text completion functionality.
 * Uses OpenAI-compatible Chat Completions API (not Responses API).
 */
export class GrokTextAdapter<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  GrokMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'grok' as const

  private client: OpenAI_SDK

  constructor(config: GrokTextConfig, model: TModel) {
    super({}, model)
    this.client = createGrokClient(config)
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToGrok(options)
    const timestamp = Date.now()

    // AG-UI lifecycle tracking (mutable state object for ESLint compatibility)
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
      })

      yield* this.processGrokStreamChunks(stream, options, aguiState)
    } catch (error: unknown) {
      const err = error as Error & { code?: string }

      // Emit RUN_STARTED if not yet emitted
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield {
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          model: options.model,
          timestamp,
        }
      }

      // Emit AG-UI RUN_ERROR
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
   * Generate structured output using Grok's JSON Schema response format.
   * Uses stream: false to get the complete response in one call.
   *
   * Grok has strict requirements for structured output (via OpenAI-compatible API):
   * - All properties must be in the `required` array
   * - Optional fields should have null added to their type union
   * - additionalProperties must be false for all objects
   *
   * The outputSchema is already JSON Schema (converted in the ai layer).
   * We apply Grok-specific transformations for structured output compatibility.
   */
  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapTextOptionsToGrok(chatOptions)

    // Apply Grok-specific transformations for structured output compatibility
    const jsonSchema = makeGrokStructuredOutputCompatible(
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
      // Grok returns null for optional fields we made nullable in the schema
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

  private async *processGrokStreamChunks(
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

        // Handle content delta
        if (deltaContent) {
          // Emit TEXT_MESSAGE_START on first text content
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

          // Emit AG-UI TEXT_MESSAGE_CONTENT
          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model: chunk.model || options.model,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          }
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
              yield {
                type: 'TOOL_CALL_START',
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp,
                index,
              }
            }

            // Emit TOOL_CALL_ARGS for argument deltas
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

          // Emit TEXT_MESSAGE_END if we had text content
          if (hasEmittedTextMessageStart) {
            yield {
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp,
            }
          }

          // Emit AG-UI RUN_FINISHED
          yield {
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
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      console.log('[Grok Adapter] Stream ended with error:', err.message)

      // Emit AG-UI RUN_ERROR
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
   * Maps common options to Grok-specific Chat Completions format
   */
  private mapTextOptionsToGrok(
    options: TextOptions,
  ): OpenAI_SDK.Chat.Completions.ChatCompletionCreateParamsStreaming {
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
      messages.push(this.convertMessageToGrok(message))
    }

    return {
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      tools: tools as Array<OpenAI_SDK.Chat.Completions.ChatCompletionTool>,
      stream: true,
      stream_options: { include_usage: true },
    }
  }

  private convertMessageToGrok(
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
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.content })
      } else if (part.type === 'image') {
        const imageMetadata = part.metadata as GrokImageMetadata | undefined
        parts.push({
          type: 'image_url',
          image_url: {
            url: part.source.value,
            detail: imageMetadata?.detail || 'auto',
          },
        })
      }
    }

    return {
      role: 'user',
      content: parts.length > 0 ? parts : '',
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
 * Creates a Grok text adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'grok-3', 'grok-4')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok text adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGrokText('grok-3', "xai-...");
 * // adapter has type-safe providerOptions for grok-3
 * ```
 */
export function createGrokText<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokTextConfig, 'apiKey'>,
): GrokTextAdapter<TModel> {
  return new GrokTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Grok text adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'grok-3', 'grok-4')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok text adapter instance with resolved types
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokText('grok-3');
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function grokText<TModel extends (typeof GROK_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<GrokTextConfig, 'apiKey'>,
): GrokTextAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokText(model, apiKey, config)
}
