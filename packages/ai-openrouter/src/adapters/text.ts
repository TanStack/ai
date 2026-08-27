import { OpenRouter } from '@openrouter/sdk'
import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { extractRequestOptions } from '../internal/request-options'
import { makeStructuredOutputCompatible } from '../internal/schema-converter'
import { openRouterSupportsCombinedToolsAndSchema } from '../internal/combined-tools-and-schema'
import { convertToolsToProviderFormat } from '../tools'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import { buildOpenRouterUsage } from '../usage'
import { extractUsageCost } from './cost'
import {
  consumeChatStructuredChunk,
  emitChatStructuredStreamError,
  finishChatStructuredStream,
  processChatStreamChunks,
} from './text-stream'
import type { ChatStructuredStreamState } from './text-stream'
import type { SDKOptions } from '@openrouter/sdk'
import type {
  ChatContentItems,
  ChatContentText,
  ChatMessages,
  ChatRequest,
  ChatStreamChunk,
} from '@openrouter/sdk/models'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  ContentPart,
  JSONSchema,
  ModelMessage,
  AdapterYieldChunk,
  TextOptions,
} from '@tanstack/ai'
import type {
  OPENROUTER_CHAT_MODELS,
  OpenRouterChatModelToolCapabilitiesByName,
  OpenRouterModelInputModalitiesByName,
  OpenRouterModelOptionsByName,
} from '../model-meta'
import type {
  ExternalTextProviderOptions,
  OpenRouterSystemPromptMetadata,
  ReasoningOptions,
} from '../text/text-provider-options'
import type {
  OpenRouterImageMetadata,
  OpenRouterMessageMetadataByModality,
} from '../message-types'

export interface OpenRouterConfig extends SDKOptions {}
export type OpenRouterTextModels = (typeof OPENROUTER_CHAT_MODELS)[number]

export type OpenRouterTextModelOptions = ExternalTextProviderOptions

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OpenRouterModelOptionsByName
    ? OpenRouterModelOptionsByName[TModel]
    : OpenRouterTextModelOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenRouterModelInputModalitiesByName
    ? OpenRouterModelInputModalitiesByName[TModel]
    : readonly ['text', 'image']

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof OpenRouterChatModelToolCapabilitiesByName
    ? NonNullable<OpenRouterChatModelToolCapabilitiesByName[TModel]>
    : readonly []

function normalizeReasoningOptions(
  reasoning: ReasoningOptions | undefined,
): ChatRequest['reasoning'] | undefined {
  if (!reasoning) return undefined

  const { enabled, ...sdkReasoning } = reasoning
  const normalized =
    enabled === false
      ? { ...sdkReasoning, effort: 'none' as const }
      : sdkReasoning

  return Object.values(normalized).some((value) => value !== undefined)
    ? normalized
    : undefined
}

export class OpenRouterTextAdapter<
  TModel extends OpenRouterTextModels,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  OpenRouterMessageMetadataByModality,
  TToolCapabilities,
  // TToolCallMetadata — OpenRouter has no tool-call metadata round-tripping.
  unknown,
  // TSystemPromptMetadata — narrows `systemPrompts[i].metadata` at the chat()
  // call site so users get `cache_control` autocomplete.
  OpenRouterSystemPromptMetadata
