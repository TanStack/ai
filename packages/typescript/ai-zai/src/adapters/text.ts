import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { createZAIClient } from '../utils/client'
import { convertToolsToZAIFormat } from '../utils/conversion'
import { ZAI_MODEL_META } from '../model-meta'
import type {
  ZAIChatModelProviderOptionsByName,
  ZAIModelInputModalitiesByName,
  ZAI_CHAT_MODELS,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { ZAIMessageMetadataByModality } from '../message-types'
import type { ZAITextOptions } from '../text/text-provider-options'
import type OpenAI from 'openai'

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof ZAIChatModelProviderOptionsByName
    ? ZAIChatModelProviderOptionsByName[TModel]
    : ZAITextOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof ZAIModelInputModalitiesByName
    ? ZAIModelInputModalitiesByName[TModel]
    : readonly ['text']

export interface ZAITextAdapterConfig {
  apiKey: string
  baseURL?: string
  coding?: boolean
}

type ZAIChatCompletionParams =
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming

/**
 * Z.AI Text Adapter
 *
 * Streams text deltas using the AG-UI protocol event format:
 * - RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT → TEXT_MESSAGE_END → RUN_FINISHED
 * - Tool calls: TOOL_CALL_START → TOOL_CALL_ARGS → TOOL_CALL_END
 * - Errors: RUN_ERROR
 */
export class ZAITextAdapter<
  TModel extends (typeof ZAI_CHAT_MODELS)[number],
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel> extends ReadonlyArray<Modality>
    ? ResolveInputModalities<TModel>
    : readonly ['text'],
  ZAIMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'zai' as const

  private client: OpenAI

  constructor(config: ZAITextAdapterConfig, model: TModel) {
    super({}, model)

    this.client = createZAIClient(config.apiKey, {
      baseURL: config.baseURL,
      coding: config.coding,
    })
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToZAI(options)
    const { logger } = options

    const timestamp = Date.now()
    const runId = options.runId ?? this.generateId()
    const threadId = options.threadId ?? this.generateId()
    const messageId = this.generateId()

    try {
      logger.request(
        `activity=chat provider=zai model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: 'zai', model: this.model },
      )

      const stream = await this.client.chat.completions.create(requestParams, {
        headers: this.getRequestHeaders(options),
        signal: this.getAbortSignal(options),
      })

      yield* this.processZAIStreamChunks(
        stream,
        options,
        runId,
        threadId,
        messageId,
        timestamp,
        logger,
      )
    } catch (error: unknown) {
      logger.errors('zai.chatStream fatal', {
        error: toRunErrorPayload(error, 'zai.chatStream failed'),
        source: 'zai.chatStream',
      })
      throw error
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const messages = this.convertMessagesToInput(
      chatOptions.messages,
      chatOptions,
    )
    const { logger } = chatOptions

    // Inject the JSON schema into the system prompt so the model knows
    // the expected output shape (Z.AI doesn't support json_schema response_format)
    const schemaPrompt = `\n\nOUTPUT SCHEMA (respond with valid JSON matching this schema):\n${JSON.stringify(outputSchema, null, 2)}`
    const firstMsg = messages[0]
    if (firstMsg && firstMsg.role === 'system') {
      messages[0] = {
        role: 'system',
        content: ((firstMsg as { content: string }).content ?? '') + schemaPrompt,
      }
    } else {
      messages.unshift({ role: 'system', content: schemaPrompt })
    }

    try {
      logger.request(
        `activity=chat-structured provider=zai model=${this.model} messages=${chatOptions.messages.length} stream=false`,
        { provider: 'zai', model: this.model },
      )

      const response = await this.client.chat.completions.create(
        {
          model: chatOptions.model ?? this.model,
          messages,
          temperature: chatOptions.temperature ?? 0,
          max_tokens: chatOptions.maxTokens,
          top_p: chatOptions.topP,
          stream: false,
          response_format: { type: 'json_object' },
        },
        {
          headers: this.getRequestHeaders(chatOptions),
          signal: this.getAbortSignal(chatOptions),
        },
      )

      const rawText = response.choices[0]?.message?.content ?? ''

      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      return { data: parsed, rawText }
    } catch (error: unknown) {
      logger.errors('zai.structuredOutput fatal', {
        error: toRunErrorPayload(error, 'zai.structuredOutput failed'),
        source: 'zai.structuredOutput',
      })
      throw error
    }
  }

  private mapTextOptionsToZAI(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): ZAIChatCompletionParams {
    const messages = this.convertMessagesToInput(options.messages, options)

    const rawProviderOptions = (options.modelOptions ?? {}) as any
    const { stopSequences, ...providerOptions } = rawProviderOptions
    const stop = stopSequences ?? providerOptions.stop

    const request: ZAIChatCompletionParams = {
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stream: true,
      stream_options: { include_usage: true },
      ...providerOptions,
    }

    if (options.tools?.length) {
      ;(request as any).tools = convertToolsToZAIFormat(options.tools)
    }

    if (stop !== undefined) {
      ;(request as any).stop = stop
    }

    return request
  }

  private convertMessagesToInput(
    messages: Array<ModelMessage>,
    options: Pick<TextOptions, 'systemPrompts'>,
  ): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
    const result: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = []

    const modelMeta = ZAI_MODEL_META[this.model]
    const inputs = modelMeta.supports.input as ReadonlyArray<string>
    const capabilities = {
      image: inputs.includes('image'),
      video: inputs.includes('video'),
    }

    if (options.systemPrompts?.length) {
      result.push({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    for (const message of messages) {
      if (message.role === 'tool') {
        if (!message.toolCallId) {
          throw new Error('Tool message missing required toolCallId')
        }
        result.push({
          role: 'tool',
          tool_call_id: message.toolCallId,
          content:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
        })
        continue
      }

      if (message.role === 'assistant') {
        const toolCalls = message.toolCalls?.map(
          (tc: NonNullable<ModelMessage['toolCalls']>[number]) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
            },
          }),
        )

        result.push({
          role: 'assistant',
          content: this.convertContent(message.content, {
            image: false,
            video: false,
          }) as string,
          ...(toolCalls && toolCalls.length ? { tool_calls: toolCalls } : {}),
        })
        continue
      }

      result.push({
        role: 'user',
        content: this.convertContent(message.content, capabilities),
      })
    }

    return result
  }

  private async *processZAIStreamChunks(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    options: TextOptions,
    runId: string,
    threadId: string,
    messageId: string,
    timestamp: number,
    logger: InternalLogger,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let responseModel = options.model

    const toolCallMetadata = new Map<
      number,
      { id: string; name: string; arguments: string }
    >()

    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false

    try {
      for await (const chunk of stream) {
        responseModel = chunk.model || responseModel

        logger.provider(`provider=zai type=chunk`, { chunk })

        // Emit RUN_STARTED on first chunk
        if (!hasEmittedRunStarted) {
          hasEmittedRunStarted = true
          yield asChunk({
            type: 'RUN_STARTED',
            runId,
            threadId,
            model: responseModel,
            timestamp,
          })
        }

        const chunkAny = chunk as any
        const choice = Array.isArray(chunkAny.choices)
          ? chunkAny.choices[0]
          : undefined
        if (!choice) continue

        const delta = choice.delta
        const deltaContent = delta.content
        const deltaToolCalls = delta.tool_calls

        // Handle text content deltas
        if (typeof deltaContent === 'string' && deltaContent.length) {
          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield asChunk({
              type: 'TEXT_MESSAGE_START',
              messageId,
              model: responseModel,
              timestamp,
              role: 'assistant',
            })
          }

          accumulatedContent += deltaContent
          yield asChunk({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId,
            model: responseModel,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          })
        }

        // Handle tool call deltas
        if (deltaToolCalls?.length) {
          for (const toolCallDelta of deltaToolCalls) {
            const index = toolCallDelta.index

            if (!toolCallMetadata.has(index)) {
              const id = toolCallDelta.id || this.generateId()
              const name = toolCallDelta.function?.name || ''

              toolCallMetadata.set(index, {
                id,
                name,
                arguments: '',
              })

              // Emit TOOL_CALL_START
              yield asChunk({
                type: 'TOOL_CALL_START',
                toolCallId: id,
                toolCallName: name,
                toolName: name,
                model: responseModel,
                timestamp,
                index,
              })
            }

            const current = toolCallMetadata.get(index)!

            if (toolCallDelta.id) current.id = toolCallDelta.id
            if (toolCallDelta.function?.name)
              current.name = toolCallDelta.function.name
            if (toolCallDelta.function?.arguments) {
              current.arguments += toolCallDelta.function.arguments

              // Emit TOOL_CALL_ARGS with the delta
              yield asChunk({
                type: 'TOOL_CALL_ARGS',
                toolCallId: current.id,
                model: responseModel,
                timestamp,
                delta: toolCallDelta.function.arguments,
              })
            }
          }
        }

        // Handle finish
        if (choice.finish_reason) {
          const isToolTurn =
            choice.finish_reason === 'tool_calls' || toolCallMetadata.size > 0

          // Emit TOOL_CALL_END for each completed tool call
          if (isToolTurn) {
            for (const [, toolCall] of toolCallMetadata) {
              let parsedInput: unknown = {}
              try {
                const parsed = toolCall.arguments
                  ? JSON.parse(toolCall.arguments)
                  : {}
                parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
              } catch {
                parsedInput = {}
              }

              yield asChunk({
                type: 'TOOL_CALL_END',
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: responseModel,
                timestamp,
                input: parsedInput,
              })
            }
          }

          // Close text message if we had one
          if (hasEmittedTextMessageStart) {
            yield asChunk({
              type: 'TEXT_MESSAGE_END',
              messageId,
              model: responseModel,
              timestamp,
            })
          }

          // Emit RUN_FINISHED
          yield asChunk({
            type: 'RUN_FINISHED',
            runId,
            threadId,
            model: responseModel,
            timestamp,
            usage: chunk.usage
              ? {
                  promptTokens: chunk.usage.prompt_tokens || 0,
                  completionTokens: chunk.usage.completion_tokens || 0,
                  totalTokens: chunk.usage.total_tokens || 0,
                }
              : undefined,
            finishReason: isToolTurn ? 'tool_calls' : 'stop',
          })
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      logger.errors('zai stream ended with error', {
        error,
        source: 'zai.processZAIStreamChunks',
      })
      yield asChunk({
        type: 'RUN_ERROR',
        runId,
        threadId,
        message: err.message || 'Unknown error occurred',
        code: err.code,
        model: options.model,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code,
        },
      })
    }
  }

  private convertContent(
    content: unknown,
    capabilities: { image: boolean; video: boolean },
  ): string | Array<OpenAI.Chat.Completions.ChatCompletionContentPart> {
    if (typeof content === 'string') return content
    if (!content) return ''

    if (Array.isArray(content)) {
      if (!capabilities.image && !capabilities.video) {
        return content
          .filter((p) => p && typeof p === 'object' && p.type === 'text')
          .map((p) => String(p.content ?? ''))
          .join('')
      }

      const parts: Array<OpenAI.Chat.Completions.ChatCompletionContentPart> = []

      for (const part of content) {
        if (!part || typeof part !== 'object') continue

        if (part.type === 'text') {
          parts.push({ type: 'text', text: part.content ?? '' })
        } else if (part.type === 'image' && capabilities.image) {
          parts.push({
            type: 'image_url',
            image_url: { url: part.source.value },
          })
        } else if (part.type === 'video' && capabilities.video) {
          parts.push({
            type: 'video_url',
            video_url: { url: part.source.value },
          } as any)
        }
      }

      if (parts.length === 0) return ''
      return parts
    }

    return ''
  }

  private getRequestHeaders(
    options: TextOptions,
  ): Record<string, string> | undefined {
    const request = options.request
    const userHeaders =
      request instanceof Request
        ? Object.fromEntries(request.headers.entries())
        : request?.headers

    if (!userHeaders) return undefined

    if (Array.isArray(userHeaders)) {
      return Object.fromEntries(userHeaders)
    }

    if (userHeaders instanceof Headers) {
      return Object.fromEntries(userHeaders.entries())
    }

    return userHeaders
  }

  private getAbortSignal(options: TextOptions): AbortSignal | undefined {
    if (options.abortController?.signal) return options.abortController.signal

    const request = options.request
    if (request && request instanceof Request) return request.signal

    return request?.signal ?? undefined
  }
}
