import OpenAI from 'openai'
import { EventType } from '@tanstack/ai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { generateId } from '@tanstack/ai-utils'
import {
  BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS,
  emitsEncryptedContent,
  supportsStructuredOutput,
} from '../model-meta'
import {
  getBytePlusArkApiKeyFromEnv,
  withBytePlusArkDefaults,
} from '../utils/client'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  ContentPart,
  ContentPartSource,
  Modality,
  ModelMessage,
  AdapterYieldChunk,
  TextOptions,
} from '@tanstack/ai'
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'
import type {
  BYTEPLUS_CHAT_MODELS,
  BytePlusChatModelToolCapabilitiesByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type {
  BytePlusAudioMetadata,
  BytePlusChatContentPart,
  BytePlusEncryptedContentFields,
  BytePlusImageMetadata,
  BytePlusInputAudioContentPart,
  BytePlusMessageMetadataByModality,
  BytePlusStreamDeltaExtras,
  BytePlusVideoMetadata,
} from '../message-types'
import type { BytePlusArkConfig } from '../utils/client'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof BytePlusChatModelToolCapabilitiesByName
    ? NonNullable<BytePlusChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export interface BytePlusTextConfig extends BytePlusArkConfig {}

export type { BytePlusTextProviderOptions } from '../text/text-provider-options'

export class BytePlusTextAdapter<
  TModel extends (typeof BYTEPLUS_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  BytePlusMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'byteplus' as const

  constructor(config: BytePlusTextConfig, model: TModel) {
    super(model, 'byteplus', new OpenAI(withBytePlusArkDefaults(config)))
  }

  protected override extractReasoning(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  ): { text: string } | undefined {
    const delta = chunk.choices[0]?.delta as
      | BytePlusStreamDeltaExtras
      | undefined
    const raw = delta?.reasoning_content
    if (typeof raw === 'string' && raw.length > 0) {
      return { text: raw }
    }
    return undefined
  }

  protected override async *processStreamChunks(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<AdapterYieldChunk> {
    const captured: { encryptedContent?: string } = {}

    const streamChunks = super.processStreamChunks(
      captureEncryptedContent(stream, captured),
      options,
      aguiState,
    )
    for await (const event of streamChunks) {
      const attachSignature =
        event.type === EventType.STEP_FINISHED &&
        captured.encryptedContent !== undefined &&
        event.signature === undefined
      if (attachSignature) {
        yield {
          ...event,
          signature: captured.encryptedContent,
          delta: event.delta ?? event.content ?? '',
        }
        continue
      }
      yield event
    }
  }

  protected override convertMessage(
    message: ModelMessage,
  ): ChatCompletionMessageParam {
    const converted = super.convertMessage(message)
    const skipEncryptedContent =
      converted.role !== 'assistant' || !emitsEncryptedContent(this.model)
    if (skipEncryptedContent) {
      return converted
    }

    const encryptedContent = lastThinkingSignature(message)
    if (encryptedContent === undefined) return converted

    const withEncrypted: typeof converted & BytePlusEncryptedContentFields = {
      ...converted,
      encrypted_content: encryptedContent,
    }
    return withEncrypted
  }

  protected override convertContentPart(
    part: ContentPart,
  ): ChatCompletionContentPart | null {
    if (part.type === 'image') {
      const metadata = part.metadata as BytePlusImageMetadata | undefined
      return asChatContentPart({
        type: 'image_url',
        image_url: {
          url: toUrlOrDataUri(part.source),
          detail: metadata?.detail ?? 'auto',
          ...(metadata?.image_pixel_limit && {
            image_pixel_limit: metadata.image_pixel_limit,
          }),
        },
      })
    }

    if (part.type === 'video') {
      const metadata = part.metadata as BytePlusVideoMetadata | undefined
      return asChatContentPart({
        type: 'video_url',
        video_url: {
          url: toUrlOrDataUri(part.source),
          ...(metadata?.fps !== undefined && { fps: metadata.fps }),
        },
      })
    }

    if (part.type === 'audio') {
      const metadata = part.metadata as BytePlusAudioMetadata | undefined
      // Ark takes audio either by URL or as inline base64 with an explicit
      // container format; unlike images there is no data-URI form.
      if (part.source.type === 'url') {
        return asChatContentPart({
          type: 'input_audio',
          input_audio: { url: part.source.value },
        })
      }
      const format = metadata?.format ?? audioFormatFromMimeType(part.source)
      if (format === undefined) {
        throw new Error(
          `Audio content part for ${this.name} has an unrecognised mimeType ` +
            `(${part.source.mimeType || 'none'}). Set the container format ` +
            `explicitly via the part's metadata.format, or supply a URL source.`,
        )
      }
      return asChatContentPart({
        type: 'input_audio',
        input_audio: { data: stripDataUriPrefix(part.source.value), format },
      })
    }

    return super.convertContentPart(part)
  }

  override supportsCombinedToolsAndSchema(): boolean {
    return supportsStructuredOutput(this.model)
  }

  override async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const unsupported = this.structuredOutputUnsupportedMessage()
    if (unsupported) {
      options.chatOptions.logger.errors(
        `${this.name}.structuredOutput unsupported model`,
        {
          error: { message: unsupported },
          source: `${this.name}.structuredOutput`,
        },
      )
      throw new Error(unsupported)
    }
    return await super.structuredOutput(options)
  }

  override async *structuredOutputStream(
    options: StructuredOutputOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const unsupported = this.structuredOutputUnsupportedMessage()
    if (unsupported) {
      const runId = generateId(this.name)
      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId: options.chatOptions.threadId ?? generateId(this.name),
        model: options.chatOptions.model,
        timestamp: Date.now(),
        parentRunId: options.chatOptions.parentRunId,
      }
      yield {
        type: EventType.RUN_ERROR,
        runId,
        model: options.chatOptions.model,
        timestamp: Date.now(),
        message: unsupported,
        code: 'unsupported-structured-output',
        error: { message: unsupported, code: 'unsupported-structured-output' },
      }
      options.chatOptions.logger.errors(
        `${this.name}.structuredOutputStream unsupported model`,
        {
          error: { message: unsupported },
          source: `${this.name}.structuredOutputStream`,
        },
      )
      return
    }
    yield* super.structuredOutputStream(options)
  }

  private structuredOutputUnsupportedMessage(): string | undefined {
    if (supportsStructuredOutput(this.model)) return undefined
    return (
      `BytePlus model ${this.model} does not support structured output — Ark ` +
      `rejects both response_format json_schema and json_object on it. Use ` +
      `one of: ${BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS.join(', ')}.`
    )
  }
}

