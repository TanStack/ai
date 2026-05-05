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
  GrokChatModelToolCapabilitiesByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type OpenAI_SDK from 'openai'
import type { Responses } from 'openai/resources'
import type {
  ContentPart,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { ExternalTextProviderOptions as GrokTextProviderOptions } from '../text/text-provider-options'
import type {
  GrokImageMetadata,
  GrokMessageMetadataByModality,
} from '../message-types'
import type { GrokClientConfig } from '../utils'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GrokChatModelToolCapabilitiesByName
    ? NonNullable<GrokChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

/**
 * Configuration for Grok text adapter
 */
export interface GrokTextConfig extends GrokClientConfig {}

/**
 * Alias for TextProviderOptions for external use
 */
export type { ExternalTextProviderOptions as GrokTextProviderOptions } from '../text/text-provider-options'

/**
 * Defaults applied to every Responses-API request unless the caller overrides
 * them via `modelOptions`. They request encrypted reasoning content by default
 * in stateless workflows (zero-data-retention friendly).
 *
 * Note: this adapter currently guarantees retrieval of encrypted reasoning
 * blobs, not automatic replay on subsequent turns.
 */
const DEFAULT_INCLUDE: Array<OpenAI_SDK.Responses.ResponseIncludable> = [
  'reasoning.encrypted_content',
]
const DEFAULT_STORE = false

/**
 * Grok Text (Chat) Adapter
 *
 * Targets xAI's Responses API (`POST /v1/responses`) — the same protocol
 * shape as OpenAI's Responses API. Encrypted reasoning content is requested
 * by default so multi-turn reasoning works without server-side conversation
 * storage.
 */
export class GrokTextAdapter<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GrokMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name = 'grok' as const

  private client: OpenAI_SDK

  constructor(config: GrokTextConfig, model: TModel) {
    super({}, model)
    this.client = createGrokClient(config)
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToGrok(options)
    const timestamp = Date.now()
    const { logger } = options

    const aguiState = {
      runId: options.runId ?? generateId(this.name),
      threadId: options.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    try {
      logger.request(
        `activity=chat provider=grok model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: 'grok', model: this.model },
      )
      const stream = await this.client.responses.create(
        {
          ...requestParams,
          stream: true,
        },
        {
          headers: options.request?.headers,
          signal: options.request?.signal,
        },
      )

      yield* this.processGrokResponsesStream(stream, options, aguiState, logger)
    } catch (error: unknown) {
      const err = error as Error & { code?: string }

      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield asChunk({
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: options.model,
          timestamp,
        })
      }

      yield asChunk({
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        message: err.message || 'Unknown error',
        code: err.code,
        error: {
          message: err.message || 'Unknown error',
          code: err.code,
        },
      })

      logger.errors('grok.chatStream fatal', {
        error,
        source: 'grok.chatStream',
      })
    }
  }

  /**
   * Generate structured output using xAI's Responses-API JSON Schema config.
   *
   * Grok inherits OpenAI's strict-mode requirements:
   * - All properties must be in the `required` array
   * - Optional fields should have null added to their type union
   * - additionalProperties must be false for all objects
   *
   * The outputSchema is already JSON Schema (converted in the ai layer).
   */
  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapTextOptionsToGrok(chatOptions)
    const { logger } = chatOptions

    const jsonSchema = makeGrokStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    try {
      logger.request(
        `activity=chat provider=grok model=${this.model} messages=${chatOptions.messages.length} tools=${chatOptions.tools?.length ?? 0} stream=false`,
        { provider: 'grok', model: this.model },
      )
      const response = await this.client.responses.create(
        {
          ...requestParams,
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

      // Grok returns null for fields we made nullable in the schema; convert
      // them back to undefined so the original Zod expectations line up.
      const transformed = transformNullsToUndefined(parsed)

      return {
        data: transformed,
        rawText,
      }
    } catch (error: unknown) {
      logger.errors('grok.structuredOutput fatal', {
        error,
        source: 'grok.structuredOutput',
      })
      throw error
    }
  }

  /**
   * Walk a non-streaming Responses-API response and concatenate every
   * `output_text` content part.
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

  private async *processGrokResponsesStream(
    stream: AsyncIterable<OpenAI_SDK.Responses.ResponseStreamEvent>,
    options: TextOptions,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      timestamp: number
      hasEmittedRunStarted: boolean
    },
    logger: InternalLogger,
  ): AsyncIterable<StreamChunk> {
    const { runId, threadId, messageId, timestamp } = aguiState
    let chunkCount = 0
    let model: string = options.model

    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let hasStreamedContentDeltas = false
    let hasStreamedReasoningDeltas = false
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false
    let stepId: string | null = null
    let reasoningMessageId: string | null = null
    let hasClosedReasoning = false

    // tool call metadata captured from response.output_item.added so we can
    // attach the function name when arguments deltas arrive.
    const toolCallMetadata = new Map<
      string,
      { index: number; name: string; started: boolean }
    >()

    const genId = () => generateId(this.name)

    const emitRunStarted = (currentModel: string): StreamChunk | null => {
      if (aguiState.hasEmittedRunStarted) return null
      aguiState.hasEmittedRunStarted = true
      return asChunk({
        type: 'RUN_STARTED',
        runId,
        threadId,
        model: currentModel,
        timestamp,
      })
    }

    try {
      for await (const chunk of stream) {
        chunkCount++
        logger.provider(`provider=grok type=${chunk.type}`, { chunk })

        const started = emitRunStarted(model || options.model)
        if (started) yield started

        const handleContentPart = (
          contentPart:
            | OpenAI_SDK.Responses.ResponseOutputText
            | OpenAI_SDK.Responses.ResponseOutputRefusal
            | OpenAI_SDK.Responses.ResponseContentPartAddedEvent.ReasoningText,
        ): StreamChunk => {
          if (contentPart.type === 'output_text') {
            accumulatedContent += contentPart.text
            return asChunk({
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedContent,
            })
          }

          if (contentPart.type === 'reasoning_text') {
            accumulatedReasoning += contentPart.text
            const currentStepId = stepId || genId()
            return asChunk({
              type: 'STEP_FINISHED',
              stepName: currentStepId,
              stepId: currentStepId,
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedReasoning,
            })
          }

          return asChunk({
            type: 'RUN_ERROR',
            runId,
            message: contentPart.refusal,
            model: model || options.model,
            timestamp,
            error: { message: contentPart.refusal },
          })
        }

        if (
          chunk.type === 'response.created' ||
          chunk.type === 'response.incomplete' ||
          chunk.type === 'response.failed'
        ) {
          model = chunk.response.model
          // Reset per-response streaming flags. xAI may emit multiple
          // response.* lifecycles in a single SSE stream during retries.
          hasStreamedContentDeltas = false
          hasStreamedReasoningDeltas = false
          hasEmittedTextMessageStart = false
          hasEmittedStepStarted = false
          reasoningMessageId = null
          hasClosedReasoning = false
          accumulatedContent = ''
          accumulatedReasoning = ''

          if (chunk.response.error) {
            yield asChunk({
              type: 'RUN_ERROR',
              runId,
              message: chunk.response.error.message,
              code: chunk.response.error.code,
              model: chunk.response.model,
              timestamp,
              error: chunk.response.error,
            })
          }
          if (chunk.response.incomplete_details) {
            const incompleteMessage =
              chunk.response.incomplete_details.reason ?? ''
            yield asChunk({
              type: 'RUN_ERROR',
              runId,
              message: incompleteMessage,
              model: chunk.response.model,
              timestamp,
              error: { message: incompleteMessage },
            })
          }
        }

        if (chunk.type === 'response.output_text.delta' && chunk.delta) {
          const textDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (textDelta) {
            if (reasoningMessageId && !hasClosedReasoning) {
              hasClosedReasoning = true
              yield asChunk({
                type: 'REASONING_MESSAGE_END',
                messageId: reasoningMessageId,
                model: model || options.model,
                timestamp,
              })
              yield asChunk({
                type: 'REASONING_END',
                messageId: reasoningMessageId,
                model: model || options.model,
                timestamp,
              })
            }

            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield asChunk({
                type: 'TEXT_MESSAGE_START',
                messageId,
                model: model || options.model,
                timestamp,
                role: 'assistant',
              })
            }

            accumulatedContent += textDelta
            hasStreamedContentDeltas = true
            yield asChunk({
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              model: model || options.model,
              timestamp,
              delta: textDelta,
              content: accumulatedContent,
            })
          }
        }

        if (chunk.type === 'response.reasoning_text.delta' && chunk.delta) {
          const reasoningDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (reasoningDelta) {
            if (!hasEmittedStepStarted) {
              hasEmittedStepStarted = true
              stepId = genId()
              reasoningMessageId = genId()

              yield asChunk({
                type: 'REASONING_START',
                messageId: reasoningMessageId,
                model: model || options.model,
                timestamp,
              })
              yield asChunk({
                type: 'REASONING_MESSAGE_START',
                messageId: reasoningMessageId,
                role: 'reasoning' as const,
                model: model || options.model,
                timestamp,
              })

              // Legacy STEP events (kept for compatibility during transition)
              yield asChunk({
                type: 'STEP_STARTED',
                stepName: stepId,
                stepId,
                model: model || options.model,
                timestamp,
                stepType: 'thinking',
              })
            }

            accumulatedReasoning += reasoningDelta
            hasStreamedReasoningDeltas = true

            yield asChunk({
              type: 'REASONING_MESSAGE_CONTENT',
              messageId: reasoningMessageId!,
              delta: reasoningDelta,
              model: model || options.model,
              timestamp,
            })

            const resolvedStepId1 = stepId || genId()
            yield asChunk({
              type: 'STEP_FINISHED',
              stepName: resolvedStepId1,
              stepId: resolvedStepId1,
              model: model || options.model,
              timestamp,
              delta: reasoningDelta,
              content: accumulatedReasoning,
            })
          }
        }

        if (
          chunk.type === 'response.reasoning_summary_text.delta' &&
          chunk.delta
        ) {
          const summaryDelta =
            typeof chunk.delta === 'string' ? chunk.delta : ''

          if (summaryDelta) {
            if (!hasEmittedStepStarted) {
              hasEmittedStepStarted = true
              stepId = genId()
              reasoningMessageId = genId()

              yield asChunk({
                type: 'REASONING_START',
                messageId: reasoningMessageId,
                model: model || options.model,
                timestamp,
              })
              yield asChunk({
                type: 'REASONING_MESSAGE_START',
                messageId: reasoningMessageId,
                role: 'reasoning' as const,
                model: model || options.model,
                timestamp,
              })

              yield asChunk({
                type: 'STEP_STARTED',
                stepName: stepId,
                stepId,
                model: model || options.model,
                timestamp,
                stepType: 'thinking',
              })
            }

            accumulatedReasoning += summaryDelta
            hasStreamedReasoningDeltas = true

            yield asChunk({
              type: 'REASONING_MESSAGE_CONTENT',
              messageId: reasoningMessageId!,
              delta: summaryDelta,
              model: model || options.model,
              timestamp,
            })

            const resolvedStepId2 = stepId || genId()
            yield asChunk({
              type: 'STEP_FINISHED',
              stepName: resolvedStepId2,
              stepId: resolvedStepId2,
              model: model || options.model,
              timestamp,
              delta: summaryDelta,
              content: accumulatedReasoning,
            })
          }
        }

        if (chunk.type === 'response.content_part.added') {
          const contentPart = chunk.part

          if (contentPart.type === 'output_text') {
            if (reasoningMessageId && !hasClosedReasoning) {
              hasClosedReasoning = true
              yield asChunk({
                type: 'REASONING_MESSAGE_END',
                messageId: reasoningMessageId,
                model: model || options.model,
                timestamp,
              })
              yield asChunk({
                type: 'REASONING_END',
                messageId: reasoningMessageId,
                model: model || options.model,
                timestamp,
              })
            }

            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield asChunk({
                type: 'TEXT_MESSAGE_START',
                messageId,
                model: model || options.model,
                timestamp,
                role: 'assistant',
              })
            }
          }

          if (contentPart.type === 'reasoning_text' && !hasEmittedStepStarted) {
            hasEmittedStepStarted = true
            stepId = genId()
            reasoningMessageId = genId()

            yield asChunk({
              type: 'REASONING_START',
              messageId: reasoningMessageId,
              model: model || options.model,
              timestamp,
            })
            yield asChunk({
              type: 'REASONING_MESSAGE_START',
              messageId: reasoningMessageId,
              role: 'reasoning' as const,
              model: model || options.model,
              timestamp,
            })

            yield asChunk({
              type: 'STEP_STARTED',
              stepName: stepId,
              stepId,
              model: model || options.model,
              timestamp,
              stepType: 'thinking',
            })
          }

          yield handleContentPart(contentPart)
        }

        if (chunk.type === 'response.content_part.done') {
          const contentPart = chunk.part

          // Skip if we've already streamed this content via deltas — the done
          // event is just the closing marker.
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
                started: false,
              })
            }
            yield asChunk({
              type: 'TOOL_CALL_START',
              toolCallId: item.id,
              toolCallName: item.name || '',
              toolName: item.name || '',
              model: model || options.model,
              timestamp,
              index: chunk.output_index,
            })
            toolCallMetadata.get(item.id)!.started = true
          }
        }

        if (
          chunk.type === 'response.function_call_arguments.delta' &&
          chunk.delta
        ) {
          yield asChunk({
            type: 'TOOL_CALL_ARGS',
            toolCallId: chunk.item_id,
            model: model || options.model,
            timestamp,
            delta: chunk.delta,
          })
        }

        if (chunk.type === 'response.function_call_arguments.done') {
          const { item_id } = chunk
          const metadata = toolCallMetadata.get(item_id)
          const name = metadata?.name || ''

          let parsedInput: unknown = {}
          try {
            const parsed = chunk.arguments ? JSON.parse(chunk.arguments) : {}
            parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
          } catch (parseError) {
            logger.errors(
              `grok: malformed function_call arguments for ${name}, defaulting to {}`,
              { error: parseError, rawArguments: chunk.arguments },
            )
            parsedInput = {}
          }

          yield asChunk({
            type: 'TOOL_CALL_END',
            toolCallId: item_id,
            toolCallName: name,
            toolName: name,
            model: model || options.model,
            timestamp,
            input: parsedInput,
          })
        }

        if (chunk.type === 'response.completed') {
          if (reasoningMessageId && !hasClosedReasoning) {
            hasClosedReasoning = true
            yield asChunk({
              type: 'REASONING_MESSAGE_END',
              messageId: reasoningMessageId,
              model: model || options.model,
              timestamp,
            })
            yield asChunk({
              type: 'REASONING_END',
              messageId: reasoningMessageId,
              model: model || options.model,
              timestamp,
            })
          }

          if (hasEmittedTextMessageStart) {
            yield asChunk({
              type: 'TEXT_MESSAGE_END',
              messageId,
              model: model || options.model,
              timestamp,
            })
          }

          const hasFunctionCalls = chunk.response.output.some(
            (item: unknown) =>
              (item as { type: string }).type === 'function_call',
          )

          yield asChunk({
            type: 'RUN_FINISHED',
            runId,
            threadId,
            model: model || options.model,
            timestamp,
            usage: {
              promptTokens: chunk.response.usage?.input_tokens || 0,
              completionTokens: chunk.response.usage?.output_tokens || 0,
              totalTokens: chunk.response.usage?.total_tokens || 0,
            },
            finishReason: hasFunctionCalls ? 'tool_calls' : 'stop',
          })
        }

        if (chunk.type === 'error') {
          yield asChunk({
            type: 'RUN_ERROR',
            runId,
            message: chunk.message,
            code: chunk.code ?? undefined,
            model: model || options.model,
            timestamp,
            error: {
              message: chunk.message,
              code: chunk.code ?? undefined,
            },
          })
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      logger.errors('grok stream ended with error', {
        error,
        source: 'grok.processGrokResponsesStream',
        totalChunks: chunkCount,
      })

      yield asChunk({
        type: 'RUN_ERROR',
        runId,
        model: options.model,
        timestamp,
        message: err.message || 'Unknown error occurred',
        code: err.code,
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code,
        },
      })
    }
  }

  /**
   * Build the Responses-API request body. Applies the encrypted-reasoning
   * defaults (`store: false`, `include: ['reasoning.encrypted_content']`)
   * unless the caller explicitly overrides them via `modelOptions`.
   */
  private mapTextOptionsToGrok(
    options: TextOptions,
  ): Omit<OpenAI_SDK.Responses.ResponseCreateParams, 'stream'> {
    const modelOptions = options.modelOptions as
      | GrokTextProviderOptions
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

    // Caller wins: spread `modelOptions` last for explicit overrides, but
    // preserve the encrypted-reasoning defaults if they didn't pass values.
    const callerInclude = modelOptions?.include
    const include =
      callerInclude === undefined ? DEFAULT_INCLUDE : callerInclude
    const store =
      modelOptions?.store === undefined ? DEFAULT_STORE : modelOptions.store

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
      include,
      store,
      input,
      tools: tools as Array<OpenAI_SDK.Responses.Tool> | undefined,
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
      const grokContent: Array<Responses.ResponseInputContent> = []

      for (const part of contentParts) {
        if (part.type === 'text') {
          grokContent.push({ type: 'input_text', text: part.content })
        } else if (part.type === 'image') {
          const imageMetadata = part.metadata as GrokImageMetadata | undefined
          if (part.source.type === 'url') {
            grokContent.push({
              type: 'input_image',
              image_url: part.source.value,
              detail: imageMetadata?.detail || 'auto',
            })
          } else {
            const imageValue = part.source.value
            const imageUrl = imageValue.startsWith('data:')
              ? imageValue
              : `data:${part.source.mimeType};base64,${imageValue}`
            grokContent.push({
              type: 'input_image',
              image_url: imageUrl,
              detail: imageMetadata?.detail || 'auto',
            })
          }
        }
        // audio / video / document parts are silently dropped; xAI's
        // /v1/responses endpoint does not accept them for chat models.
      }

      if (grokContent.length === 0) {
        grokContent.push({ type: 'input_text', text: '' })
      }

      result.push({
        type: 'message',
        role: 'user',
        content: grokContent,
      })
    }

    return result
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
 * Creates a Grok text adapter with explicit API key.
 *
 * @param model - The model name (e.g., 'grok-4.3', 'grok-4.2')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 *
 * @example
 * ```typescript
 * const adapter = createGrokText('grok-4.3', "xai-...");
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
 * Creates a Grok text adapter with automatic API key detection from
 * `XAI_API_KEY` in `process.env` (Node) or `window.env` (Browser).
 *
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * const adapter = grokText('grok-4.3');
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
