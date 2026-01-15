import { BaseTextAdapter } from '@tanstack/ai/adapters'
import type OpenAI from 'openai'
import type { ModelMessage, StreamChunk, TextOptions } from '@tanstack/ai'
import type { ZAIMessageMetadataByModality } from '../message-types'
import { createZAIClient } from '../utils/client'
import { convertToolsToZAIFormat, mapZAIErrorToStreamChunk } from '../utils/conversion'

/**
 * Z.AI uses an OpenAI-compatible API surface.
 * This adapter targets the Chat Completions streaming interface.
 */

export interface ZAITextAdapterConfig {
  /**
   * Z.AI Bearer token.
   * This becomes the Authorization header via the OpenAI SDK.
   */
  apiKey: string

  /**
   * Optional override for the Z.AI base URL.
   * Defaults to https://api.z.ai/api/paas/v4
   */
  baseURL?: string
}

type ZAIChatCompletionParams =
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming

/**
 * Z.AI Text Adapter
 *
 * - Streams text deltas as `StreamChunk { type: 'content' }`
 * - Streams tool calls (if any) as `StreamChunk { type: 'tool_call' }`
 * - Ends with `StreamChunk { type: 'done' }` with `finishReason`
 * - On any failure, yields a single `StreamChunk { type: 'error' }` and stops
 */
export class ZAITextAdapter<TModel extends string> extends BaseTextAdapter<
  TModel,
  Record<string, any>,
  readonly ['text'],
  ZAIMessageMetadataByModality
