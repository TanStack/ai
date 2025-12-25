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

    try {
      const stream = await this.client.chat.completions.create({
        ...requestParams,
        stream: true,
      })

      yield* this.processGrokStreamChunks(stream, options)
    } catch (error: unknown) {
      const err = error as Error
      console.error('>>> chatStream: Fatal error during response creation <<<')
      console.error('>>> Error message:', err.message)
      console.error('>>> Error stack:', err.stack)
      console.error('>>> Full error:', err)
      throw error
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
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    const timestamp = Date.now()
    let responseId = generateId(this.name)

    // Track tool calls being streamed (arguments come in chunks)
    const toolCallsInProgress = new Map<
      number,
      {
        id: string
        name: string
        arguments: string
      }
    >()

    try {
      for await (const chunk of stream) {
        responseId = chunk.id || responseId
        const choice = chunk.choices[0]

        if (!choice) continue

        const delta = choice.delta
        const deltaContent = delta.content
        const deltaToolCalls = delta.tool_calls

        // Handle content delta
        if (deltaContent) {
          accumulatedContent += deltaContent
          yield {
            type: 'content',
            id: responseId,
            model: chunk.model || options.model,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
            role: 'assistant',
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
          }
        }

        // Handle finish reason
        if (choice.finish_reason) {
          // Emit all completed tool calls
          if (
            choice.finish_reason === 'tool_calls' ||
            toolCallsInProgress.size > 0
          ) {
            for (const [index, toolCall] of toolCallsInProgress) {
              yield {
                type: 'tool_call',
                id: responseId,
                model: chunk.model || options.model,
                timestamp,
                index,
                toolCall: {
                  id: toolCall.id,
                  type: 'function',
                  function: {
                    name: toolCall.name,
                    arguments: toolCall.arguments,
                  },
                },
              }
            }
          }

          yield {
            type: 'done',
            id: responseId,
            model: chunk.model || options.model,
            timestamp,
            usage: chunk.usage
              ? {
                  promptTokens: chunk.usage.prompt_tokens || 0,
                  completionTokens: chunk.usage.completion_tokens || 0,
                  totalTokens: chunk.usage.total_tokens || 0,
                }
              : undefined,
            finishReason:
              choice.finish_reason === 'tool_calls' ||
              toolCallsInProgress.size > 0
                ? 'tool_calls'
                : 'stop',
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      console.log('[Grok Adapter] Stream ended with error:', err.message)
      yield {
        type: 'error',
        id: responseId,
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
