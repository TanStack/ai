import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import {
  BYTEPLUS_VOICE_BASE_URL,
  bytePlusVoiceError,
  bytePlusVoiceHeaders,
  getBytePlusVoiceApiKeyFromEnv,
  readJsonBody,
  withBytePlusVoiceDefaults,
} from '../utils/client'
import type { TTSOptions } from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { BytePlusVoiceConfig } from '../utils/client'
import type { BytePlusTTSModel } from '../model-meta'
import type {
  BytePlusTTSAudioConfig,
  BytePlusTTSAudioFormat,
  BytePlusTTSCreateRequest,
  BytePlusTTSCreateResponse,
} from '../audio/wire-types'
import type {
  BytePlusTTSProviderOptions,
  BytePlusTTSResult,
} from '../audio/tts-provider-options'

/** Path of the synchronous Seed Speech synthesis endpoint. */
const TTS_CREATE_PATH = '/api/v3/tts/create'

/**
 * Name of the request field carrying the text to speak.
 *
 * **`text_prompt` is correct — do not "fix" this to `text`.** The endpoint
 * schema (docs.byteplus.com/en/docs/byteplusvoice/seedaudio-01) lists this
 * body as exactly `model`, `text_prompt`, `references`, `audio_config`,
 * `watermark`; there is no request-side `text`. The `text` spelling belongs
 * to the *other* endpoint, `/tts/unidirectional` (TTS 2.0), where it sits
 * under `req_params.text`. The name stays isolated here so the two spellings
 * never get conflated.
 */
const TTS_TEXT_FIELD = 'text_prompt' satisfies keyof BytePlusTTSCreateRequest

/**
 * Sample rate used when the caller doesn't pick one. The endpoint documents a
 * default of 40000, which is not among the rates it accepts — so the adapter
 * never relies on the server default and always sends this instead.
 */
const DEFAULT_SAMPLE_RATE = 24000

/**
 * Voice used when neither `TTSOptions.voice` nor `modelOptions.speaker` is
 * set — the English female "Stokie" voice from the TTS 2.0 generation.
 */
export const BYTEPLUS_DEFAULT_TTS_SPEAKER = 'en_female_stokie_uranus_bigtts'

/**
 * Hard cap on a single Seed Speech synthesis, in seconds. Longer scripts must
 * be split across calls and stitched client-side.
 *
 * The cap applies to the *pre-rate* length the service bills on — the
 * `original_duration` it returns. The delivered clip can run longer than this
 * when `speech_rate` slows it down.
 */
export const BYTEPLUS_TTS_MAX_OUTPUT_SECONDS = 120

/**
 * BytePlus Seed Speech text-to-speech adapter.
 *
 * Talks to `POST {baseURL}/api/v3/tts/create` on the Seed Speech voice host.
 * Two things differ from the Ark-hosted adapters in this package:
 *
 * - **Separate API key.** Seed Speech authenticates with `X-Api-Key` and its
 *   own key (`BYTEPLUS_VOICE_API_KEY`). An `ARK_API_KEY` sent here is
 *   rejected with `45000010 Invalid X-Api-Key`.
 * - **120 s output cap.** A single call synthesises at most
 *   {@link BYTEPLUS_TTS_MAX_OUTPUT_SECONDS} seconds of audio; longer scripts
 *   have to be split and stitched client-side. The cap is measured before
 *   `speech_rate` is applied, so a slowed clip can play for longer than that
 *   — `result.duration` is the delivered length and `result.originalDuration`
 *   is the metered one.
 *
 * Streaming synthesis (`tts/unidirectional` and the WebSocket API) is not
 * covered by this adapter — note that endpoint spells the text field `text`,
 * while this one uses `text_prompt`.
 *
 * @example
 * ```ts
 * const adapter = byteplusSpeech('seed-audio-1.0')
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'welcome to the guitar store',
 *   voice: 'en_female_stokie_uranus_bigtts',
 *   format: 'mp3',
 * })
 * ```
 */
export class BytePlusTTSAdapter<
  TModel extends BytePlusTTSModel = BytePlusTTSModel,
