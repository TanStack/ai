import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { arrayBufferToBase64, generateId } from '@tanstack/ai-utils'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import {
  BYTEPLUS_VOICE_BASE_URL,
  bytePlusVoiceError,
  bytePlusVoiceHeaders,
  getBytePlusVoiceApiKeyFromEnv,
  readJsonBody,
  withBytePlusVoiceDefaults,
} from '../utils/client'
import {
  BYTEPLUS_ASR_RESOURCE_HEADER,
  BYTEPLUS_ASR_RESOURCE_ID,
} from '../audio/wire-types'
import type {
  TokenUsage,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
  TranscriptionWord,
} from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { BytePlusVoiceConfig } from '../utils/client'
import type { BytePlusTranscriptionModel } from '../model-meta'
import type {
  BytePlusASRAudio,
  BytePlusASRRecognizeRequest,
  BytePlusASRRecognizeResponse,
  BytePlusASRUtterance,
} from '../audio/wire-types'
import type { BytePlusTranscriptionProviderOptions } from '../audio/transcription-provider-options'

/** Path of the synchronous ("flash") Seed ASR endpoint. */
const RECOGNIZE_FLASH_PATH = '/api/v3/auc/bigmodel/recognize/flash'

export interface BytePlusTranscriptionWord extends TranscriptionWord {
  /** Model confidence for the word, when Seed ASR returns one. */
  confidence?: number
}

/** Default `user.uid` echoed into BytePlus' request logs. */
const DEFAULT_UID = 'tanstack-ai'

export class BytePlusTranscriptionAdapter<
  TModel extends BytePlusTranscriptionModel = BytePlusTranscriptionModel,
> extends BaseTranscriptionAdapter<
  TModel,
  BytePlusTranscriptionProviderOptions