> {
  readonly name = 'zai' as const

  private client: OpenAI

  /**
   * Create a new Z.AI text adapter instance.
   *
   * @param config OpenAI SDK config with Z.AI baseURL + apiKey
   * @param model Provider model name (e.g. "glm-4.7")
   */
  constructor(config: ZAITextAdapterConfig, model: TModel) {
    super({}, model)

    this.client = createZAIClient(config.apiKey, {
      baseURL: config.baseURL,
    })
  }

  /**
   * Stream chat completions from Z.AI.
   *
   * Important behavior:
   * - Emits error chunks instead of throwing
   * - Accumulates text deltas into the `content` field
   * - Accumulates tool call argument deltas and emits completed tool calls
   */
  async *chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToZAI(options)

    const timestamp = Date.now()
    const fallbackId = this.generateId()

    try {
      const stream = await this.client.chat.completions.create(
        requestParams,
        {
          headers: this.getRequestHeaders(options),
          signal: this.getAbortSignal(options),
        },
      )

      yield* this.processZAIStreamChunks(stream, options, fallbackId, timestamp)
    } catch (error: unknown) {
      const chunk = mapZAIErrorToStreamChunk(error) as any
      chunk.id = fallbackId
      chunk.model = options.model
      chunk.timestamp = timestamp
      yield chunk as StreamChunk
    }
  }

  /**
   * Structured output is not implemented for the Z.AI adapter yet.
   * The Z.AI API is OpenAI-compatible, so this can be added later using
   * `response_format: { type: 'json_schema', ... }` if supported.
   */
  async structuredOutput(): Promise<{ data: unknown; rawText: string }> {
    throw new Error('ZAITextAdapter.structuredOutput is not implemented')
  }

  /**
   * Convert universal TanStack `TextOptions` into OpenAI-compatible
   * Chat Completions request params for Z.AI.
   */
  private mapTextOptionsToZAI(options: TextOptions): ZAIChatCompletionParams {
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

  /**
   * Convert TanStack `ModelMessage[]` into OpenAI SDK `messages[]`.
   *
   * Notes:
   * - TanStack `systemPrompts` are applied as a single leading system message
   * - Assistant tool calls are translated to `tool_calls`
   * - Tool results are translated to `role: 'tool'` messages
   */
  private convertMessagesToInput(
    messages: Array<ModelMessage>,
    options: Pick<TextOptions, 'systemPrompts'>,
  ): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
    const result: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = []

    if (options.systemPrompts?.length) {
      result.push({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    for (const message of messages) {
      if (message.role === 'tool') {
        result.push({
          role: 'tool',
          tool_call_id: message.toolCallId || '',
          content:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
        })
        continue
      }

      if (message.role === 'assistant') {
        const toolCalls = message.toolCalls?.map((tc: NonNullable<ModelMessage['toolCalls']>[number]) => ({
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

        result.push({
          role: 'assistant',
          content: this.extractTextContent(message.content),
          ...(toolCalls && toolCalls.length ? { tool_calls: toolCalls } : {}),
        })
        continue
      }

      result.push({
        role: 'user',
        content: this.extractTextContent(message.content),
      })
    }

    return result
  }

  /**
   * Consume Z.AI's streaming Chat Completions response and yield TanStack stream chunks.
   *
   * Key details:
   * - `content` chunks include both the delta and the full accumulated content so far
   * - `tool_call` chunks are emitted when the provider indicates the tool-call turn is complete
   * - The final `done` chunk marks the finish reason so the TanStack agent loop can proceed
   * - Any unexpected exception while iterating yields an `error` chunk and stops
   */
  private async *processZAIStreamChunks(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    options: TextOptions,
    fallbackId: string,
    timestamp: number,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let responseId = fallbackId
    let responseModel = options.model

    const toolCallsInProgress = new Map<
      number,
      { id: string; name: string; arguments: string }
    >()

    try {
      for await (const chunk of stream) {
        responseId = chunk.id || responseId
        responseModel = chunk.model || responseModel

        const choice = chunk.choices?.[0]
        if (!choice) continue

        const delta = choice.delta
        const deltaContent = delta?.content
        const deltaToolCalls = delta?.tool_calls

        if (typeof deltaContent === 'string' && deltaContent.length) {
          accumulatedContent += deltaContent
          yield {
            type: 'content',
            id: responseId,
            model: responseModel,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
            role: 'assistant',
          }
        }

        if (deltaToolCalls?.length) {
          for (const toolCallDelta of deltaToolCalls) {
            const index = toolCallDelta.index

            if (!toolCallsInProgress.has(index)) {
              toolCallsInProgress.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: '',
              })
            }

            const current = toolCallsInProgress.get(index)!

            if (toolCallDelta.id) current.id = toolCallDelta.id
            if (toolCallDelta.function?.name) current.name = toolCallDelta.function.name
            if (toolCallDelta.function?.arguments) {
              current.arguments += toolCallDelta.function.arguments
            }
          }
        }

        if (choice.finish_reason) {
          const isToolTurn =
            choice.finish_reason === 'tool_calls' || toolCallsInProgress.size > 0

          if (isToolTurn) {
            for (const [index, toolCall] of toolCallsInProgress) {
              yield {
                type: 'tool_call',
                id: responseId,
                model: responseModel,
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
            model: responseModel,
            timestamp,
            finishReason: isToolTurn ? 'tool_calls' : 'stop',
            usage: chunk.usage
              ? {
                  promptTokens: chunk.usage.prompt_tokens || 0,
                  completionTokens: chunk.usage.completion_tokens || 0,
                  totalTokens: chunk.usage.total_tokens || 0,
                }
              : undefined,
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      yield {
        type: 'error',
        id: responseId,
        model: responseModel,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code,
        },
      }
    }
  }

  /**
   * Extract a plain string from TanStack message content.
   * The core types allow either `string | null | ContentPart[]`.
   */
  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (!content) return ''

    if (Array.isArray(content)) {
      return content
        .filter((p) => p && typeof p === 'object' && (p as any).type === 'text')
        .map((p) => String((p as any).content ?? ''))
        .join('')
    }

    return ''
  }

  private getRequestHeaders(
    options: TextOptions,
  ): Record<string, string> | undefined {
    const request = options.request
    const userHeaders =
      request && request instanceof Request
        ? Object.fromEntries(request.headers.entries())
        : (request as RequestInit | undefined)?.headers

    if (!userHeaders) return undefined

    if (Array.isArray(userHeaders)) {
      return Object.fromEntries(userHeaders)
    }

    if (userHeaders instanceof Headers) {
      return Object.fromEntries(userHeaders.entries())
    }

    return userHeaders as Record<string, string>
  }

  /**
   * Resolve the abort signal from either:
   * - `options.abortController` (preferred for TanStack AI callers), or
   * - `options.request.signal` (when passed through from fetch semantics)
   */
  private getAbortSignal(options: TextOptions): AbortSignal | undefined {
    if (options.abortController?.signal) return options.abortController.signal

    const request = options.request
    if (request && request instanceof Request) return request.signal

    const init = request as RequestInit | undefined
    return init?.signal ?? undefined
  }
}