> extends BaseTTSAdapter<TModel, BytePlusTTSProviderOptions> {
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

  async generateSpeech(
    options: TTSOptions<BytePlusTTSProviderOptions>,
  ): Promise<BytePlusTTSResult> {
    const { logger, model, text, voice, format, speed, modelOptions } = options

    logger.request(`activity=generateSpeech provider=byteplus model=${model}`, {
      provider: 'byteplus',
      model,
    })

    const { body, audioFormat, sampleRate } = buildTTSRequestBody({
      model,
      text,
      voice,
      format,
      speed,
      modelOptions,
      logger,
    })

    try {
      const response = await this.fetchImpl(
        `${this.baseURL}${TTS_CREATE_PATH}`,
        {
          method: 'POST',
          headers: bytePlusVoiceHeaders(this.apiKey, {
            ...this.defaultHeaders,
            // Client-generated per-request id. BytePlus echoes it in their
            // request logs, which is what support asks for when diagnosing a
            // synthesis failure.
            'X-Api-Request-Id': newRequestId(),
          }),
          body: JSON.stringify(body),
        },
      )

      const payload = await readJsonBody(response)

      if (!response.ok) {
        throw bytePlusVoiceError(response.status, payload, 'text-to-speech')
      }

      const data = payload as BytePlusTTSCreateResponse

      // Seed Speech reports status in the body, not only in the HTTP status:
      // a 200 can carry a non-zero `code`. Check it before looking at `audio`,
      // because a failed call may still return a partial or placeholder
      // payload that would otherwise be handed back as if it were valid.
      if (typeof data.code === 'number' && data.code !== 0) {
        throw bytePlusVoiceError(response.status, payload, 'text-to-speech')
      }

      // Belt and braces for a 200 that reports success but carries nothing to
      // play. `bytePlusVoiceError` surfaces whatever `message` came back.
      if (typeof data.audio !== 'string' || data.audio.length === 0) {
        throw bytePlusVoiceError(response.status, payload, 'text-to-speech')
      }

      const duration = toDurationSeconds(data.duration)
      const originalDuration = toDurationSeconds(data.original_duration)

      return {
        id: generateId(this.name),
        model,
        audio: data.audio,
        format: audioFormat,
        contentType: getContentType(audioFormat, sampleRate),
        ...(duration !== undefined && { duration }),
        ...(originalDuration !== undefined && { originalDuration }),
        ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
        ...(data.url !== undefined && { url: data.url }),
      }
    } catch (error) {
      logger.errors('byteplus.generateSpeech fatal', {
        error,
        source: 'byteplus.generateSpeech',
      })
      throw error
    }
  }
}

/**
 * Build the JSON body for `POST /api/v3/tts/create`, resolving the voice,
 * output format and rate fields in one place.
 *
 * Returns the request `body`, the resolved `audioFormat` and the
 * `sampleRate`, which the caller reports on the result and turns into a
 * `contentType`.
 */
export function buildTTSRequestBody(options: {
  model: string
  text: string
  voice: string | undefined
  format: TTSOptions['format'] | undefined
  speed: number | undefined
  modelOptions: BytePlusTTSProviderOptions | undefined
  logger: InternalLogger
}): {
  body: BytePlusTTSCreateRequest
  audioFormat: BytePlusTTSAudioFormat
  sampleRate: number
} {
  const { model, text, voice, format, speed, modelOptions, logger } = options

  const audioFormat = pickAudioFormat(modelOptions?.format, format, logger)
  // Always explicit: the documented server default (40000) is not one of the
  // rates the endpoint accepts, so relying on it is a coin flip.
  const sampleRate = modelOptions?.sample_rate ?? DEFAULT_SAMPLE_RATE

  const audioConfig: BytePlusTTSAudioConfig = {
    format: audioFormat,
    sample_rate: sampleRate,
  }
  if (modelOptions?.pitch_rate !== undefined) {
    audioConfig.pitch_rate = modelOptions.pitch_rate
  }
  if (modelOptions?.loudness_rate !== undefined) {
    audioConfig.loudness_rate = modelOptions.loudness_rate
  }
  if (modelOptions?.enable_subtitle !== undefined) {
    audioConfig.enable_subtitle = modelOptions.enable_subtitle
  }

  // An explicit `speech_rate` always wins over the derived one — it is the
  // native unit and the only way to reach the extremes precisely.
  const speechRate =
    modelOptions?.speech_rate ??
    (speed !== undefined ? toSpeechRate(speed, logger) : undefined)
  if (speechRate !== undefined) {
    audioConfig.speech_rate = speechRate
  }

  const body: BytePlusTTSCreateRequest = {
    model,
    [TTS_TEXT_FIELD]: text,
    // The voice belongs inside `references`, not at the top level — a
    // top-level `speaker` is silently ignored by the server. The flat member
    // shape here is the best-supported reading of the docs; see
    // `BytePlusTTSReference` for the unresolved part and the live-probe flag.
    references: modelOptions?.references ?? [
      {
        speaker: modelOptions?.speaker ?? voice ?? BYTEPLUS_DEFAULT_TTS_SPEAKER,
      },
    ],
    audio_config: audioConfig,
  }
  if (modelOptions?.watermark !== undefined) {
    body.watermark = modelOptions.watermark
  }

  return { body, audioFormat, sampleRate }
}

/**
 * Convert the cross-provider `TTSOptions.speed` multiplier into Seed Speech's
 * `speech_rate` percentage.
 *
 * ```
 * speech_rate = clamp(round((speed - 1) * 100), -50, 100)
 * ```
 *
 * so `0.5 → -50`, `1.0 → 0`, `1.5 → 50`, `2.0 → 100`.
 *
 * The range `-50`..`100` and both multiplier anchors (`-50` = 0.5×,
 * `100` = 2×) are documented, and hold on both the `/tts/create` and
 * `/tts/unidirectional` endpoints.
 *
 * `TTSOptions.speed` spans a wider 0.25×–4× than the endpoint supports, so
 * anything outside 0.5×–2× clamps (and warns) rather than erroring.
 */
