import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { convertToolsToProviderFormat } from '../tools'
import {
  createDeepSeekClient,
  generateId,
  getDeepSeekApiKeyFromEnv,
} from '../utils'
import type {
  DEEPSEEK_CHAT_MODELS,
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
  DeepSeekImageMetadata,
  DeepSeekMessageMetadataByModality,
} from '../message-types'
import type { DeepSeekClientConfig } from '../utils'

/**
 * Configuration for DeepSeek text adapter
 */
export interface DeepSeekTextConfig extends DeepSeekClientConfig {}

/**
 * Alias for TextProviderOptions for external use
 */
export type { ExternalTextProviderOptions as DeepSeekTextProviderOptions } from '../text/text-provider-options'

/**
 * DeepSeek Text (Chat) Adapter
 *
 * Tree-shakeable adapter for DeepSeek chat/text completion functionality.
 * Uses OpenAI-compatible Chat Completions API with DeepSeek-specific extensions.
 *
 * Features:
 * - Standard chat/text completion
 * - Thinking/Reasoning mode (chain-of-thought)
 * - Tool calling
 * - Structured output via JSON Schema
 * - Multimodal support (text, images)
 *
 * Thinking Mode:
 * - Automatically enabled for 'deepseek-reasoner' model
 * - Can be manually enabled via modelOptions.thinking = true
 * - Outputs reasoning content before final answer via 'thinking' stream chunks
 * - Reasoning is preserved in multi-turn conversations via message metadata
 * - Compatible with tool calling - reasoning context is maintained across tool invocations
 *
 * @example
 * ```typescript
 * // Basic thinking mode with deepseek-reasoner
 * const adapter = deepseekText('deepseek-reasoner')
 * const stream = chat({ adapter, messages: [...] })
 *
 * for await (const chunk of stream) {
 *   if (chunk.type === 'thinking') {
 *     console.log('Reasoning:', chunk.delta)
 *   } else if (chunk.type === 'content') {
 *     console.log('Response:', chunk.delta)
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Manual thinking mode with deepseek-chat
 * const adapter = deepseekText('deepseek-chat')
 * const stream = chat({
 *   adapter,
 *   messages: [...],
 *   modelOptions: { thinking: true }
 * })
 * ```
 */
