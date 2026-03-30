import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { generateId, transformNullsToUndefined } from '@tanstack/ai-utils'
import { createOpenAICompatibleClient } from '../utils/client'
import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import { convertToolsToResponsesFormat } from './responses-tool-converter'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type OpenAI_SDK from 'openai'
import type { Responses } from 'openai/resources'
import type {
  ContentPart,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { OpenAICompatibleClientConfig } from '../types/config'

/**
 * OpenAI-compatible Responses API Text Adapter
 *
 * A generalized base class for providers that use the OpenAI Responses API
 * (`/v1/responses`). Providers like OpenAI (native), Azure OpenAI, and others
 * that implement the Responses API can extend this class and only need to:
 * - Set `baseURL` in the config
 * - Lock the generic type parameters to provider-specific types
 * - Override specific methods for quirks
 *
 * Key differences from the Chat Completions adapter:
 * - Uses `client.responses.create()` instead of `client.chat.completions.create()`
 * - Messages use `ResponseInput` format
 * - System prompts go in `instructions` field, not as array messages
 * - Streaming events are completely different (9+ event types vs simple delta chunks)
 * - Supports reasoning/thinking tokens via `response.reasoning_text.delta`
 * - Structured output uses `text.format` in the request (not `response_format`)
 * - Tool calls use `response.function_call_arguments.delta`
 * - Content parts are `input_text`, `input_image`, `input_file`
 *
 * All methods that build requests or process responses are `protected` so subclasses
 * can override them.
 */
export class OpenAICompatibleResponsesTextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any> = Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TMessageMetadata extends DefaultMessageMetadataByModality =
    DefaultMessageMetadataByModality,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TMessageMetadata
> {
  readonly kind = 'text' as const
  readonly name: string

  protected client: OpenAI_SDK

  constructor(
    config: OpenAICompatibleClientConfig,
    model: TModel,
    name: string = 'openai-compatible-responses',
  ) {
    super({}, model)
    this.name = name
    this.client = createOpenAICompatibleClient(config)
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    // Track tool call metadata by unique ID
    // Responses API streams tool calls with deltas — first chunk has ID/name,
    // subsequent chunks only have args.
    // We assign our own indices as we encounter unique tool call IDs.
    const toolCallMetadata = new Map<
      string,
      { index: number; name: string; started: boolean }
    >()
    const requestParams = this.mapOptionsToRequest(options)
    const timestamp = Date.now()

    // AG-UI lifecycle tracking
    const aguiState = {
      runId: generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    try {
      const response = await this.client.responses.create(
        {
          ...requestParams,
          stream: true,
        },
        {
          headers: options.request?.headers,
          signal: options.request?.signal,
        },
      )

      yield* this.processStreamChunks(
        response,
        toolCallMetadata,
        options,
        aguiState,
      )
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

      console.error(
        `>>> [${this.name}] chatStream: Fatal error during response creation <<<`,
      )
      console.error('>>> Error message:', err.message)
      console.error('>>> Error stack:', err.stack)
      console.error('>>> Full error:', err)
    }
  }

  /**
   * Generate structured output using the provider's native JSON Schema response format.
   * Uses stream: false to get the complete response in one call.
   *
   * OpenAI-compatible Responses APIs have strict requirements for structured output:
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

    // Apply provider-specific transformations for structured output compatibility
    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    try {
      const response = await this.client.responses.create(
        {
          ...requestParams,
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
      const rawText = this.extractTextFromResponse(
        response as OpenAI_SDK.Responses.Response,
      )

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
   * Extract text content from a non-streaming Responses API response.
   * Override this in subclasses for provider-specific response shapes.
   */
  protected extractTextFromResponse(
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

  /**
   * Processes streamed chunks from the Responses API and yields AG-UI events.
   * Override this in subclasses to handle provider-specific stream behavior.
   *
   * Handles the following event types:
   * - response.created / response.incomplete / response.failed
   * - response.output_text.delta
   * - response.reasoning_text.delta
   * - response.reasoning_summary_text.delta
   * - response.content_part.added / response.content_part.done
   * - response.output_item.added
   * - response.function_call_arguments.delta / response.function_call_arguments.done
   * - response.completed
   * - error
   */
  protected async *processStreamChunks(
    stream: AsyncIterable<OpenAI_SDK.Responses.ResponseStreamEvent>,
    toolCallMetadata: Map<
      string,
      { index: number; name: string; started: boolean }
    >,
    options: TextOptions,
    aguiState: {
      runId: string
      messageId: string
      timestamp: number
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''
    const timestamp = aguiState.timestamp
    let chunkCount = 0

    // Track if we've been streaming deltas to avoid duplicating content from done events
    let hasStreamedContentDeltas = false
    let hasStreamedReasoningDeltas = false

    // Preserve response metadata across events
    let model: string = options.model

    // AG-UI lifecycle tracking
    let stepId: string | null = null
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false

    try {
      for await (const chunk of stream) {
        chunkCount++

        // Emit RUN_STARTED on first chunk
        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield {
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            model: model || options.model,
            timestamp,
          }
        }

        const handleContentPart = (contentPart: {
          type: string
          text?: string
          refusal?: string
        }): StreamChunk => {
          if (contentPart.type === 'output_text') {
            accumulatedContent += contentPart.text || ''
            return {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp,
              delta: contentPart.text || '',
              content: accumulatedContent,
            }
          }

          if (contentPart.type === 'reasoning_text') {
            accumulatedReasoning += contentPart.text || ''
            return {
              type: 'STEP_FINISHED',
              stepId: stepId || generateId(this.name),
              model: model || options.model,
              timestamp,
              delta: contentPart.text || '',
              content: accumulatedReasoning,
            }
          }
          return {
            type: 'RUN_ERROR',
            runId: aguiState.runId,
            model: model || options.model,
            timestamp,
            error: {
              message: contentPart.refusal || 'Unknown refusal',
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
              runId: aguiState.runId,
              model: chunk.response.model,
              timestamp,
              error: chunk.response.error,
            }
          }
          if (chunk.response.incomplete_details) {
            yield {
              type: 'RUN_ERROR',
              runId: aguiState.runId,
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
                messageId: aguiState.messageId,
                model: model || options.model,
                timestamp,
                role: 'assistant',
              }
            }

            accumulatedContent += textDelta
            hasStreamedContentDeltas = true
            yield {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: aguiState.messageId,
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
              stepId = generateId(this.name)
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
              stepId: stepId || generateId(this.name),
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
              stepId = generateId(this.name)
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
              stepId: stepId || generateId(this.name),
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
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp,
              role: 'assistant',
            }
          }
          // Emit STEP_STARTED if this is reasoning content
          if (contentPart.type === 'reasoning_text' && !hasEmittedStepStarted) {
            hasEmittedStepStarted = true
            stepId = generateId(this.name)
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
            args: metadata ? undefined : chunk.delta,
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
              messageId: aguiState.messageId,
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
            runId: aguiState.runId,
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
            runId: aguiState.runId,
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
      console.log(`[${this.name}] Stream ended with error:`, err.message)
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
   * Maps common TextOptions to Responses API request format.
   * Override this in subclasses to add provider-specific options.
   */
  protected mapOptionsToRequest(
    options: TextOptions,
  ): Omit<OpenAI_SDK.Responses.ResponseCreateParams, 'stream'> {
    const input = this.convertMessagesToInput(options.messages)

    const tools = options.tools
      ? convertToolsToResponsesFormat(
          options.tools,
          this.makeStructuredOutputCompatible.bind(this),
        )
      : undefined

    const modelOptions = options.modelOptions as Record<string, any> | undefined

    return {
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
  }

  /**
   * Converts ModelMessage[] to Responses API ResponseInput format.
   * Override this in subclasses for provider-specific message format quirks.
   *
   * Key differences from Chat Completions:
   * - Tool results use `function_call_output` type (not `tool` role)
   * - Assistant tool calls are `function_call` objects (not nested in `tool_calls`)
   * - User content uses `input_text`, `input_image`, `input_file` types
   * - System prompts go in `instructions`, not as messages
   */
  protected convertMessagesToInput(
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
        // Responses API expects arguments as a string (JSON string)
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            // Keep arguments as string for Responses API
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

      // Handle user messages (default case) — support multimodal content
      const contentParts = this.normalizeContent(message.content)
      const inputContent: Array<Responses.ResponseInputContent> = []

      for (const part of contentParts) {
        inputContent.push(this.convertContentPartToInput(part))
      }

      // If no content parts, add empty text
      if (inputContent.length === 0) {
        inputContent.push({ type: 'input_text', text: '' })
      }

      result.push({
        type: 'message',
        role: 'user',
        content: inputContent,
      })
    }

    return result
  }

  /**
   * Converts a ContentPart to Responses API input content item.
   * Handles text, image, and audio content parts.
   * Override this in subclasses for additional content types or provider-specific metadata.
   */
  protected convertContentPartToInput(
    part: ContentPart,
  ): Responses.ResponseInputContent {
    switch (part.type) {
      case 'text':
        return {
          type: 'input_text',
          text: part.content,
        }
      case 'image': {
        const imageMetadata = part.metadata as
          | { detail?: 'auto' | 'low' | 'high' }
          | undefined
        if (part.source.type === 'url') {
          return {
            type: 'input_image',
            image_url: part.source.value,
            detail: imageMetadata?.detail || 'auto',
          }
        }
        // For base64 data, construct a data URI using the mimeType from source
        const imageValue = part.source.value
        const imageUrl = imageValue.startsWith('data:')
          ? imageValue
          : `data:${part.source.mimeType};base64,${imageValue}`
        return {
          type: 'input_image',
          image_url: imageUrl,
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