> {
  readonly name = 'byteplus' as const

  private readonly apiKey: string
  private readonly baseURL: string
  private readonly defaultHeaders: Record<string, string>
  private readonly fetchImpl: typeof fetch

  constructor(model: TModel, config: BytePlusVoiceConfig) {
    super(model, config)
    const resolved = withBytePlusVoiceDefaults(config)
    this.apiKey = resolved.apiKey
    this.baseURL = resolved.baseURL ?? BYTEPLUS_VOICE_BASE_URL
    this.defaultHeaders = resolved.defaultHeaders ?? {}
    this.fetchImpl = resolved.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async transcribe(
    options: TranscriptionOptions<BytePlusTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const {
      logger,
      model,
      audio,
      language,
      prompt,
      responseFormat,
      modelOptions,
    } = options

    logger.request(
      `activity=generateTranscription provider=byteplus model=${model}`,
      { provider: 'byteplus', model },
    )

    if (prompt) {
      logger.warn(
        'BytePlus Seed ASR has no prompt-biasing field on the flash endpoint — the `prompt` option is ignored.',
        { provider: 'byteplus', model },
      )
    }

    if (responseFormat !== undefined && responseFormat !== 'json') {
      logger.warn(
        `BytePlus Seed ASR always returns JSON — the requested responseFormat "${responseFormat}" is ignored. Build srt/vtt from result.segments if you need them.`,
        { provider: 'byteplus', model, responseFormat },
      )
    }

    try {
      const audioPayload = await normalizeAudioInput(
        audio,
        modelOptions?.audio_format,
      )
      const body = buildRecognizeRequestBody({
        audio: audioPayload,
        language,
        modelOptions,
      })

      const response = await this.fetchImpl(
        `${this.baseURL}${RECOGNIZE_FLASH_PATH}`,
        {
          method: 'POST',
          headers: bytePlusVoiceHeaders(this.apiKey, {
            ...this.defaultHeaders,
            [BYTEPLUS_ASR_RESOURCE_HEADER]: BYTEPLUS_ASR_RESOURCE_ID,
          }),
          body: JSON.stringify(body),
        },
      )

      const payload = await readJsonBody(response)

      if (!response.ok) {
        throw bytePlusVoiceError(response.status, payload, 'transcription')
      }

      const data = payload as BytePlusASRRecognizeResponse
      const text = data.result?.text ?? data.transcript

      if (typeof text !== 'string') {
        throw bytePlusVoiceError(response.status, payload, 'transcription')
      }

      const emptyTranscript = text === '' && !hasUtterances(data)
      if (emptyTranscript) {
        logger.warn(
          `byteplus: transcription returned an empty transcript with no ` +
            `utterances. This is a valid result for silent audio, and is also ` +
            `what a 200-wrapped failure looks like.`,
          { provider: this.name, model },
        )
      }

      const requestedLanguage = modelOptions?.language ?? language

      return {
        id: generateId(this.name),
        model,
        ...mapRecognizeResponse(data, text, logger),
        ...(requestedLanguage !== undefined && { language: requestedLanguage }),
      }
    } catch (error) {
      logger.errors('byteplus.transcribe fatal', {
        error: toRunErrorPayload(error, 'byteplus.transcribe failed'),
        source: 'byteplus.transcribe',
      })
      throw error
    }
  }
}

export function buildRecognizeRequestBody(options: {
  audio: BytePlusASRAudio
  language: string | undefined
  modelOptions: BytePlusTranscriptionProviderOptions | undefined
}): BytePlusASRRecognizeRequest {
  const { audio, language, modelOptions } = options

  const resolvedLanguage = modelOptions?.language ?? language

  return {
    user: { uid: modelOptions?.uid ?? DEFAULT_UID },
    audio,
    request: {
      model_name: modelOptions?.model_name ?? 'bigmodel',
      show_utterances: modelOptions?.show_utterances ?? true,
      ...(modelOptions?.enable_itn !== undefined && {
        enable_itn: modelOptions.enable_itn,
      }),
      ...(modelOptions?.enable_punc !== undefined && {
        enable_punc: modelOptions.enable_punc,
      }),
      ...(modelOptions?.enable_ddc !== undefined && {
        enable_ddc: modelOptions.enable_ddc,
      }),
      ...(modelOptions?.enable_speaker_info !== undefined && {
        enable_speaker_info: modelOptions.enable_speaker_info,
      }),
      ...(resolvedLanguage !== undefined && { language: resolvedLanguage }),
    },
  }
}

export function mapRecognizeResponse(
  data: BytePlusASRRecognizeResponse,
  text: string,
  logger?: InternalLogger,
): Omit<TranscriptionResult, 'id' | 'model'> {
  const utterances = data.result?.utterances ?? data.utterances ?? []
  // `id` numbers the segments we emit, not the utterances we were given, so
  // dropping an untimed utterance doesn't leave a hole in the sequence.
  const segments = utterances
    .flatMap((utterance) => toSegment(utterance))
    .map((segment, index) => ({ ...segment, id: index }))

  const rawWords = utterances.flatMap((utterance) => utterance.words ?? [])
  const words = rawWords.flatMap((word) => {
    if (typeof word.text !== 'string') return []
    if (typeof word.start_time !== 'number') return []
    if (typeof word.end_time !== 'number') return []
    const mapped: BytePlusTranscriptionWord = {
      word: word.text,
      start: msToSeconds(word.start_time),
      end: msToSeconds(word.end_time),
    }
    if (word.confidence !== undefined) mapped.confidence = word.confidence
    return [mapped]
  })

  const droppedWords = rawWords.length - words.length
  if (droppedWords > 0) {
    logger?.warn(
      `byteplus: dropped ${droppedWords} of ${rawWords.length} word(s) with ` +
        `missing or non-numeric timings.`,
      { provider: 'byteplus' },
    )
  }
  const droppedSegments = utterances.length - segments.length
  if (droppedSegments > 0) {
    logger?.warn(
      `byteplus: dropped ${droppedSegments} of ${utterances.length} ` +
        `utterance(s) with missing or non-numeric timings.`,
      { provider: 'byteplus' },
    )
  }

  const durationMs = data.audio_info?.duration
  const duration =
    typeof durationMs === 'number' && durationMs > 0
      ? msToSeconds(durationMs)
      : undefined

  const usage: TokenUsage | undefined =
    duration !== undefined
      ? {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          billed: { quantity: duration, unit: 'seconds' },
          durationSeconds: duration,
        }
      : undefined

  return {
    text,
    ...(duration !== undefined && { duration }),
    ...(segments.length > 0 && { segments }),
    ...(words.length > 0 && { words }),
    ...(usage !== undefined && { usage }),
  }
}

function hasUtterances(data: BytePlusASRRecognizeResponse): boolean {
  return (data.result?.utterances ?? data.utterances ?? []).length > 0
}

function toSegment(
  utterance: BytePlusASRUtterance,
): Array<TranscriptionSegment> {
  if (typeof utterance.start_time !== 'number') return []
  if (typeof utterance.end_time !== 'number') return []
  const speaker = utterance.additions?.speaker
  return [
    {
      id: 0,
      start: msToSeconds(utterance.start_time),
      end: msToSeconds(utterance.end_time),
      text: utterance.text ?? '',
      ...(speaker !== undefined && { speaker }),
    },
  ]
}

function msToSeconds(milliseconds: number): number {
  return milliseconds / 1000
}

export async function normalizeAudioInput(
  audio: TranscriptionOptions['audio'],
  formatHint: string | undefined,
): Promise<BytePlusASRAudio> {
  const withFormat = (
    payload: BytePlusASRAudio,
    inferred?: string,
  ): BytePlusASRAudio => {
    const format = formatHint ?? inferred
    return format ? { ...payload, format } : payload
  }

  if (typeof audio === 'string') {
    if (/^https?:\/\//i.test(audio)) {
      return withFormat({ url: audio }, extensionOf(audio))
    }
    const dataUrl = /^data:([^;,]+)?(?:;[^,]*)*,(.*)$/s.exec(audio)
    if (dataUrl) {
      return withFormat({ data: dataUrl[2] ?? '' }, formatFromMime(dataUrl[1]))
    }
    // A bare string that is neither a URL nor a data URL is already base64.
    return withFormat({ data: audio })
  }

  if (audio instanceof ArrayBuffer) {
    return withFormat({ data: arrayBufferToBase64(audio) })
  }

  const data = arrayBufferToBase64(await audio.arrayBuffer())
  const inferred =
    ('name' in audio && typeof audio.name === 'string'
      ? extensionOf(audio.name)
      : undefined) ?? formatFromMime(audio.type)
  return withFormat({ data }, inferred)
}

function extensionOf(pathOrName: string): string | undefined {
  const withoutQuery = pathOrName.split(/[?#]/)[0] ?? ''
  const match = /\.([a-z0-9]+)$/i.exec(withoutQuery)
  return match?.[1]?.toLowerCase()
}

function formatFromMime(mime: string | undefined): string | undefined {
  if (!mime) return undefined
  if (!mime.startsWith('audio/')) return undefined
  const subtype = mime.slice('audio/'.length).toLowerCase()
  if (subtype === 'mpeg') return 'mp3'
  if (subtype === 'x-wav') return 'wav'
  if (subtype === 'wave') return 'wav'
  return subtype.replace(/^x-/, '')
}

export function createBytePlusTranscription<
  TModel extends BytePlusTranscriptionModel = BytePlusTranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<BytePlusVoiceConfig, 'apiKey'>,
): BytePlusTranscriptionAdapter<TModel> {
  return new BytePlusTranscriptionAdapter(model, { ...config, apiKey })
}

export function byteplusTranscription<
  TModel extends BytePlusTranscriptionModel = BytePlusTranscriptionModel,
>(
  model: TModel,
  config?: Omit<BytePlusVoiceConfig, 'apiKey'>,
): BytePlusTranscriptionAdapter<TModel> {
  return createBytePlusTranscription(
    model,
    getBytePlusVoiceApiKeyFromEnv(),
    config,
  )
}
