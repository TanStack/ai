import { EventType, buildBaseUsage, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  createTwelveLabsClient,
  generateId,
  getTwelveLabsApiKeyFromEnv,
} from '../utils'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  ContentPart,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
  TokenUsage,
} from '@tanstack/ai'
import type { TwelveLabs, TwelvelabsApi } from 'twelvelabs-js'
import type {
  TWELVELABS_CHAT_MODELS,
  TwelveLabsChatModelProviderOptionsByName,
  TwelveLabsModelInputModalitiesByName,
} from '../model-meta'
import type { TwelveLabsMessageMetadataByModality } from '../message-types'
import type { TwelveLabsTextProviderOptions } from '../text/text-provider-options'
import type { TwelveLabsClientConfig } from '../utils'

/**
 * Configuration for the TwelveLabs text adapter.
 */
export interface TwelveLabsTextConfig extends TwelveLabsClientConfig {}

export type { TwelveLabsTextProviderOptions } from '../text/text-provider-options'

type TwelveLabsChatModel = (typeof TWELVELABS_CHAT_MODELS)[number]

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof TwelveLabsChatModelProviderOptionsByName
    ? TwelveLabsChatModelProviderOptionsByName[TModel]
    : TwelveLabsTextProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof TwelveLabsModelInputModalitiesByName
    ? TwelveLabsModelInputModalitiesByName[TModel]
    : readonly ['text', 'video']

/**
 * TwelveLabs Pegasus Text (Video Understanding) Adapter.
 *
 * Turns a chat turn that carries a video content part plus a text prompt into
 * a Pegasus analysis. Pegasus is a video-understanding model: it reasons over
 * the supplied video and returns prompt-guided text (summaries, Q&A, chapters,
 * highlights). The video may be supplied as:
 *
 * - a URL video content part (`{ type: 'video', source: { type: 'url', value } }`),
 * - an inline base64 video content part (`source.type === 'data'`), or
 * - a previously uploaded TwelveLabs asset via `modelOptions.assetId`.
 *
 * Streaming uses TwelveLabs' native NDJSON `analyzeStream`; structured output
 * uses the non-streaming `analyze` call with a `json_schema` response format.
 */
export class TwelveLabsTextAdapter<
  TModel extends TwelveLabsChatModel,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TwelveLabsMessageMetadataByModality
