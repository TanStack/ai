import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { convertToolsToProviderFormat } from '../tools'
import {
  createMistralClient,
  generateId,
  getMistralApiKeyFromEnv,
  makeMistralStructuredOutputCompatible,
  transformNullsToUndefined,
} from '../utils'
import type {
  ContentPart,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type {
  MISTRAL_CHAT_MODELS,
  MistralChatModelProviderOptionsByName,
  MistralModelInputModalitiesByName,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { Mistral } from '@mistralai/mistralai'
import type { ChatCompletionStreamRequest } from '@mistralai/mistralai/models/components'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  MistralImageMetadata,
  MistralMessageMetadataByModality,
} from '../message-types'
import type { MistralClientConfig } from '../utils'

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

/**
 * Configuration for Mistral text adapter.
 */
export interface MistralTextConfig extends MistralClientConfig {}

/**
 * Alias for TextProviderOptions for external use.
 */
export type MistralTextProviderOptions = ExternalTextProviderOptions

// ===========================
// Type Resolution Helpers
// ===========================

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof MistralChatModelProviderOptionsByName
    ? MistralChatModelProviderOptionsByName[TModel]
    : MistralTextProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof MistralModelInputModalitiesByName
    ? MistralModelInputModalitiesByName[TModel]
    : readonly ['text']

// ===========================
// Wire-format chunk types
// ===========================

/**
 * Snake-case shape of a Mistral chat completion stream chunk as returned on the
 * wire. We bypass the SDK's `chat.stream` because its Zod validation rejects
 * tool-call argument deltas that omit `function.name` (only the first chunk in
 * a tool call carries the name).
 */
interface MistralRawToolCall {
  id?: string
  type?: string
  index?: number
  function?: {
    name?: string
    arguments?: string | Record<string, unknown>
  }
}

interface MistralRawChoice {
  index?: number
  delta?: {
    role?: string | null
    content?: string | Array<{ type: string; text?: string }> | null
    tool_calls?: Array<MistralRawToolCall>
  }
  finish_reason?: string | null
}

interface MistralRawChunk {
  id?: string
  model?: string
  choices?: Array<MistralRawChoice>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

// ===========================
// Adapter Implementation
// ===========================

/**
 * Mistral Text (Chat) Adapter.
 *
 * Tree-shakeable adapter for Mistral chat/text completion functionality.
 */
export class MistralTextAdapter<
  TModel extends (typeof MISTRAL_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends
    ReadonlyArray<Modality> = ResolveInputModalities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  MistralMessageMetadataByModality
> {
  readonly name = 'mistral' as const

  private client: Mistral
  private rawConfig: MistralClientConfig

  constructor(config: MistralTextConfig, model: TModel) {
    super(config, model)
    // The SDK client is retained for `structuredOutput` (non-streaming). The
    // streaming path bypasses the SDK and uses `fetchRawMistralStream` because
    // the SDK's Zod schemas reject partial tool-call argument deltas.
    this.client = createMistralClient(config)
    this.rawConfig = config
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToMistral(options)
    const timestamp = Date.now()

    const aguiState = {
      runId: options.runId ?? generateId(this.name),
      threadId: options.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    try {
      const stream = this.fetchRawMistralStream(requestParams, this.rawConfig)
      yield* this.processMistralStreamChunks(stream, options, aguiState)
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

      throw err
    }
  }

  /**
   * Generate structured output using Mistral's JSON Schema response format.
   */
  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { stream: _stream, ...nonStreamParams } =
      this.mapTextOptionsToMistral(chatOptions)

    const jsonSchema = makeMistralStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    const response = await this.client.chat.complete({
      ...nonStreamParams,
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'structured_output',
          schemaDefinition: jsonSchema,
          strict: true,
        },
      },
    })

    const rawText = response.choices[0]?.message?.content
    const textContent = typeof rawText === 'string' ? rawText : ''

    let parsed: unknown
    try {
      parsed = JSON.parse(textContent)
    } catch {
      throw new Error(
        `Failed to parse structured output as JSON. Content: ${textContent.slice(0, 200)}${textContent.length > 200 ? '...' : ''}`,
      )
    }

    return {
      data: transformNullsToUndefined(parsed),
      rawText: textContent,
    }
  }

  /**
   * Processes streaming chunks from the Mistral API and yields AG-UI stream events.
   */
  private async *processMistralStreamChunks(
    stream: AsyncIterable<MistralRawChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      timestamp: number
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    const timestamp = aguiState.timestamp
    let hasEmittedTextMessageStart = false
    let hasEmittedToolCall = false

    const toolCallsInProgress = new Map<
      number,
      {
        id: string
        name: string
        arguments: string
        started: boolean
        ended: boolean
      }
    >()

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0]
        if (!choice) continue

        const chunkModel = chunk.model || options.model

        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield asChunk({
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model: chunkModel,
            timestamp,
          })
        }

        const delta = choice.delta
        const deltaContent = this.extractDeltaText(delta?.content)
        const deltaToolCalls = delta?.tool_calls

        if (deltaContent) {
          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield asChunk({
              type: 'TEXT_MESSAGE_START',
              messageId: aguiState.messageId,
              model: chunkModel,
              timestamp,
              role: 'assistant',
            })
          }

          accumulatedContent += deltaContent

          yield asChunk({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model: chunkModel,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          })
        }

        if (deltaToolCalls) {
          for (let i = 0; i < deltaToolCalls.length; i++) {
            const toolCallDelta = deltaToolCalls[i]!
            const index = toolCallDelta.index ?? i

            if (!toolCallsInProgress.has(index)) {
              toolCallsInProgress.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: '',
                started: false,
                ended: false,
              })
            }

            const toolCall = toolCallsInProgress.get(index)!

            if (toolCallDelta.id) toolCall.id = toolCallDelta.id
            if (toolCallDelta.function?.name) {
              toolCall.name = toolCallDelta.function.name
            }

            const rawArgs = toolCallDelta.function?.arguments
            const argsDelta =
              rawArgs === undefined
                ? undefined
                : typeof rawArgs === 'string'
                  ? rawArgs
                  : JSON.stringify(rawArgs)

            if (argsDelta !== undefined) {
              toolCall.arguments += argsDelta
            }

            if (toolCall.id && toolCall.name && !toolCall.started) {
              toolCall.started = true
              yield asChunk({
                type: 'TOOL_CALL_START',
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: chunkModel,
                timestamp,
                index,
              })
            }

            if (argsDelta !== undefined && toolCall.started) {
              yield asChunk({
                type: 'TOOL_CALL_ARGS',
                toolCallId: toolCall.id,
                model: chunkModel,
                timestamp,
                delta: argsDelta,
              })
            }
          }
        }

        const finishReason = choice.finish_reason
        if (finishReason) {
          if (finishReason === 'tool_calls' || toolCallsInProgress.size > 0) {
            for (const [, toolCall] of toolCallsInProgress) {
              if (
                !toolCall.started ||
                !toolCall.id ||
                !toolCall.name ||
                toolCall.ended
              ) {
                continue
              }

              let parsedInput: unknown = {}
              try {
                parsedInput = toolCall.arguments
                  ? JSON.parse(toolCall.arguments)
                  : {}
              } catch {
                parsedInput = {}
              }

              toolCall.ended = true
              hasEmittedToolCall = true
              yield asChunk({
                type: 'TOOL_CALL_END',
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: chunkModel,
                timestamp,
                input: parsedInput,
              })
            }
          }

          const computedFinishReason =
            finishReason === 'tool_calls' || hasEmittedToolCall
              ? 'tool_calls'
              : finishReason === 'length'
                ? 'length'
                : 'stop'

          if (hasEmittedTextMessageStart) {
            yield asChunk({
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: chunkModel,
              timestamp,
            })
          }

          const usage = chunk.usage
          yield asChunk({
            type: 'RUN_FINISHED',
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model: chunkModel,
            timestamp,
            usage: usage
              ? {
                  promptTokens: usage.prompt_tokens || 0,
                  completionTokens: usage.completion_tokens || 0,
                  totalTokens: usage.total_tokens || 0,
                }
              : undefined,
            finishReason: computedFinishReason,
          })
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }

      yield asChunk({
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        message: err.message || 'Unknown error occurred',
        code: err.code,
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code,
        },
      })
      throw err
    }
  }

  /**
   * Makes a raw fetch request to the Mistral chat completions endpoint and
   * parses the SSE stream manually, bypassing the SDK's Zod validation which
   * rejects streaming tool call chunks that omit `name` in argument deltas.
   */
  private async *fetchRawMistralStream(
    params: ChatCompletionStreamRequest,
    config: MistralClientConfig,
  ): AsyncGenerator<MistralRawChunk> {
    const serverURL = (config.serverURL ?? 'https://api.mistral.ai')
      .replace(/\/+$/, '')
      .replace(/\/v1$/, '')
    const url = `${serverURL}/v1/chat/completions`

    const body = this.toWireBody(params)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...config.defaultHeaders,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Mistral API error ${response.status}: ${errorText}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trimStart()
          if (data === '[DONE]') return

          try {
            yield JSON.parse(data) as MistralRawChunk
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }

  /**
   * Converts the SDK's camelCase `ChatCompletionStreamRequest` into the
   * snake_case wire body, including converting messages.
   */
  private toWireBody(
    params: ChatCompletionStreamRequest,
  ): Record<string, unknown> {
    const {
      messages,
      maxTokens,
      topP,
      randomSeed,
      responseFormat,
      toolChoice,
      parallelToolCalls,
      frequencyPenalty,
      presencePenalty,
      safePrompt,
      stream: _stream,
      ...rest
    } = params

    return {
      ...rest,
      messages: messages.map(messageToWire),
      stream: true,
      ...(maxTokens != null && { max_tokens: maxTokens }),
      ...(topP != null && { top_p: topP }),
      ...(randomSeed != null && { random_seed: randomSeed }),
      ...(responseFormat != null && { response_format: responseFormat }),
      ...(toolChoice != null && { tool_choice: toolChoice }),
      ...(parallelToolCalls != null && {
        parallel_tool_calls: parallelToolCalls,
      }),
      ...(frequencyPenalty != null && { frequency_penalty: frequencyPenalty }),
      ...(presencePenalty != null && { presence_penalty: presencePenalty }),
      ...(safePrompt != null && { safe_prompt: safePrompt }),
    }
  }

  /**
   * Extracts text from a Mistral delta content, which can be a string or an
   * array of content chunks.
   */
  private extractDeltaText(
    content:
      | string
      | Array<{ type: string; text?: string }>
      | null
      | undefined,
  ): string {
    if (!content) return ''
    if (typeof content === 'string') return content
    return content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text!)
      .join('')
  }

  /**
   * Maps common TextOptions to Mistral Chat Completions request parameters.
   */
  private mapTextOptionsToMistral(
    options: TextOptions<TProviderOptions>,
  ): ChatCompletionStreamRequest {
    const modelOptions = options.modelOptions as
      | Omit<
          InternalTextProviderOptions,
          'max_tokens' | 'tools' | 'temperature' | 'top_p'
        >
      | undefined

    if (modelOptions) {
      validateTextProviderOptions({
        ...modelOptions,
        model: options.model,
      } as InternalTextProviderOptions)
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
      messages.push(this.convertMessageToMistral(message))
    }

    return {
      model: options.model,
      messages: messages as ChatCompletionStreamRequest['messages'],
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP ?? undefined,
      tools: tools as ChatCompletionStreamRequest['tools'],
      stream: true,
      ...(modelOptions && {
        ...(modelOptions.stop != null && { stop: modelOptions.stop }),
        ...(modelOptions.random_seed != null && {
          randomSeed: modelOptions.random_seed,
        }),
        ...(modelOptions.response_format != null && {
          responseFormat:
            modelOptions.response_format as ChatCompletionStreamRequest['responseFormat'],
        }),
        ...(modelOptions.tool_choice != null && {
          toolChoice:
            modelOptions.tool_choice as ChatCompletionStreamRequest['toolChoice'],
        }),
        ...(modelOptions.parallel_tool_calls != null && {
          parallelToolCalls: modelOptions.parallel_tool_calls,
        }),
        ...(modelOptions.frequency_penalty != null && {
          frequencyPenalty: modelOptions.frequency_penalty,
        }),
        ...(modelOptions.presence_penalty != null && {
          presencePenalty: modelOptions.presence_penalty,
        }),
        ...(modelOptions.n != null && { n: modelOptions.n }),
        ...(modelOptions.prediction != null && {
          prediction: modelOptions.prediction,
        }),
        ...(modelOptions.safe_prompt != null && {
          safePrompt: modelOptions.safe_prompt,
        }),
      }),
    }
  }

  /**
   * Converts a TanStack AI ModelMessage to a Mistral ChatCompletionMessageParam.
   */
  private convertMessageToMistral(
    message: ModelMessage,
  ): ChatCompletionMessageParam {
    if (message.role === 'tool') {
      if (!message.toolCallId) {
        throw new Error('Missing toolCallId for tool message')
      }
      return {
        role: 'tool',
        toolCallId: message.toolCallId,
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
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      }
    }

    const contentParts = this.normalizeContent(message.content)

    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
      return {
        role: 'user',
        content: contentParts[0].content,
      }
    }

    const parts: Array<ChatCompletionContentPart> = []
    for (const part of contentParts) {
      const converted = this.convertContentPartToMistral(part)
      if (converted) parts.push(converted)
    }

    return {
      role: 'user',
      content: parts.length > 0 ? parts : '',
    }
  }

  /**
   * Converts a ContentPart to a Mistral content part. Returns undefined for
   * unsupported part types.
   */
  private convertContentPartToMistral(
    part: ContentPart,
  ): ChatCompletionContentPart | undefined {
    if (part.type === 'text') {
      return { type: 'text', text: part.content }
    }

    if (part.type === 'image') {
      const imageMetadata = part.metadata as MistralImageMetadata | undefined
      const imageValue = part.source.value
      const imageUrl =
        part.source.type === 'data' && !imageValue.startsWith('data:')
          ? `data:${part.source.mimeType};base64,${imageValue}`
          : imageValue
      return {
        type: 'image_url',
        imageUrl: imageMetadata?.detail
          ? { url: imageUrl, detail: imageMetadata.detail }
          : imageUrl,
      }
    }

    return undefined
  }

  /**
   * Normalizes message content to an array of ContentPart.
   */
  private normalizeContent(
    content: string | null | Array<ContentPart>,
  ): Array<ContentPart> {
    if (content === null) return []
    if (typeof content === 'string') return [{ type: 'text', content }]
    return content
  }

  /**
   * Extracts text content from a content value that may be string, null, or ContentPart array.
   */
  private extractTextContent(
    content: string | null | Array<ContentPart>,
  ): string {
    if (content === null) return ''
    if (typeof content === 'string') return content
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}