export class DeepSeekTextAdapter<
  TModel extends (typeof DEEPSEEK_CHAT_MODELS)[number],
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  DeepSeekMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'deepseek' as const

  private client: OpenAI_SDK

  constructor(config: DeepSeekTextConfig, model: TModel) {
    super({}, model)
    this.client = createDeepSeekClient(config)
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToDeepSeek(options)

    try {
      const stream = await this.client.chat.completions.create({
        ...requestParams,
        stream: true,
      })

      yield* this.processDeepSeekStreamChunks(stream, options)
    } catch (error: unknown) {
      const err = error as Error & { code?: string; status?: number }
      console.error(
        '>>> DeepSeek chatStream: Fatal error during response creation <<<',
      )
      console.error('>>> Error message:', err.message)
      console.error('>>> Error code:', err.code)
      console.error('>>> Error status:', err.status)

      // Yield error chunk before throwing
      const timestamp = Date.now()
      yield {
        type: 'error',
        id: generateId(this.name),
        model: options.model,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred during streaming',
          code: err.code || err.status?.toString(),
        },
      }

      throw error
    }
  }

  /**
   * Generate structured output using DeepSeek's JSON Schema response format.
   * Uses stream: false to get the complete response in one call.
   *
   * DeepSeek supports structured output using their json_object mode:
   * - Uses response_format: { type: 'json_object' } (not json_schema)
   * - Schema is provided via prompt instructions (not API parameter)
   * - Model is instructed to follow the schema format
   * - Supports thinking mode - reasoning will be included in response if enabled
   *
   * Note: DeepSeek does NOT support OpenAI's json_schema format with strict validation.
   * Instead, we embed the schema in the prompt and use json_object mode for valid JSON.
   *
   * @param options - Structured output options including chat options and output schema
   * @returns Promise containing parsed data, raw text, and reasoning (if thinking mode enabled)
   */
  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapTextOptionsToDeepSeek(chatOptions)

    // Convert schema to a readable format for the prompt
    const schemaDescription = JSON.stringify(outputSchema, null, 2)

    // Add schema instruction to the system message or create one
    const messages = [...requestParams.messages]
    const schemaInstruction = `You must respond with valid JSON that matches this exact schema:

${schemaDescription}

Respond only with the JSON object, no additional text.`

    // Add schema instruction to system message or create one
    const systemMessageIndex = messages.findIndex(
      (msg) => msg.role === 'system',
    )
    if (systemMessageIndex >= 0) {
      const systemMessage = messages[systemMessageIndex]
      if (systemMessage) {
        messages[systemMessageIndex] = {
          role: 'system',
          content: `${systemMessage.content || ''}\n\n${schemaInstruction}`,
        }
      }
    } else {
      messages.unshift({
        role: 'system',
        content: schemaInstruction,
      })
    }

    // Check if thinking mode should be enabled
    const modelOptions = chatOptions.modelOptions as any
    const enableThinking = this.shouldEnableThinking(
      chatOptions.model,
      modelOptions,
    )

    try {
      const baseRequestParams: any = {
        ...requestParams,
        messages,
        stream: false,
        stream_options: undefined,
        response_format: {
          type: 'json_object',
        },
      }

      // Add thinking mode if enabled
      if (enableThinking) {
        baseRequestParams.extra_body = {
          thinking: { type: 'enabled' },
        }
      }

      const response =
        await this.client.chat.completions.create(baseRequestParams)

      // Extract text content from the response
      const rawText = response.choices[0]?.message.content || ''

      // Extract reasoning content if present
      const reasoningContent = this.extractReasoningContent(response)

      // Parse the JSON response
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      // Return the parsed JSON with reasoning if available
      return {
        data: parsed,
        rawText,
        ...(reasoningContent && { reasoning: reasoningContent }),
      }
    } catch (error: unknown) {
      const err = error as Error
      console.error('>>> structuredOutput: Error during response creation <<<')
      console.error('>>> Error message:', err.message)
      throw error
    }
  }

  private async *processDeepSeekStreamChunks(
    stream: AsyncIterable<OpenAI_SDK.Chat.Completions.ChatCompletionChunk>,
    options: TextOptions,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''
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
        const deltaReasoning = (delta as any).reasoning_content

        // Handle reasoning delta (thinking mode)
        // DeepSeek provides reasoning content via delta.reasoning_content in streaming mode
        if (deltaReasoning && typeof deltaReasoning === 'string') {
          accumulatedReasoning += deltaReasoning
          yield {
            type: 'thinking',
            id: responseId,
            model: chunk.model || options.model,
            timestamp,
            delta: deltaReasoning,
            content: accumulatedReasoning,
          }
        }

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
      console.log('[DeepSeek Adapter] Stream ended with error:', err.message)
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
   * Maps common options to DeepSeek-specific Chat Completions format.
   * Handles thinking mode configuration and OpenAI-compatible parameters.
   *
   * @param options - Text options including model, messages, and configuration
   * @returns DeepSeek-compatible request parameters with thinking mode if enabled
   */
  private mapTextOptionsToDeepSeek(
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
      messages.push(this.convertMessageToDeepSeek(message))
    }

    // Enable thinking mode for deepseek-reasoner model or when explicitly enabled
    const enableThinking = this.shouldEnableThinking(
      options.model,
      modelOptions,
    )

    const baseParams: any = {
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      tools: tools as Array<OpenAI_SDK.Chat.Completions.ChatCompletionTool>,
      stream: true,
      stream_options: { include_usage: true },
    }

    // Add thinking mode if enabled
    if (enableThinking) {
      baseParams.extra_body = {
        thinking: { type: 'enabled' },
      }
    }

    return baseParams
  }

  private convertMessageToDeepSeek(
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

      const baseMessage: any = {
        role: 'assistant',
        content: this.extractTextContent(message.content),
        ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      }

      // Note: DeepSeek reasoning content is handled through streaming chunks,
      // not through message metadata. Multi-turn conversations should not
      // include reasoning_content in assistant messages per DeepSeek API guidelines.

      return baseMessage
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
        const imageMetadata = part.metadata as DeepSeekImageMetadata | undefined
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

  /**
   * Helper function to extract reasoning content from DeepSeek response.
   * Used for preserving reasoning context in multi-turn conversations.
   *
   * @param response - DeepSeek chat completion response
   * @returns Reasoning content string if present, undefined otherwise
   */
  private extractReasoningContent(
    response: OpenAI_SDK.Chat.Completions.ChatCompletion,
  ): string | undefined {
    const message = response.choices[0]?.message as any
    return message?.reasoning_content
  }

  /**
   * Helper function to determine if thinking mode should be enabled.
   * Automatically enables for deepseek-reasoner model or when explicitly requested.
   *
   * @param model - Model name to check
   * @param modelOptions - Model options that may contain thinking flag
   * @returns True if thinking mode should be enabled
   */
  private shouldEnableThinking(model: string, modelOptions?: any): boolean {
    return (
      model === 'deepseek-reasoner' ||
      (modelOptions && 'thinking' in modelOptions && modelOptions.thinking)
    )
  }
}

/**
 * Creates a DeepSeek text adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'deepseek-chat', 'deepseek-reasoner')
 * @param apiKey - Your DeepSeek API key
 * @param config - Optional additional configuration
 * @returns Configured DeepSeek text adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createDeepSeekText('deepseek-chat', "sk-...");
 * // adapter has type-safe providerOptions for deepseek-chat
 * ```
 */
export function createDeepSeekText<
  TModel extends (typeof DEEPSEEK_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<DeepSeekTextConfig, 'apiKey'>,
): DeepSeekTextAdapter<TModel> {
  return new DeepSeekTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a DeepSeek text adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `DEEPSEEK_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'deepseek-chat', 'deepseek-reasoner')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured DeepSeek text adapter instance with resolved types
 * @throws Error if DEEPSEEK_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses DEEPSEEK_API_KEY from environment
 * const adapter = deepseekText('deepseek-chat');
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function deepseekText<
  TModel extends (typeof DEEPSEEK_CHAT_MODELS)[number],
>(
  model: TModel,
  config?: Omit<DeepSeekTextConfig, 'apiKey'>,
): DeepSeekTextAdapter<TModel> {
  const apiKey = getDeepSeekApiKeyFromEnv()
  return createDeepSeekText(model, apiKey, config)
}