> {
  override readonly kind = 'text' as const
  readonly name = 'twelvelabs' as const

  private readonly client: TwelveLabs

  constructor(config: TwelveLabsTextConfig, model: TModel) {
    super({}, model)
    this.client = createTwelveLabsClient(config)
  }

  async *chatStream(
    options: TextOptions<TwelveLabsTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    const model = options.model

    const runId = options.runId ?? generateId(this.name)
    const threadId = options.threadId ?? generateId(this.name)
    const messageId = generateId(this.name)

    try {
      const request = this.buildAnalyzeRequest(options)
      logger.request(
        `activity=chat provider=twelvelabs model=${model} messages=${options.messages.length} stream=true`,
        { provider: 'twelvelabs', model },
      )

      const stream = await this.client.analyzeStream(request)

      let accumulatedContent = ''
      let hasEmittedTextStart = false
      let usage: TokenUsage | undefined
      let finishReason: 'stop' | 'length' = 'stop'

      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model,
        timestamp: Date.now(),
        parentRunId: options.parentRunId,
      }

      for await (const event of stream) {
        logger.provider(`provider=twelvelabs`, { event })

        if (event.eventType === 'text_generation' && event.text) {
          if (!hasEmittedTextStart) {
            hasEmittedTextStart = true
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId,
              model,
              timestamp: Date.now(),
              role: 'assistant',
            }
          }
          accumulatedContent += event.text
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            model,
            timestamp: Date.now(),
            delta: event.text,
            content: accumulatedContent,
          }
        } else if (event.eventType === 'stream_end') {
          if (event.finishReason === 'length') {
            finishReason = 'length'
          }
          const sdkUsage = event.metadata?.usage
          if (sdkUsage) {
            usage = buildBaseUsage({
              promptTokens: sdkUsage.inputTokens ?? 0,
              completionTokens: sdkUsage.outputTokens,
              totalTokens: (sdkUsage.inputTokens ?? 0) + sdkUsage.outputTokens,
            })
          }
        }
      }

      if (hasEmittedTextStart) {
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId,
          model,
          timestamp: Date.now(),
        }
      }

      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model,
        timestamp: Date.now(),
        finishReason,
        ...(usage && { usage }),
      }
    } catch (error) {
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('twelvelabs.chatStream fatal', {
        error,
        source: 'twelvelabs.chatStream',
      })
      yield {
        type: EventType.RUN_ERROR,
        runId,
        model,
        timestamp: Date.now(),
        message:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred during the analyze stream.',
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred during the analyze stream.',
        },
      }
    }
  }

  /**
   * Structured output via TwelveLabs' non-streaming `analyze` call with a
   * `json_schema` response format. The schema arrives pre-converted to JSON
   * Schema from the activity layer.
   */
  async structuredOutput(
    options: StructuredOutputOptions<TwelveLabsTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions

    try {
      const request = this.buildAnalyzeRequest(chatOptions)
      logger.request(
        `activity=chat provider=twelvelabs model=${chatOptions.model} messages=${chatOptions.messages.length} stream=false`,
        { provider: 'twelvelabs', model: chatOptions.model },
      )

      const result = await this.client.analyze({
        ...request,
        responseFormat: {
          type: 'json_schema',
          jsonSchema: outputSchema,
        },
      })

      const rawText = result.data ?? ''
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      return {
        data: parsed,
        rawText,
        ...(result.usage && {
          usage: buildBaseUsage({
            promptTokens: result.usage.inputTokens ?? 0,
            completionTokens: result.usage.outputTokens,
            totalTokens:
              (result.usage.inputTokens ?? 0) + result.usage.outputTokens,
          }),
        }),
      }
    } catch (error) {
      logger.errors('twelvelabs.structuredOutput fatal', {
        error,
        source: 'twelvelabs.structuredOutput',
      })
      throw new Error(
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during structured output generation.',
      )
    }
  }

  /**
   * Build the shared TwelveLabs analyze request from the framework's chat
   * options. Extracts the video source and concatenates all text (system
   * prompts + user text parts) into a single Pegasus prompt.
   */
  private buildAnalyzeRequest(
    options: TextOptions<TwelveLabsTextProviderOptions>,
  ): TwelvelabsApi.AnalyzeStreamRequest {
    const modelOptions = options.modelOptions ?? {}
    const prompt = this.buildPrompt(options)

    const request: TwelvelabsApi.AnalyzeStreamRequest = {
      modelName: this.model,
      prompt,
    }

    // assetId (provider option) wins over an inline video content part.
    if (modelOptions.assetId) {
      request.video = { type: 'asset_id', assetId: modelOptions.assetId }
    } else {
      const video = this.extractVideo(options.messages)
      if (!video) {
        throw new Error(
          'TwelveLabs Pegasus requires a video. Provide a video content part in the messages or set modelOptions.assetId.',
        )
      }
      request.video = video
    }

    if (modelOptions.temperature !== undefined) {
      request.temperature = modelOptions.temperature
    }
    if (modelOptions.maxTokens !== undefined) {
      request.maxTokens = modelOptions.maxTokens
    }
    if (modelOptions.startTime !== undefined) {
      request.startTime = modelOptions.startTime
    }
    if (modelOptions.endTime !== undefined) {
      request.endTime = modelOptions.endTime
    }

    return request
  }

  /**
   * Concatenate system prompts and all text content parts into one prompt.
   */
  private buildPrompt(
    options: TextOptions<TwelveLabsTextProviderOptions>,
  ): string {
    const parts: Array<string> = []

    for (const sp of normalizeSystemPrompts(options.systemPrompts)) {
      if (sp.content) parts.push(sp.content)
    }

    for (const msg of options.messages) {
      if (msg.role === 'tool') continue
      if (typeof msg.content === 'string') {
        if (msg.content) parts.push(msg.content)
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.content) parts.push(part.content)
        }
      }
    }

    return parts.join('\n')
  }

  /**
   * Find the first video content part in the message list and map it to a
   * TwelveLabs `VideoContext`.
   */
  private extractVideo(
    messages: Array<ModelMessage>,
  ): TwelvelabsApi.VideoContext | undefined {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue
      for (const part of msg.content as Array<ContentPart>) {
        if (part.type === 'video') {
          if (part.source.type === 'url') {
            return { type: 'url', url: part.source.value }
          }
          return { type: 'base64_string', base64String: part.source.value }
        }
      }
    }
    return undefined
  }
}

/**
 * Creates a TwelveLabs Pegasus text adapter with an explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createTwelveLabsText('pegasus1.5', 'tlk_...')
 * ```
 */
export function createTwelveLabsText<TModel extends TwelveLabsChatModel>(
  model: TModel,
  apiKey: string,
): TwelveLabsTextAdapter<TModel> {
  return new TwelveLabsTextAdapter({ apiKey }, model)
}

/**
 * Creates a TwelveLabs Pegasus text adapter, reading the API key from
 * `TWELVELABS_API_KEY` (or `TWELVE_LABS_API_KEY`).
 *
 * @example
 * ```typescript
 * const adapter = twelvelabsText('pegasus1.5')
 * const stream = chat({
 *   adapter,
 *   messages: [
 *     {
 *       role: 'user',
 *       content: [
 *         { type: 'text', content: 'Summarize this video in one paragraph.' },
 *         { type: 'video', source: { type: 'url', value: 'https://.../clip.mp4' } },
 *       ],
 *     },
 *   ],
 * })
 * ```
 */
export function twelvelabsText<TModel extends TwelveLabsChatModel>(
  model: TModel,
): TwelveLabsTextAdapter<TModel> {
  return createTwelveLabsText(model, getTwelveLabsApiKeyFromEnv())
}