export function toSpeechRate(speed: number, logger?: InternalLogger): number {
  const rate = Math.round((speed - 1) * 100)
  const clamped = Math.min(100, Math.max(-50, rate))
  if (clamped !== rate) {
    logger?.warn(
      `Speed ${speed}× is outside the range BytePlus Seed Speech documents (0.5×–2×) — clamping speech_rate from ${rate} to ${clamped}.`,
      { provider: 'byteplus', requestedSpeed: speed, speechRate: clamped },
    )
  }
  return clamped
}

/**
 * Map the cross-provider `TTSOptions.format` onto a Seed Speech output
 * format. An explicit `modelOptions.format` always wins.
 *
 * Seed Speech produces `wav`, `mp3`, `pcm` and `ogg_opus`. The generic
 * `opus` maps onto `ogg_opus`; `aac` and `flac` have no equivalent and fall
 * back to `mp3` (matching how the other non-OpenAI TTS adapters in this repo
 * handle unsupported codecs). The fallback is logged so it isn't silent.
 */
function pickAudioFormat(
  override: BytePlusTTSAudioFormat | undefined,
  format: TTSOptions['format'] | undefined,
  logger: InternalLogger,
): BytePlusTTSAudioFormat {
  if (override) return override
  if (!format) return 'mp3'
  switch (format) {
    case 'mp3':
    case 'wav':
    case 'pcm':
      return format
    case 'opus':
      return 'ogg_opus'
    case 'aac':
    case 'flac':
      logger.warn(
        `BytePlus Seed Speech does not support ${format} output — falling back to mp3. Set modelOptions.format to choose between wav, mp3, pcm and ogg_opus.`,
        { provider: 'byteplus', requestedFormat: format },
      )
      return 'mp3'
  }
}

/**
 * Build a per-request id for the `X-Api-Request-Id` header. Falls back to the
 * package's own id generator on runtimes without `crypto.randomUUID`.
 */
function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? generateId('byteplus-tts')
}

/**
 * MIME type for a Seed Speech output format.
 *
 * `pcm` is raw little-endian 16-bit samples, so its media type has to carry
 * the sample rate (RFC 3551/3555). The adapter always resolves a rate, so one
 * is always available here.
 */
export function getContentType(
  format: BytePlusTTSAudioFormat,
  sampleRate?: number,
): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg_opus':
      return 'audio/ogg;codecs=opus'
    case 'pcm':
      return `audio/L16;rate=${sampleRate ?? 24000}`
  }
}

/**
 * Coerce a `duration` / `original_duration` field to a usable number of
 * seconds.
 *
 * Both are documented as float **seconds**, so this only parses the string
 * form and drops values that can't be a length (zero, negative, non-numeric).
 * Note that `duration` may legitimately exceed
 * {@link BYTEPLUS_TTS_MAX_OUTPUT_SECONDS} — a clip synthesised at
 * `speech_rate: -50` runs at half speed, so up to 120 s of billed audio can
 * be delivered as up to 240 s of playback. Do not "correct" a large value
 * here; the cap applies to `original_duration`.
 *
 * The subtitle timings are the mixed-unit exception: those are milliseconds
 * and are passed through untouched on {@link BytePlusTTSResult.subtitle}.
 */
export function toDurationSeconds(
  raw: number | string | undefined,
): number | undefined {
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  return value
}

/**
 * Creates a BytePlus Seed Speech TTS adapter with an explicit API key.
 *
 * The key is the **Seed Speech** key, not the Ark key used by the chat, image
 * and video adapters.
 *
 * @example
 * ```ts
 * const adapter = createBytePlusSpeech('seed-audio-1.0', process.env.BYTEPLUS_VOICE_API_KEY!)
 * ```
 */
export function createBytePlusSpeech<
  TModel extends BytePlusTTSModel = BytePlusTTSModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<BytePlusVoiceConfig, 'apiKey'>,
): BytePlusTTSAdapter<TModel> {
  return new BytePlusTTSAdapter(model, { ...config, apiKey })
}

/**
 * Creates a BytePlus Seed Speech TTS adapter, reading the API key from
 * `BYTEPLUS_VOICE_API_KEY`.
 *
 * @throws Error if `BYTEPLUS_VOICE_API_KEY` is not set.
 */
export function byteplusSpeech<
  TModel extends BytePlusTTSModel = BytePlusTTSModel,
>(
  model: TModel,
  config?: Omit<BytePlusVoiceConfig, 'apiKey'>,
): BytePlusTTSAdapter<TModel> {
  return createBytePlusSpeech(model, getBytePlusVoiceApiKeyFromEnv(), config)
}
