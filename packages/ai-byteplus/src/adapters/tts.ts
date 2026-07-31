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
 * **Open question — do not change without a doc citation or a live call.**
 * The Phase 0 research notes record this as `text_prompt`, but BytePlus'
 * published Seed Speech samples are inconsistent about whether the synthesis
 * endpoint takes `text_prompt` (the reference-audio-style naming) or a plain
 * `text`. No Seed Speech key was available to settle it. Isolating the name
 * here keeps the fix to a one-line change once the research agent lands a
 * citation.
 */
const TTS_TEXT_FIELD = 'text_prompt' satisfies keyof BytePlusTTSCreateRequest

/**
 * Voice used when neither `TTSOptions.voice` nor `modelOptions.speaker` is
 * set — the English female "Stokie" voice from the TTS 2.0 generation.
 */
export const BYTEPLUS_DEFAULT_TTS_SPEAKER = 'en_female_stokie_uranus_bigtts'

/**
 * Hard cap on the length of a single Seed Speech synthesis, in seconds.
 * Longer scripts must be split across calls and stitched client-side.
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
 *   {@link BYTEPLUS_TTS_MAX_OUTPUT_SECONDS} seconds of audio; the service
 *   truncates or rejects longer scripts.
 *
 * Streaming synthesis (`tts/unidirectional` and the WebSocket API) is not
 * covered by this adapter.
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

    const { body, audioFormat } = buildTTSRequestBody({
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
          headers: bytePlusVoiceHeaders(this.apiKey, this.defaultHeaders),
          body: JSON.stringify(body),
        },
      )

      const payload = await readJsonBody(response)

      if (!response.ok) {
        throw bytePlusVoiceError(response.status, payload, 'text-to-speech')
      }

      const data = payload as BytePlusTTSCreateResponse

      // A 200 can still carry the numeric error envelope, so treat a missing
      // audio payload as a failure and let `bytePlusVoiceError` surface
      // whatever `code`/`message` came back.
      if (typeof data.audio !== 'string' || data.audio.length === 0) {
        throw bytePlusVoiceError(response.status, payload, 'text-to-speech')
      }

      const duration = toDurationSeconds(data.duration, logger)

      return {
        id: generateId(this.name),
        model,
        audio: data.audio,
        format: audioFormat,
        contentType: getContentType(audioFormat, modelOptions?.sample_rate),
        ...(duration !== undefined && { duration }),
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
 * Build the JSON body for `POST /api/v3/tts/create`, resolving the speaker,
 * output format and rate fields in one place.
 *
 * Returns the request `body` plus the resolved `audioFormat`, which the caller
 * reports on the result and turns into a `contentType`.
 */
export function buildTTSRequestBody(options: {
  model: string
  text: string
  voice: string | undefined
  format: TTSOptions['format'] | undefined
  speed: number | undefined
  modelOptions: BytePlusTTSProviderOptions | undefined
  logger: InternalLogger
}): { body: BytePlusTTSCreateRequest; audioFormat: BytePlusTTSAudioFormat } {
  const { model, text, voice, format, speed, modelOptions, logger } = options

  const audioFormat = pickAudioFormat(modelOptions?.format, format, logger)

  const audioConfig: BytePlusTTSAudioConfig = { format: audioFormat }
  if (modelOptions?.sample_rate !== undefined) {
    audioConfig.sample_rate = modelOptions.sample_rate
  }
  if (modelOptions?.pitch_rate !== undefined) {
    audioConfig.pitch_rate = modelOptions.pitch_rate
  }
  if (modelOptions?.loudness_rate !== undefined) {
    audioConfig.loudness_rate = modelOptions.loudness_rate
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
    speaker: modelOptions?.speaker ?? voice ?? BYTEPLUS_DEFAULT_TTS_SPEAKER,
    audio_config: audioConfig,
  }
  if (modelOptions?.enable_subtitle !== undefined) {
    body.enable_subtitle = modelOptions.enable_subtitle
  }

  return { body, audioFormat }
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
 * What is **documented** is only the numeric range, `-50`..`100`. The
 * multiplier anchors this formula reads into it — `-50` ≈ 0.5× and `100` ≈ 2×
 * — are **inferred** from that range and from how the same field behaves on
 * sibling Volcengine TTS endpoints; they have not been confirmed against a
 * live Seed Speech response. If the true curve turns out to be non-linear,
 * only this function changes.
 *
 * The clamp is deliberately conservative. `TTSOptions.speed` spans a wider
 * 0.25×–4× than the documented range covers, so anything outside 0.5×–2×
 * clamps (and warns) rather than erroring. Note that at least one reseller
 * lists `speech_rate` on `seed-audio-1.0` as accepting `-50`..`1000`; until
 * that is confirmed in BytePlus' own docs this stays pinned to the documented
 * `100` ceiling, since over-sending is the failure mode that produces a 400.
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
 * MIME type for a Seed Speech output format.
 *
 * `pcm` is raw little-endian 16-bit samples, so its media type has to carry
 * the sample rate (RFC 3551/3555). When the caller didn't pin one we report
 * the service default of 24 kHz.
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
 * Normalise the `duration` Seed Speech reports into seconds.
 *
 * The published docs don't state the unit and no Seed Speech key was
 * available to settle it, but the endpoint's hard
 * {@link BYTEPLUS_TTS_MAX_OUTPUT_SECONDS} second output cap separates the two
 * candidates: a value above the cap cannot be seconds, so it is milliseconds.
 *
 * Two edges worth knowing:
 * - A clip of 120 ms or shorter is genuinely ambiguous and is reported as
 *   seconds. In practice no synthesis is that short.
 * - A value just over the cap (say `121`) is read as milliseconds and becomes
 *   `0.121 s`. That is the right call if the unit is milliseconds and visibly
 *   wrong if it isn't — which is why the millisecond branch warns rather than
 *   converting silently. If the warning shows up in the field against a real
 *   key, the unit question is settled and this function collapses to one
 *   branch.
 */
export function toDurationSeconds(
  raw: number | string | undefined,
  logger?: InternalLogger,
): number | undefined {
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  if (value <= BYTEPLUS_TTS_MAX_OUTPUT_SECONDS) return value

  const seconds = value / 1000
  logger?.warn(
    `BytePlus Seed Speech reported duration=${value}, which exceeds the ${BYTEPLUS_TTS_MAX_OUTPUT_SECONDS}s output cap — reading it as milliseconds (${seconds}s). The unit is undocumented; please report this so it can be pinned.`,
    { provider: 'byteplus', rawDuration: raw, durationSeconds: seconds },
  )
  return seconds
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
