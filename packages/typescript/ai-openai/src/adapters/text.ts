import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { convertToolsToProviderFormat } from '../tools'
import {
  createOpenAIClient,
  generateId,
  getOpenAIApiKeyFromEnv,
} from '../utils/client'
import {
  makeOpenAIStructuredOutputCompatible,
  transformNullsToUndefined,
} from '../utils/schema-converter'
import type {
  OPENAI_CHAT_MODELS,
  OpenAIChatModel,
  OpenAIChatModelProviderOptionsByName,
  OpenAIModelInputModalitiesByName,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type OpenAI_SDK from 'openai'
import type { Responses } from 'openai/resources'
import type {
  ContentPart,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type {
  OpenAIAudioMetadata,
  OpenAIImageMetadata,
  OpenAIMessageMetadataByModality,
} from '../message-types'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI text adapter
 */
export interface OpenAITextConfig extends OpenAIClientConfig {}

/**
 * Alias for TextProviderOptions
 */
export type OpenAITextProviderOptions = ExternalTextProviderOptions

// ===========================
// Type Resolution Helpers
// ===========================

/**
 * Resolve provider options for a specific model.
 * If the model has explicit options in the map, use those; otherwise use base options.
 */
type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OpenAIChatModelProviderOptionsByName
    ? OpenAIChatModelProviderOptionsByName[TModel]
    : OpenAITextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use all modalities.
 */
type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenAIModelInputModalitiesByName
    ? OpenAIModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio']

// ===========================
// Adapter Implementation
// ===========================

/**
 * OpenAI Text (Chat) Adapter
 *
 * Tree-shakeable adapter for OpenAI chat/text completion functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class OpenAITextAdapter<
  TModel extends OpenAIChatModel,
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  OpenAIMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'openai' as const

  private client: OpenAI_SDK

  constructor(config: OpenAITextConfig, model: TModel) {
    super({}, model)
    this.client = createOpenAIClient(config)
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    // Track tool call metadata by unique ID
    // OpenAI streams tool calls with deltas - first chunk has ID/name, subsequent chunks only have args
    // We assign our own indices as we encounter unique tool call IDs
    const toolCallMetadata = new Map<
      string,
      { index: number; name: string; started: boolean }
    >()
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

      // Chat Completions API uses SSE format - iterate directly
      yield* this.processOpenAIStreamChunks(
        response,
        toolCallMetadata,
        options,
        () => generateId(this.name),
      )
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
   * Generate structured output using OpenAI's native JSON Schema response format.
   * Uses stream: false to get the complete response in one call.
   *
   * OpenAI has strict requirements for structured output:
   * - All properties must be in the `required` array
   * - Optional fields should have null added to their type union
   * - additionalProperties must be false for all objects
   *
   * The outputSchema is already JSON Schema (converted in the ai layer).
   * We apply OpenAI-specific transformations for structured output compatibility.
   */
  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestArguments = this.mapTextOptionsToOpenAI(chatOptions)

    // Apply OpenAI-specific transformations for structured output compatibility
    const jsonSchema = makeOpenAIStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    try {
      const response = await this.client.responses.create(
        {
          ...requestArguments,
          stream: false,
          // Configure structured output via text.format
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

      // Extract text content from the response
      const rawText = this.extractTextFromResponse(response)

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
      // OpenAI returns null for optional fields we made nullable in the schema
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
   * Extract text content from a non-streaming response
   */
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
    toolCallMetadata: Map<
      string,
      { index: number; name: string; started: boolean }
    >,
    options: TextOptions,
    genId: () => string,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''
    const timestamp = Date.now()
    let chunkCount = 0

    // Track if we've been streaming deltas to avoid duplicating content from done events
    let hasStreamedContentDeltas = false
    let hasStreamedReasoningDeltas = false

    // Preserve response metadata across events
    let model: string = options.model

    // AG-UI lifecycle tracking
    const runId = genId()
    const messageId = genId()
    let stepId: string | null = null
    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false

    try {
      for await (const chunk of stream) {
        chunkCount++

        // Emit RUN_STARTED on first chunk
        if (!hasEmittedRunStarted) {
          hasEmittedRunStarted = true
          yield {
            type: 'RUN_STARTED',
            runId,
            model: model || options.model,
            timestamp,
          }
        }

        const handleContentPart = (
          contentPart:
            | OpenAI_SDK.Responses.ResponseOutputText
            | OpenAI_SDK.Responses.ResponseOutputRefusal
            | OpenAI_SDK.Responses.ResponseContentPartAddedEvent.ReasoningText,
        ): StreamChunk => {
          if (contentPart.type === 'output_text') {
            accumulatedContent += contentPart.text
            return {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedContent,
            }
          }

          if (contentPart.type === 'reasoning_text') {
            accumulatedReasoning += contentPart.text
            return {
              type: 'STEP_FINISHED',
              stepId: stepId || genId(),
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedReasoning,
            }
          }
          return {
            type: 'RUN_ERROR',
            runId,
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
          model = chunk.response.model
          // Reset streaming flags for new response
          hasStreamedContentDeltas = false
          hasStreamedReasoningDeltas = false
          hasEmittedTextMessageStart = false
          hasEmittedStepStarted = false
          accumulatedContent = ''
          accumulatedReasoning = ''
          if (chunk.response.error) {
            yield {
              type: 'RUN_ERROR',
              runId,
              model: chunk.response.model,
              timestamp,
              error: chunk.response.error,
            }
          }
          if (chunk.response.incomplete_details) {
            yield {
              type: 'RUN_ERROR',
              runId,
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
            // Emit TEXT_MESSAGE_START on first text content
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield {
                type: 'TEXT_MESSAGE_START',
                messageId,
                model: model || options.model,
                timestamp,
                role: 'assistant',
              }
            }

            accumulatedContent += textDelta
            hasStreamedContentDeltas = true
            yield {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              model: model || options.model,
              timestamp,
              delta: textDelta,
              content: accumulatedContent,
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
            // Emit STEP_STARTED on first reasoning content
            if (!hasEmittedStepStarted) {
              hasEmittedStepStarted = true
              stepId = genId()
              yield {
                type: 'STEP_STARTED',
                stepId,
                model: model || options.model,
                timestamp,
                stepType: 'thinking',
              }
            }

            accumulatedReasoning += reasoningDelta
            hasStreamedReasoningDeltas = true
            yield {
              type: 'STEP_FINISHED',
              stepId: stepId || genId(),
              model: model || options.model,
              timestamp,
              delta: reasoningDelta,
              content: accumulatedReasoning,
            }
          }
        }

        // Handle reasoning summary deltas (when using reasoning.summary option)
        // response.reasoning_summary_text.delta provides incremental summary updates
        if (
          chunk.type === 'response.reasoning_summary_text.delta' &&
          chunk.delta
        ) {
          const summaryDelta =
            typeof chunk.delta === 'string' ? chunk.delta : ''

          if (summaryDelta) {
            // Emit STEP_STARTED on first reasoning content
            if (!hasEmittedStepStarted) {
              hasEmittedStepStarted = true
              stepId = genId()
              yield {
                type: 'STEP_STARTED',
                stepId,
                model: model || options.model,
                timestamp,
                stepType: 'thinking',
              }
            }

            accumulatedReasoning += summaryDelta
            hasStreamedReasoningDeltas = true
            yield {
              type: 'STEP_FINISHED',
              stepId: stepId || genId(),
              model: model || options.model,
              timestamp,
              delta: summaryDelta,
              content: accumulatedReasoning,
            }
          }
        }

        // handle content_part added events for text, reasoning and refusals
        if (chunk.type === 'response.content_part.added') {
          const contentPart = chunk.part
          // Emit TEXT_MESSAGE_START if this is text content
          if (
            contentPart.type === 'output_text' &&
            !hasEmittedTextMessageStart
          ) {
            hasEmittedTextMessageStart = true
            yield {
              type: 'TEXT_MESSAGE_START',
              messageId,
              model: model || options.model,
              timestamp,
              role: 'assistant',
            }
          }
          // Emit STEP_STARTED if this is reasoning content
          if (contentPart.type === 'reasoning_text' && !hasEmittedStepStarted) {
            hasEmittedStepStarted = true
            stepId = genId()
            yield {
              type: 'STEP_STARTED',
              stepId,
              model: model || options.model,
              timestamp,
              stepType: 'thinking',
            }
          }
          yield handleContentPart(contentPart)
        }

        if (chunk.type === 'response.content_part.done') {
          const contentPart = chunk.part

          // Skip emitting chunks for content parts that we've already streamed via deltas
          // The done event is just a completion marker, not new content
          if (contentPart.type === 'output_text' && hasStreamedContentDeltas) {
            // Content already accumulated from deltas, skip
            continue
          }
          if (
            contentPart.type === 'reasoning_text' &&
            hasStreamedReasoningDeltas
          ) {
            // Reasoning already accumulated from deltas, skip
            continue
          }

          // Only emit if we haven't been streaming deltas (e.g., for non-streaming responses)
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
                started: false,
              })
            }
            // Emit TOOL_CALL_START
            yield {
              type: 'TOOL_CALL_START',
              toolCallId: item.id,
              toolName: item.name || '',
              model: model || options.model,
              timestamp,
              index: chunk.output_index,
            }
            toolCallMetadata.get(item.id)!.started = true
          }
        }

        // Handle function call arguments delta (streaming)
        if (
          chunk.type === 'response.function_call_arguments.delta' &&
          chunk.delta
        ) {
          const metadata = toolCallMetadata.get(chunk.item_id)
          yield {
            type: 'TOOL_CALL_ARGS',
            toolCallId: chunk.item_id,
            model: model || options.model,
            timestamp,
            delta: chunk.delta,
            args: metadata ? undefined : chunk.delta, // We don't accumulate here, let caller handle it
          }
        }

        if (chunk.type === 'response.function_call_arguments.done') {
          const { item_id } = chunk

          // Get the function name from metadata (captured in output_item.added)
          const metadata = toolCallMetadata.get(item_id)
          const name = metadata?.name || ''

          // Parse arguments
          let parsedInput: unknown = {}
          try {
            parsedInput = chunk.arguments ? JSON.parse(chunk.arguments) : {}
          } catch {
            parsedInput = {}
          }

          yield {
            type: 'TOOL_CALL_END',
            toolCallId: item_id,
            toolName: name,
            model: model || options.model,
            timestamp,
            input: parsedInput,
          }
        }

        if (chunk.type === 'response.completed') {
          // Emit TEXT_MESSAGE_END if we had text content
          if (hasEmittedTextMessageStart) {
            yield {
              type: 'TEXT_MESSAGE_END',
              messageId,
              model: model || options.model,
              timestamp,
            }
          }

          // Determine finish reason based on output
          // If there are function_call items in the output, it's a tool_calls finish
          const hasFunctionCalls = chunk.response.output.some(
            (item: unknown) =>
              (item as { type: string }).type === 'function_call',
          )

          yield {
            type: 'RUN_FINISHED',
            runId,
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
            type: 'RUN_ERROR',
            runId,
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
        '[OpenAI Adapter] Stream ended with error. Event type summary:',
        {
          totalChunks: chunkCount,
          error: err.message,
        },
      )
      yield {
        type: 'RUN_ERROR',
        runId,
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
   * Maps common options to OpenAI-specific format
   * Handles translation of normalized options to OpenAI's API format
   */
  private mapTextOptionsToOpenAI(options: TextOptions) {
    const modelOptions = options.modelOptions as
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
    if (modelOptions) {
      validateTextProviderOptions({
        ...modelOptions,
        input,
        model: options.model,
      })
    }

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
              unknown,
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
      unknown,
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
 * Creates an OpenAI chat adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'gpt-4o', 'gpt-4-turbo')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI chat adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiChat('gpt-4o', "sk-...");
 * // adapter has type-safe modelOptions for gpt-4o
 * ```
 */
export function createOpenaiChat<
  TModel extends (typeof OPENAI_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITextConfig, 'apiKey'>,
): OpenAITextAdapter<TModel> {
  return new OpenAITextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI text adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'gpt-4o', 'gpt-4-turbo')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI text adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiText('gpt-4o');
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function openaiText<TModel extends (typeof OPENAI_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<OpenAITextConfig, 'apiKey'>,
): OpenAITextAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiChat(model, apiKey, config)
}
