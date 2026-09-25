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

/**
 * BytePlus-specific extension of `TranscriptionWord` carrying the per-word
 * confidence Seed ASR returns. The cross-provider contract has no field for
 * it, so callers who want it narrow the array — the same pattern the Grok
 * adapter uses:
 *
 * ```ts
 * const words = result.words as Array<BytePlusTranscriptionWord> | undefined
 * ```
 */
export interface BytePlusTranscriptionWord extends TranscriptionWord {
  /** Model confidence for the word, when Seed ASR returns one. */
  confidence?: number
}

/** Default `user.uid` echoed into BytePlus' request logs. */
const DEFAULT_UID = 'tanstack-ai'

/**
 * BytePlus Seed Speech transcription (ASR) adapter.
 *
 * Talks to `POST {baseURL}/api/v3/auc/bigmodel/recognize/flash` — the
 * synchronous "flash" endpoint, which returns the whole transcript in one
 * response rather than requiring a submit/poll cycle. It accepts audio up to
 * 2 hours long or 100 MB, either as a publicly reachable URL or as base64
 * bytes.
 *
 * Two BytePlus-specific details:
 *
 * - The model is selected by the `X-Api-Resource-Id` header
 *   (`volc.seedasr.auc_turbo`), not by a `model` field in the body. The
 *   package's `seed-asr` model id exists to satisfy the SDK contract and to
 *   give logs a stable value.
 * - Authentication uses `X-Api-Key` with the **Seed Speech** key, which is a
 *   different key from `ARK_API_KEY`.
 *
 * All timings on the wire are milliseconds; they are converted to seconds to
 * match the cross-provider `TranscriptionResult`.
 *
 * @example
 * ```ts
 * const adapter = byteplusTranscription('seed-asr')
 * const result = await generateTranscription({
 *   adapter,
 *   audio: 'https://example.com/interview.mp3',
 *   language: 'en-US',
 * })
 * ```
 */
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

    // The flash endpoint answers with one JSON shape and offers no format
    // negotiation, so srt/vtt/text/verbose_json can't be honoured. `segments`
    // on the result carry the timings a caller would have wanted from srt/vtt.
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

      // The flash endpoint can answer HTTP 200 while carrying the numeric
      // error envelope, so an absent transcript is a failure rather than an
      // empty result.
      if (typeof text !== 'string') {
        throw bytePlusVoiceError(response.status, payload, 'transcription')
      }

      // An empty string is well-formed, so it isn't an error — silence is a
      // legitimate transcription. But it is also what a 200-wrapped failure
      // looks like, so say so rather than handing back a successful, empty
      // result with no signal.
      if (text === '' && !hasUtterances(data)) {
        logger.warn(
          `byteplus: transcription returned an empty transcript with no ` +
            `utterances. This is a valid result for silent audio, and is also ` +
            `what a 200-wrapped failure looks like.`,
          { provider: this.name, model },
        )
      }

      // Seed ASR doesn't echo the language back, so report the one that was
      // actually sent — which is `modelOptions.language` when it overrode the
      // cross-provider hint.
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

/**
 * Build the JSON body for `POST /api/v3/auc/bigmodel/recognize/flash`.
 *
 * `show_utterances` defaults to `true` so the response carries the
 * per-utterance breakdown that populates `segments` and `words`.
 */
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

/**
 * Turn a recognition response into the transcript-shaped half of a
 * `TranscriptionResult`. Wire timings are milliseconds; everything returned
 * here is seconds.
 */
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
    if (
      typeof word.text !== 'string' ||
      typeof word.start_time !== 'number' ||
      typeof word.end_time !== 'number'
    ) {
      return []
    }
    const mapped: BytePlusTranscriptionWord = {
      word: word.text,
      start: msToSeconds(word.start_time),
      end: msToSeconds(word.end_time),
    }
    if (word.confidence !== undefined) mapped.confidence = word.confidence
    return [mapped]
  })

  // Untimed entries are dropped rather than emitted with NaN timings, but a
  // silent drop leaves the caller unable to tell "the provider sent no
  // timings" from "the adapter discarded them" — the two have very different
  // fixes, and a field rename upstream (e.g. `text` → `word`) would empty
  // these arrays without a single error anywhere.
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

  // Seed ASR is duration-billed and reports no token counts, so `usage`
  // carries only the audio length — the same shape the Grok and OpenAI
  // whisper paths use. `durationSeconds` is deprecated but still populated
  // alongside the self-describing `billed` pair.
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

/**
 * Convert one utterance into a segment, or nothing when it carries no
 * timings. The `id` is a placeholder — the caller renumbers after filtering.
 */
/**
 * True when the response carries at least one utterance, in either envelope
 * form. Used to tell "silent audio" from a 200-wrapped failure: a genuinely
 * empty transcript usually still arrives with no utterances, so the pairing is
 * a hint rather than proof — hence a warning rather than a throw.
 */
function hasUtterances(data: BytePlusASRRecognizeResponse): boolean {
  return (data.result?.utterances ?? data.utterances ?? []).length > 0
}

function toSegment(
  utterance: BytePlusASRUtterance,
): Array<TranscriptionSegment> {
  if (
    typeof utterance.start_time !== 'number' ||
    typeof utterance.end_time !== 'number'
  ) {
    return []
  }
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

/**
 * **Must verify when the Seed Speech key lands.** Every timing this adapter
 * reads — `audio_info.duration`, and each utterance's and word's
 * `start_time` / `end_time` — is assumed to be milliseconds. That comes from
 * the Volcengine flash-recognition reference this endpoint derives from
 * (a 2.499 s clip reports `duration: 2499`), not from a BytePlus response we
 * have seen. If BytePlus reports seconds instead, every duration, segment and
 * word timing here is 1000× too small, and this is the only place to fix.
 */
function msToSeconds(milliseconds: number): number {
  return milliseconds / 1000
}

/**
 * Turn the cross-provider `audio` input into the endpoint's `audio` block.
 *
 * URLs are passed through untouched — Seed ASR fetches them itself, which
 * avoids pulling large media through this process. Everything else is sent as
 * base64 `data`, with the container inferred from the input's MIME type or
 * filename when the caller didn't pin `audio_format`.
 */
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
  if (!mime || !mime.startsWith('audio/')) return undefined
  const subtype = mime.slice('audio/'.length).toLowerCase()
  if (subtype === 'mpeg') return 'mp3'
  if (subtype === 'x-wav' || subtype === 'wave') return 'wav'
  return subtype.replace(/^x-/, '')
}

/**
 * Creates a BytePlus Seed Speech transcription adapter with an explicit API
 * key.
 *
 * The key is the **Seed Speech** key, not the Ark key used by the chat, image
 * and video adapters.
 */
export function createBytePlusTranscription<
  TModel extends BytePlusTranscriptionModel = BytePlusTranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<BytePlusVoiceConfig, 'apiKey'>,
): BytePlusTranscriptionAdapter<TModel> {
  return new BytePlusTranscriptionAdapter(model, { ...config, apiKey })
}

/**
 * Creates a BytePlus Seed Speech transcription adapter, reading the API key
 * from `BYTEPLUS_VOICE_API_KEY`.
 *
 * @throws Error if `BYTEPLUS_VOICE_API_KEY` is not set.
 */
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
