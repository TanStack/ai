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
  StreamChunk,
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

/**
 * Configuration for the BytePlus text adapter.
 */
export interface BytePlusTextConfig extends BytePlusArkConfig {}

/**
 * Re-export of the public provider options type.
 */
export type { BytePlusTextProviderOptions } from '../text/text-provider-options'

/**
 * BytePlus ModelArk Text (Chat) Adapter
 *
 * Tree-shakeable adapter for the Seed / GLM / DeepSeek / gpt-oss chat models
 * on BytePlus ModelArk. Ark serves an OpenAI-compatible Chat Completions
 * endpoint, so this drives the OpenAI SDK against Ark's `baseURL` — the same
 * pattern as `ai-groq` and `ai-grok`.
 *
 * Three Ark behaviours are handled on top of the shared base:
 *
 * 1. **`reasoning_content` deltas** — Ark streams reasoning under
 *    `delta.reasoning_content` rather than the OpenAI `reasoning` field.
 * 2. **`encrypted_content` round-trip** — thinking-summary models emit an
 *    opaque signature over the reasoning trace. See
 *    {@link BytePlusTextAdapter.processStreamChunks} and
 *    {@link BytePlusTextAdapter.convertMessage}.
 * 3. **Per-model structured-output gating** — only 10 of the 18 shipped chat
 *    models honour `response_format: json_schema` (glm-4-7 accepts it and then
 *    ignores the schema), and Ark rejects `json_object` everywhere, so there
 *    is no JSON-mode fallback.
 */