/**
 * Snake-cases a Mistral SDK message into the wire format expected by the API.
 */
function messageToWire(msg: ChatCompletionStreamRequest['messages'][number]) {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: msg.toolCallId,
      content: msg.content,
      ...(msg.name !== undefined ? { name: msg.name } : {}),
    }
  }
  if (msg.role === 'assistant') {
    const base: Record<string, unknown> = {
      role: 'assistant',
      content: msg.content ?? null,
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      base.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type ?? 'function',
        function: tc.function,
      }))
    }
    if (msg.prefix !== undefined) base.prefix = msg.prefix
    return base
  }
  if (msg.role === 'user' && Array.isArray(msg.content)) {
    return {
      role: 'user',
      content: msg.content.map((part) => {
        if (part.type === 'image_url') {
          return { type: 'image_url', image_url: part.imageUrl }
        }
        if (part.type === 'document_url') {
          return { type: 'document_url', document_url: part.documentUrl }
        }
        return part
      }),
    }
  }
  return msg
}

/**
 * Creates a Mistral text adapter with explicit API key.
 *
 * @param model - The model name (e.g., 'mistral-large-latest')
 * @param apiKey - Your Mistral API key
 * @param config - Optional additional configuration
 * @returns Configured Mistral text adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createMistralText('mistral-large-latest', 'api_key');
 * ```
 */
export function createMistralText<
  TModel extends (typeof MISTRAL_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<MistralTextConfig, 'apiKey'>,
): MistralTextAdapter<TModel> {
  return new MistralTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Mistral text adapter using the `MISTRAL_API_KEY` environment variable.
 *
 * @param model - The model name (e.g., 'mistral-large-latest')
 * @param config - Optional configuration (excluding apiKey)
 * @returns Configured Mistral text adapter instance
 * @throws Error if MISTRAL_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * const adapter = mistralText('mistral-large-latest');
 * ```
 */
export function mistralText<
  TModel extends (typeof MISTRAL_CHAT_MODELS)[number],
>(
  model: TModel,
  config?: Omit<MistralTextConfig, 'apiKey'>,
): MistralTextAdapter<TModel> {
  const apiKey = getMistralApiKeyFromEnv()
  return createMistralText(model, apiKey, config)
}