async function* captureEncryptedContent(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  captured: { encryptedContent?: string },
): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta as
      | BytePlusStreamDeltaExtras
      | undefined
    const blob = delta?.encrypted_content
    if (typeof blob === 'string' && blob.length > 0) {
      captured.encryptedContent = blob
    }
    yield chunk
  }
}

function lastThinkingSignature(message: ModelMessage): string | undefined {
  const thinking = message.thinking
  if (!thinking) return undefined
  for (let i = thinking.length - 1; i >= 0; i--) {
    const signature = thinking[i]?.signature
    if (signature) return signature
  }
  return undefined
}

function asChatContentPart(
  part: BytePlusChatContentPart,
): ChatCompletionContentPart {
  const arkPart: object = part
  return arkPart as ChatCompletionContentPart
}

function toUrlOrDataUri(source: ContentPartSource): string {
  const alreadyUri = source.type !== 'data' || source.value.startsWith('data:')
  if (alreadyUri) {
    return source.value
  }
  // A missing mimeType would interpolate as "data:undefined;base64,…" and be
  // rejected, so fall back the same way the OpenAI base does.
  return `data:${source.mimeType || 'application/octet-stream'};base64,${source.value}`
}

function stripDataUriPrefix(value: string): string {
  const comma = value.startsWith('data:') ? value.indexOf(',') : -1
  return comma === -1 ? value : value.slice(comma + 1)
}

const AUDIO_FORMAT_BY_MIME_SUBTYPE: Record<
  string,
  NonNullable<BytePlusInputAudioContentPart['input_audio']['format']>
> = {
  mpeg: 'mp3',
  mp3: 'mp3',
  wav: 'wav',
  'x-wav': 'wav',
  wave: 'wav',
  ogg: 'ogg',
  flac: 'flac',
  'x-flac': 'flac',
  mp4: 'm4a',
  m4a: 'm4a',
  'x-m4a': 'm4a',
  aac: 'aac',
  pcm: 'pcm',
  l16: 'pcm',
}

function audioFormatFromMimeType(
  source: ContentPartSource,
):
  | NonNullable<BytePlusInputAudioContentPart['input_audio']['format']>
  | undefined {
  const mimeType = source.mimeType
  if (!mimeType) return undefined
  const subtype = mimeType.split(';')[0]?.split('/')[1]?.toLowerCase()
  return subtype ? AUDIO_FORMAT_BY_MIME_SUBTYPE[subtype] : undefined
}

export function createBytePlusText<
  TModel extends (typeof BYTEPLUS_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<BytePlusTextConfig, 'apiKey'>,
): BytePlusTextAdapter<TModel> {
  return new BytePlusTextAdapter({ apiKey, ...config }, model)
}

export function byteplusText<
  TModel extends (typeof BYTEPLUS_CHAT_MODELS)[number],
>(
  model: TModel,
  config?: Omit<BytePlusTextConfig, 'apiKey'>,
): BytePlusTextAdapter<TModel> {
  const apiKey = getBytePlusArkApiKeyFromEnv()
  return createBytePlusText(model, apiKey, config)
}