> {
  override readonly kind = 'text' as const
  readonly name = 'openrouter' as const

  protected orClient: OpenRouter

  constructor(config: OpenRouterConfig, model: TModel) {
    super({}, model)
    this.orClient = new OpenRouter(config)
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<AdapterYieldChunk> {
    // AG-UI lifecycle tracking (mutable state object for ESLint compatibility)
    const aguiState = {
      runId: generateId(this.name),
      threadId: options.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      hasEmittedRunStarted: false,
    }

    try {
      const chatRequest = this.mapOptionsToRequest(options)
      options.logger.request(
        `activity=chat provider=${this.name} model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: this.name, model: this.model },
      )
      const reqOptions = extractRequestOptions(options.request)
      const stream = await this.orClient.chat.send(
        {
          chatRequest: {
            ...chatRequest,
            stream: true,
            streamOptions: {
              ...(chatRequest.streamOptions ?? {}),
              includeUsage: true,
            },
          },
        },
        {
          ...(reqOptions.signal != null && { signal: reqOptions.signal }),
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
      )

      yield* this.processStreamChunks(stream, options, aguiState)
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      const errorPayload = toRunErrorPayload(
        error,
        `${this.name}.chatStream failed`,
      )
      const rawEvent = toRunErrorRawEvent(error)

      // Emit RUN_STARTED if not yet emitted
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: options.model,
          timestamp: Date.now(),
          parentRunId: options.parentRunId,
        }
      }

      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        code: errorPayload.code,
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: errorPayload.message,
          code: errorPayload.code,
        },
      }

      options.logger.errors(`${this.name}.chatStream fatal`, {
        error: errorPayload,
        source: `${this.name}.chatStream`,
      })
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const chatRequest = this.mapOptionsToRequest(chatOptions)
    const responseFormat = this.resolveStructuredResponseFormat(
      chatRequest.responseFormat,
      outputSchema,
    )

    try {
      const {
        streamOptions: _streamOptions,
        responseFormat: _responseFormat,
        ...cleanParams
      } = chatRequest
      void _streamOptions
      void _responseFormat
      chatOptions.logger.request(
        `activity=structuredOutput provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      const reqOptions = extractRequestOptions(chatOptions.request)
      const response = await this.orClient.chat.send(
        {
          chatRequest: {
            ...cleanParams,
            stream: false,
            responseFormat,
          },
        },
        {
          ...(reqOptions.signal != null && { signal: reqOptions.signal }),
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
      )

      const message = response.choices[0]?.message
      const rawText =
        typeof message?.content === 'string' ? message.content : ''
      if (rawText.length === 0) {
        throw new Error(
          `${this.name}.structuredOutput: response contained no content`,
        )
      }

      // Parse the JSON response
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      const transformed = this.transformStructuredOutput(parsed)

      const baseUsage = buildOpenRouterUsage(response.usage)
      return {
        data: transformed,
        rawText,
        ...(baseUsage && {
          usage: { ...baseUsage, ...extractUsageCost(response.usage) },
        }),
      }
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      chatOptions.logger.errors(`${this.name}.structuredOutput fatal`, {
        error: toRunErrorPayload(error, `${this.name}.structuredOutput failed`),
        source: `${this.name}.structuredOutput`,
      })
      throw error
    }
  }

  async *structuredOutputStream(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { chatOptions, outputSchema } = options
    const chatRequest = this.mapOptionsToRequest(chatOptions)
    const responseFormat = this.resolveStructuredResponseFormat(
      chatRequest.responseFormat,
      outputSchema,
    )

    const aguiState = {
      runId: generateId(this.name),
      threadId: chatOptions.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      hasEmittedRunStarted: false,
    }

    const state: ChatStructuredStreamState = {
      adapterName: this.name,
      accumulatedContent: '',
      accumulatedReasoning: '',
      hasEmittedTextMessageStart: false,
      reasoningMessageId: undefined,
      hasClosedReasoning: false,
      stepId: undefined,
      lastModel: undefined,
      lastUsage: undefined,
    }

    try {
      const {
        streamOptions: _so,
        tools: _t,
        responseFormat: _responseFormat,
        ...cleanParams
      } = chatRequest
      void _so
      void _t
      void _responseFormat

      chatOptions.logger.request(
        `activity=structuredOutputStream provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )

      const reqOptions = extractRequestOptions(chatOptions.request)
      const stream = await this.orClient.chat.send(
        {
          chatRequest: {
            ...cleanParams,
            stream: true,
            streamOptions: { includeUsage: true },
            responseFormat,
          },
        },
        {
          ...(reqOptions.signal != null && { signal: reqOptions.signal }),
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
      )

      for await (const chunk of stream) {
        yield* consumeChatStructuredChunk(chunk, chatOptions, aguiState, state)
      }

      yield* finishChatStructuredStream(
        chatOptions,
        aguiState,
        state,
        (parsed) => this.transformStructuredOutput(parsed),
      )
    } catch (error: unknown) {
      yield* emitChatStructuredStreamError(error, chatOptions, aguiState, state)
    }
  }

  protected resolveStructuredResponseFormat(
    requested: ChatRequest['responseFormat'],
    outputSchema: JSONSchema,
  ): NonNullable<ChatRequest['responseFormat']> {
    if (requested?.type === 'json_object') {
      return { type: 'json_object' }
    }

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    return {
      type: 'json_schema',
      jsonSchema: {
        name: 'structured_output',
        schema: jsonSchema,
        strict: true,
      },
    }
  }

  protected makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): Record<string, any> {
    return makeStructuredOutputCompatible(schema, originalRequired)
  }

  protected transformStructuredOutput(parsed: unknown): unknown {
    return parsed
  }

  protected async *processStreamChunks(
    stream: AsyncIterable<ChatStreamChunk>,
    options: TextOptions<ResolveProviderOptions<TModel>>,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<AdapterYieldChunk> {
    yield* processChatStreamChunks({
      stream,
      options,
      aguiState,
      adapterName: this.name,
    })
  }

  protected mapOptionsToRequest(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): Omit<ChatRequest, 'stream'> {
    const { variant, reasoning, ...restModelOptions } = (options.modelOptions ??
      {}) as ExternalTextProviderOptions
    const variantSuffix = variant ? `:${variant}` : ''
    const normalizedReasoning = normalizeReasoningOptions(reasoning)

    const messages: Array<ChatMessages> = []
    const systemPrompts =
      normalizeSystemPrompts<OpenRouterSystemPromptMetadata>(
        options.systemPrompts,
      )
    if (systemPrompts.length > 0) {
      const hasCacheControl = systemPrompts.some(
        (p) => p.metadata?.cache_control,
      )
      messages.push({
        role: 'system',
        content: hasCacheControl
          ? systemPrompts.map(
              (p): ChatContentText => ({
                type: 'text',
                text: p.content,
                ...(p.metadata?.cache_control && {
                  cacheControl: p.metadata.cache_control,
                }),
              }),
            )
          : systemPrompts.map((p) => p.content).join('\n'),
      })
    }
    for (const m of options.messages) {
      messages.push(this.convertMessage(m))
    }

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    // Attach json_schema only when outputSchema is set, every routed model
    // is in the combined set, and the caller did not opt into JSON mode.
    const combinedOutputSchema: JSONSchema | undefined = options.outputSchema
    const requestedResponseFormat =
      options.modelOptions != null && 'responseFormat' in options.modelOptions
        ? options.modelOptions.responseFormat
        : undefined
    const combinedSchema =
      combinedOutputSchema &&
      requestedResponseFormat?.type !== 'json_object' &&
      this.supportsCombinedToolsAndSchema(options.modelOptions)
        ? this.makeStructuredOutputCompatible(
            combinedOutputSchema,
            combinedOutputSchema.required,
          )
        : undefined

    const request: Omit<ChatRequest, 'stream'> = {
      ...restModelOptions,
      ...(normalizedReasoning && { reasoning: normalizedReasoning }),
      model: options.model + variantSuffix,
      messages,
      ...(tools && tools.length > 0 && { tools }),
      ...(combinedSchema && {
        responseFormat: {
          type: 'json_schema' as const,
          jsonSchema: {
            name: 'structured_output',
            schema: combinedSchema,
            strict: true,
          },
        },
      }),
    }
    return request
  }

  supportsCombinedToolsAndSchema(
    modelOptions?: ResolveProviderOptions<TModel>,
  ): boolean {
    return openRouterSupportsCombinedToolsAndSchema(this.model, modelOptions)
  }

  protected convertMessage(message: ModelMessage): ChatMessages {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content:
          typeof message.content === 'string'
            ? message.content
            : this.extractTextContent(message.content),
        toolCallId: message.toolCallId || '',
      }
    }

    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls?.map((tc) => ({
        ...tc,
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments),
        },
      }))
      const textContent = this.extractTextContent(message.content)
      const hasToolCalls = !!toolCalls && toolCalls.length > 0
      return {
        role: 'assistant',
        content: hasToolCalls && !textContent ? null : textContent,
        toolCalls,
      }
    }

    const contentParts = this.normalizeContent(message.content)
    const firstPart = contentParts.length === 1 ? contentParts[0] : undefined
    if (firstPart?.type === 'text') {
      const text = firstPart.content
      if (text.length === 0) {
        throw new Error(
          `User message for ${this.name} has empty text content. ` +
            `Empty user messages would produce a paid request with no input; ` +
            `provide non-empty content or omit the message.`,
        )
      }
      return {
        role: 'user',
        content: text,
      }
    }

    const parts: Array<ChatContentItems> = []
    for (const part of contentParts) {
      const converted = this.convertContentPart(part)
      if (!converted) {
        throw new Error(
          `Unsupported content part type for ${this.name}: ${part.type}. ` +
            `Override convertContentPart to handle this type, ` +
            `or remove it from the message.`,
        )
      }
      parts.push(converted)
    }
    if (parts.length === 0) {
      throw new Error(
        `User message for ${this.name} has no content parts. ` +
          `Empty user messages would produce a paid request with no input; ` +
          `provide at least one text/image/audio part or omit the message.`,
      )
    }
    return {
      role: 'user',
      content: parts,
    }
  }

  /** OpenRouter content-part converter (camelCase imageUrl/inputAudio/videoUrl). */
  protected convertContentPart(part: ContentPart): ChatContentItems | null {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.content }
      case 'image': {
        const meta = part.metadata as OpenRouterImageMetadata | undefined
        const value = part.source.value
        const imageMime = part.source.mimeType || 'application/octet-stream'
        const url =
          part.source.type === 'data' && !value.startsWith('data:')
            ? `data:${imageMime};base64,${value}`
            : value
        return {
          type: 'image_url',
          imageUrl: { url, detail: meta?.detail || 'auto' },
        }
      }
      case 'audio':
        if (part.source.type === 'url') {
          return {
            type: 'text',
            text: `[Audio: ${part.source.value}]`,
          }
        }
        return {
          type: 'input_audio',
          inputAudio: { data: part.source.value, format: 'mp3' },
        }
      case 'video':
        return {
          type: 'video_url',
          videoUrl: { url: part.source.value },
        }
      case 'document':
        if (part.source.type === 'data') {
          throw new Error(
            `${this.name} chat-completions does not support inline (data) document content parts. ` +
              `Use the Responses adapter (openRouterResponsesText) for document data, ` +
              `or pass the document as a URL.`,
          )
        }
        return {
          type: 'text',
          text: `[Document: ${part.source.value}]`,
        }
      default:
        return null
    }
  }

  protected normalizeContent(
    content: string | null | undefined | Array<ContentPart>,
  ): Array<ContentPart> {
    const hasNoContent = content === null || content === undefined
    if (hasNoContent) {
      return []
    }
    if (typeof content === 'string') {
      return [{ type: 'text', content: content }]
    }
    return content
  }

  protected extractTextContent(
    content: string | null | undefined | Array<ContentPart>,
  ): string {
    const hasNoContent = content === null || content === undefined
    if (hasNoContent) {
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

export function createOpenRouterText<TModel extends OpenRouterTextModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterTextAdapter<TModel, ResolveToolCapabilities<TModel>> {
  return new OpenRouterTextAdapter({ apiKey, ...config }, model)
}

export function openRouterText<TModel extends OpenRouterTextModels>(
  model: TModel,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterTextAdapter<TModel, ResolveToolCapabilities<TModel>> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterText(model, apiKey, config)
}
