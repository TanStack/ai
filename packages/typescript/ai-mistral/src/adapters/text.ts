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
  MISTRAL_CHAT_MODELS,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { Mistral } from '@mistralai/mistralai'
import type {
  ContentPart,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { InternalTextProviderOptions } from '../text/text-provider-options'
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  MistralImageMetadata,
  MistralMessageMetadataByModality,
} from '../message-types'
import type { MistralClientConfig } from '../utils'

function messagesToSnakeCase(messages: ChatCompletionMessageParam[]): unknown[] {
  return messages.map((msg) => {
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
  })
}

function rawChunkToCamelCase(raw: Record<string, unknown>): MistralStreamChunk {
  const rawChoices = (raw.choices as Array<Record<string, unknown>>) ?? []
  return {
    id: raw.id as string | undefined,
    model: raw.model as string | undefined,
    choices: rawChoices.map((choice) => {
      const delta = (choice.delta as Record<string, unknown>) ?? {}
      const rawToolCalls = delta.tool_calls as
        | Array<Record<string, unknown>>
        | undefined
      return {
        index: choice.index as number | undefined,
        delta: {
          role: delta.role as string | null | undefined,
          content: delta.content as
            | string
            | Array<{ type: string; text?: string }>
            | null
            | undefined,
          toolCalls: rawToolCalls?.map((tc) => ({
            id: tc.id as string | undefined,
            type: tc.type as string | undefined,
            index: tc.index as number | undefined,
            function: tc.function as {
              name?: string
              arguments?: string | Record<string, unknown>
            },
          })),
        },
        finishReason: (choice.finish_reason as string | null | undefined) ?? null,
      }
    }),
    usage: raw.usage
      ? (() => {
          const u = raw.usage as Record<string, unknown>
          return {
            promptTokens: (u.prompt_tokens as number | undefined) ?? 0,
            completionTokens: (u.completion_tokens as number | undefined) ?? 0,
            totalTokens: (u.total_tokens as number | undefined) ?? 0,
          }
        })()
      : undefined,
  }
}

interface RawStreamParams {
  model: string
  messages: ChatCompletionMessageParam[]
  temperature?: number | null
  maxTokens?: number | null
  topP?: number | null
  tools?: unknown
  stop?: unknown
  randomSeed?: number | null
  responseFormat?: unknown
  toolChoice?: unknown
  parallelToolCalls?: boolean | null
  frequencyPenalty?: number | null
  presencePenalty?: number | null
  n?: number | null
  prediction?: unknown
  safePrompt?: boolean | null
  stream?: true
  [key: string]: unknown
}

/**
 * Configuration for Mistral text adapter.
 */
export interface MistralTextConfig extends MistralClientConfig {}

/**
 * Alias for TextProviderOptions for external use.
 */
export type { ExternalTextProviderOptions as MistralTextProviderOptions } from '../text/text-provider-options'

/**
 * Minimal shape of a Mistral stream chunk used by the adapter.
 */
interface MistralStreamChunk {
  id?: string
  model?: string
  choices: Array<{
    index?: number
    delta: {
      role?: string | null
      content?: string | Array<{ type: string; text?: string }> | null
      toolCalls?: Array<{
        id?: string
        type?: string
        index?: number
        function: {
          name?: string
          arguments?: string | Record<string, unknown>
        }
      }> | null
    }
    finishReason?: string | null
  }>
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

interface MistralStreamEvent {
  data: MistralStreamChunk
}

/**
 * Mistral Text (Chat) Adapter.
 *
 * Tree-shakeable adapter for Mistral chat/text completion functionality.
 */
export class MistralTextAdapter<
  TModel extends (typeof MISTRAL_CHAT_MODELS)[number],
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  MistralMessageMetadataByModality
> {
  readonly name = 'mistral' as const

  private client: Mistral
  private rawConfig: MistralClientConfig

  constructor(config: MistralTextConfig, model: TModel) {
    super(config, model)
    this.client = createMistralClient(config)
    this.rawConfig = config
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToMistral(options)
    const timestamp = Date.now()

    const aguiState = {
      runId: generateId(this.name),
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
        yield {
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          model: options.model,
          timestamp,
        }
      }

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

      throw err
    }
  }