export class BytePlusTextAdapter<
  TModel extends (typeof BYTEPLUS_CHAT_MODELS)[number],
  // `Record<string, any>` (not `unknown`) mirrors the OpenAI/Groq/Grok text
  // adapters: the resolved provider options are an interface with no index
  // signature, assignable to `Record<string, any>` but not to
  // `Record<string, unknown>`. See issue #821.
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

  /**
   * Surfaces Ark's reasoning deltas. Thinking-enabled models stream the
   * reasoning trace as `delta.reasoning_content` (the OpenAI chunk shape has
   * no reasoning field); the base routes this hook through both `chatStream`
   * and `structuredOutputStream`.
   */
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

  /**
   * Captures Ark's `encrypted_content` and attaches it to the reasoning
   * step's `STEP_FINISHED` event as its `signature`.
   *
   * On a thinking-summary model Ark streams the whole blob as one dedicated
   * chunk (empty `content` and `reasoning_content`) sitting between the
   * reasoning deltas and the content deltas — so it is always captured before
   * the base closes the reasoning lifecycle at the first content delta.
   *
   * `signature` is the framework's existing provider-signature seam: the chat
   * engine stores it on the `ThinkingPart`, which
   * `buildAssistantMessages` carries into `ModelMessage.thinking[].signature`,
   * which {@link BytePlusTextAdapter.convertMessage} echoes back to Ark on the
   * next turn. No base-class change is needed — this is the same round-trip
   * Anthropic's thinking signatures use.
   *
   * Only `chatStream` is covered: `structuredOutputStream` drives the SDK
   * directly in the base with no per-chunk seam, so a structured-output turn
   * does not capture the blob. Ark accepts a following turn without it, so the
   * consequence is a lost reasoning-cache hit, not a failed request.
   */
  protected override async *processStreamChunks(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    const captured: { encryptedContent?: string } = {}

    for await (const event of super.processStreamChunks(
      captureEncryptedContent(stream, captured),
      options,
      aguiState,
    )) {
      if (
        event.type === EventType.STEP_FINISHED &&
        captured.encryptedContent !== undefined &&
        event.signature === undefined
      ) {
        // `delta` is stamped alongside the signature because the two consumers
        // read this event differently. `chat()`'s server agent loop accumulates
        // thinking ONLY from `STEP_FINISHED.delta` and then drops the whole
        // step — signature included — when the accumulated content is empty
        // (`finalizeCurrentThinkingStep`); the OpenAI base emits `content` but
        // never `delta`, so without this the blob never reaches the
        // continuation message. The client `StreamProcessor` can't double-count
        // it: it short-circuits STEP_FINISHED content once
        // `hasSeenReasoningEvents` is set, which the REASONING_MESSAGE_CONTENT
        // events preceding every STEP_FINISHED here always set.
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

  /**
   * Echoes a captured `encrypted_content` blob back on outgoing assistant
   * messages so multi-turn conversations replay it verbatim, as Ark's
   * thinking-summary docs require.
   *
   * The gate is `emitsEncryptedContent(this.model)` — the model being called
   * now, not the provenance of the history. That guarantees a signature is
   * never sent to a model that has no `encrypted_content` concept. It does
   * NOT identify who produced the signature: `ModelMessage` carries no
   * provider field, so a foreign signature (e.g. an Anthropic thinking
   * signature in replayed cross-provider history) WILL be forwarded when the
   * current model is a thinking-summary model. No shape guard is attempted —
   * the blob is opaque and Ark is the only party that can validate it.
   *
   * Absence is never an error: a live probe confirmed Ark accepts a turn whose
   * assistant message omits `encrypted_content`.
   */
  protected override convertMessage(
    message: ModelMessage,
  ): ChatCompletionMessageParam {
    const converted = super.convertMessage(message)
    if (converted.role !== 'assistant' || !emitsEncryptedContent(this.model)) {
      return converted
    }

    const encryptedContent = lastThinkingSignature(message)
    if (encryptedContent === undefined) return converted

    // Intersection rather than a cast: `encrypted_content` is an Ark-only
    // field with no slot on the OpenAI message param, and the intersection is
    // still assignable to `ChatCompletionMessageParam`.
    const withEncrypted: typeof converted & BytePlusEncryptedContentFields = {
      ...converted,
      encrypted_content: encryptedContent,
    }
    return withEncrypted
  }

  /**
   * Adds the Ark-only content parts on top of the base's text/image handling:
   * `video_url`, URL-addressed `input_audio`, and the extra `image_url`
   * fields (`detail: 'xhigh'`, `image_pixel_limit`).
   */
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

  /**
   * Only the models in {@link BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS} accept
   * `response_format: json_schema`; the rest reject it with a 400.
   *
   * Returning `false` for a rejecting model does not make structured output
   * work — Ark has no `json_object` fallback to downgrade to. What it buys is
   * keeping `response_format` out of the request the engine would otherwise
   * build: with the hook false the engine takes its separate finalization
   * path, and the guard in {@link BytePlusTextAdapter.structuredOutput} /
   * {@link BytePlusTextAdapter.structuredOutputStream} stops that *before*
   * any HTTP call. So a `chat({ outputSchema })` on a rejecting model fails
   * loudly, named, without a schema Ark would 400 on ever leaving the
   * process — rather than 400-ing on every turn, or (worse) parsing prose as
   * if it were JSON.
   *
   * Tools without a schema are unaffected: `tools` alone never involves
   * `response_format`.
   */
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
  ): AsyncIterable<StreamChunk> {
    const unsupported = this.structuredOutputUnsupportedMessage()
    if (unsupported) {
      // Mirror the base's contract: failures inside structuredOutputStream
      // surface as a RUN_STARTED → RUN_ERROR pair rather than a throw, so
      // consumers keep a single error-handling path.
      const timestamp = Date.now()
      const runId = generateId(this.name)
      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId: options.chatOptions.threadId ?? generateId(this.name),
        model: options.chatOptions.model,
        timestamp,
        parentRunId: options.chatOptions.parentRunId,
      }
      yield {
        type: EventType.RUN_ERROR,
        runId,
        model: options.chatOptions.model,
        timestamp,
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

  /**
   * Explains why structured output is unavailable, or `undefined` when the
   * model supports it. Ark rejects `response_format: json_object` on every
   * model, so there is no JSON-mode fallback to degrade to — failing loud
   * here beats a raw upstream 400.
   */
  private structuredOutputUnsupportedMessage(): string | undefined {
    if (supportsStructuredOutput(this.model)) return undefined
    return (
      `BytePlus model ${this.model} does not support structured output — Ark ` +
      `rejects both response_format json_schema and json_object on it. Use ` +
      `one of: ${BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS.join(', ')}.`
    )
  }
}

/**
 * Passes Ark's chunks through untouched while recording the single
 * `encrypted_content` blob a thinking-summary model emits.
 */
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

/**
 * The blob to echo back for an assistant message: the last thinking step that
 * carries a signature.
 */
function lastThinkingSignature(message: ModelMessage): string | undefined {
  const thinking = message.thinking
  if (!thinking) return undefined
  for (let i = thinking.length - 1; i >= 0; i--) {
    const signature = thinking[i]?.signature
    if (signature) return signature
  }
  return undefined
}

/**
 * The one place the Ark content-part dialect meets the OpenAI SDK's request
 * types.
 *
 * Ark's union is a superset of OpenAI's: `video_url` has no OpenAI arm at all,
 * `input_audio` additionally accepts a `url`, and `image_url` carries
 * `detail: 'xhigh'` and `image_pixel_limit`. `ChatCompletionContentPart` is a
 * closed type alias in the SDK, so no interface augmentation can admit those
 * arms and no narrowing can produce them — widening to `object` keeps this to
 * a single downcast rather than spreading one through each branch of
 * {@link BytePlusTextAdapter.convertContentPart}.
 */
function asChatContentPart(
  part: BytePlusChatContentPart,
): ChatCompletionContentPart {
  const arkPart: object = part
  return arkPart as ChatCompletionContentPart
}

/**
 * Renders a content source as the URL string Ark expects: URLs pass through,
 * inline base64 becomes a `data:` URI.
 */
function toUrlOrDataUri(source: ContentPartSource): string {
  if (source.type !== 'data' || source.value.startsWith('data:')) {
    return source.value
  }
  // A missing mimeType would interpolate as "data:undefined;base64,…" and be
  // rejected, so fall back the same way the OpenAI base does.
  return `data:${source.mimeType || 'application/octet-stream'};base64,${source.value}`
}

/**
 * Strips a `data:` prefix so inline audio is sent as bare base64.
 */
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

/**
 * Maps an audio part's mimeType to Ark's container format token.
 */
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

/**
 * Creates a BytePlus text adapter with an explicit API key.
 *
 * @param model - The chat model id (e.g., `'seed-2-0-lite-260428'`)
 * @param apiKey - Your BytePlus Ark API key
 * @param config - Optional additional configuration
 *
 * @example
 * ```typescript
 * const adapter = createBytePlusText('seed-2-0-lite-260428', 'ark-...')
 * ```
 */
export function createBytePlusText<
  TModel extends (typeof BYTEPLUS_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<BytePlusTextConfig, 'apiKey'>,
): BytePlusTextAdapter<TModel> {
  return new BytePlusTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a BytePlus text adapter with the API key read from `ARK_API_KEY`.
 *
 * @param model - The chat model id (e.g., `'seed-2-0-lite-260428'`)
 * @param config - Optional configuration (excluding `apiKey`)
 * @throws Error if `ARK_API_KEY` is not set
 *
 * @example
 * ```typescript
 * const adapter = byteplusText('seed-2-0-lite-260428')
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * })
 * ```
 */
export function byteplusText<
  TModel extends (typeof BYTEPLUS_CHAT_MODELS)[number],
>(
  model: TModel,
  config?: Omit<BytePlusTextConfig, 'apiKey'>,
): BytePlusTextAdapter<TModel> {
  const apiKey = getBytePlusArkApiKeyFromEnv()
  return createBytePlusText(model, apiKey, config)
}