  /**
   * Generate structured output using Mistral's JSON Schema response format.
   */
  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapTextOptionsToMistral(chatOptions)

    const jsonSchema = makeMistralStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    const { stream: _stream, ...nonStreamParams } = requestParams
    const response = (await this.client.chat.complete({
      ...nonStreamParams,
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'structured_output',
          schemaDefinition: jsonSchema,
          strict: true,
        },
      },
    } as Parameters<typeof this.client.chat.complete>[0])) as {
      choices?: Array<{ message?: { content?: string | null } }>
    }

    const rawText = response.choices?.[0]?.message?.content || ''
    const textContent =
      typeof rawText === 'string' ? rawText : String(rawText)

    let parsed: unknown
    try {
      parsed = JSON.parse(textContent)
    } catch {
      throw new Error(
        `Failed to parse structured output as JSON. Content: ${textContent.slice(0, 200)}${textContent.length > 200 ? '...' : ''}`,
      )
    }

    const transformed = transformNullsToUndefined(parsed)

    return {
      data: transformed,
      rawText: textContent,
    }
  }

  /**
   * Processes streaming chunks from the Mistral API and yields AG-UI stream events.
   */
  private async *processMistralStreamChunks(
    stream: AsyncIterable<MistralStreamEvent>,
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
    let hasEmittedToolCall = false

    const toolCallsInProgress = new Map<
      number,
      {
        id: string
        name: string
        arguments: string
        started: boolean
      }
    >()

    try {
      for await (const event of stream) {
        const chunk = event.data
        const choice = chunk.choices[0]

        if (!choice) continue

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
        const deltaContent = this.extractDeltaText(delta.content)
        const deltaToolCalls = delta.toolCalls

        if (deltaContent) {
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

          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model: chunk.model || options.model,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          }
        }

        if (deltaToolCalls) {
          for (let i = 0; i < deltaToolCalls.length; i++) {
            const toolCallDelta = deltaToolCalls[i]!
            const index = toolCallDelta.index ?? i

            if (!toolCallsInProgress.has(index)) {
              toolCallsInProgress.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function.name || '',
                arguments: '',
                started: false,
              })
            }

            const toolCall = toolCallsInProgress.get(index)!

            if (toolCallDelta.id) {
              toolCall.id = toolCallDelta.id
            }
            if (toolCallDelta.function.name) {
              toolCall.name = toolCallDelta.function.name
            }
            const argsDelta =
              toolCallDelta.function.arguments !== undefined
                ? typeof toolCallDelta.function.arguments === 'string'
                  ? toolCallDelta.function.arguments
                  : JSON.stringify(toolCallDelta.function.arguments)
                : undefined

            if (argsDelta !== undefined) {
              toolCall.arguments += argsDelta
            }

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

            if (argsDelta !== undefined && toolCall.started) {
              yield {
                type: 'TOOL_CALL_ARGS',
                toolCallId: toolCall.id,
                model: chunk.model || options.model,
                timestamp,
                delta: argsDelta,
              }
            }
          }
        }

        if (choice.finishReason) {
          if (
            choice.finishReason === 'tool_calls' ||
            toolCallsInProgress.size > 0
          ) {
            for (const [, toolCall] of toolCallsInProgress) {
              if (!toolCall.started || !toolCall.id || !toolCall.name) {
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

              hasEmittedToolCall = true
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
            choice.finishReason === 'tool_calls' || hasEmittedToolCall
              ? 'tool_calls'
              : choice.finishReason === 'length'
                ? 'length'
                : 'stop'

          if (hasEmittedTextMessageStart) {
            yield {
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp,
            }
          }

          const usage = chunk.usage

          yield {
            type: 'RUN_FINISHED',
            runId: aguiState.runId,
            model: chunk.model || options.model,
            timestamp,
            usage: usage
              ? {
                  promptTokens: usage.promptTokens || 0,
                  completionTokens: usage.completionTokens || 0,
                  totalTokens: usage.totalTokens || 0,
                }
              : undefined,
            finishReason: computedFinishReason,
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }

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
   * Makes a raw fetch request to the Mistral chat completions endpoint and
   * parses the SSE stream manually, bypassing the SDK's Zod validation which
   * rejects streaming tool call chunks that omit `name` in argument deltas.
   */
  private async *fetchRawMistralStream(
    params: RawStreamParams,
    config: MistralClientConfig,
  ): AsyncGenerator<MistralStreamEvent> {
    const serverURL = (config.serverURL ?? 'https://api.mistral.ai').replace(
      /\/$/,
      '',
    )
    const url = `${serverURL}/v1/chat/completions`

    const {
      stream: _stream,
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
      ...rest
    } = params

    const body: Record<string, unknown> = {
      ...rest,
      messages: messagesToSnakeCase(messages),
      stream: true,
      ...(maxTokens != null && { max_tokens: maxTokens }),
      ...(topP != null && { top_p: topP }),
      ...(randomSeed != null && { random_seed: randomSeed }),
      ...(responseFormat != null && { response_format: responseFormat }),
      ...(toolChoice != null && { tool_choice: toolChoice }),
      ...(parallelToolCalls != null && {
        parallel_tool_calls: parallelToolCalls,
      }),
      ...(frequencyPenalty != null && {
        frequency_penalty: frequencyPenalty,
      }),
      ...(presencePenalty != null && {
        presence_penalty: presencePenalty,
      }),
      ...(safePrompt != null && { safe_prompt: safePrompt }),
    }

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

    if (!response.ok || !response.body) {
      const errorText = await response.text()
      throw new Error(`Mistral API error ${response.status}: ${errorText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
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
            const raw = JSON.parse(data) as Record<string, unknown>
            yield { data: rawChunkToCamelCase(raw) }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Extracts text from a Mistral delta content, which can be a string or an
   * array of content chunks.
   */
  private extractDeltaText(
    content: string | Array<{ type: string; text?: string }> | null | undefined,
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
  private mapTextOptionsToMistral(options: TextOptions) {
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
      messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      tools,
      stream: true as const,
      ...(modelOptions && {
        ...(modelOptions.stop !== undefined && { stop: modelOptions.stop }),
        ...(modelOptions.random_seed !== undefined && { randomSeed: modelOptions.random_seed }),
        ...(modelOptions.response_format !== undefined && { responseFormat: modelOptions.response_format }),
        ...(modelOptions.tool_choice !== undefined && { toolChoice: modelOptions.tool_choice }),
        ...(modelOptions.parallel_tool_calls !== undefined && { parallelToolCalls: modelOptions.parallel_tool_calls }),
        ...(modelOptions.frequency_penalty !== undefined && { frequencyPenalty: modelOptions.frequency_penalty }),
        ...(modelOptions.presence_penalty !== undefined && { presencePenalty: modelOptions.presence_penalty }),
        ...(modelOptions.n !== undefined && { n: modelOptions.n }),
        ...(modelOptions.prediction !== undefined && { prediction: modelOptions.prediction }),
        ...(modelOptions.safe_prompt !== undefined && { safePrompt: modelOptions.safe_prompt }),
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
      return {
        role: 'tool',
        toolCallId: message.toolCallId || '',
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
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.content })
      } else if (part.type === 'image') {
        const imageMetadata = part.metadata as MistralImageMetadata | undefined
        const imageValue = part.source.value
        const imageUrl =
          part.source.type === 'data' && !imageValue.startsWith('data:')
            ? `data:${part.source.mimeType};base64,${imageValue}`
            : imageValue
        parts.push({
          type: 'image_url',
          imageUrl: imageMetadata?.detail
            ? { url: imageUrl, detail: imageMetadata.detail }
            : imageUrl,
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
