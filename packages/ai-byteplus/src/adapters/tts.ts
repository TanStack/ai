import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
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

const TTS_TEXT_FIELD = 'text_prompt' satisfies keyof BytePlusTTSCreateRequest

const DEFAULT_SAMPLE_RATE = 24000

function isZeroCode(code: number | string | undefined): boolean {
  if (code === undefined) return true
  return Number(code) === 0
}

export const BYTEPLUS_DEFAULT_TTS_SPEAKER = 'en_female_stokie_uranus_bigtts'

export const BYTEPLUS_TTS_MAX_OUTPUT_SECONDS = 120

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

      if (!isZeroCode(data.code)) {
        throw bytePlusVoiceError(response.status, payload, 'text-to-speech')
      }

      if (typeof data.audio !== 'string') {
        throw new Error(
          `BytePlus Seed Speech text-to-speech returned a success response ` +
            `with no audio (model ${model}).`,
        )
      }
      if (data.audio.length === 0) {
        throw new Error(
          `BytePlus Seed Speech text-to-speech returned a success response ` +
            `with no audio (model ${model}).`,
        )
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
        error: toRunErrorPayload(error, 'byteplus.generateSpeech failed'),
        source: 'byteplus.generateSpeech',
      })
      throw error
    }
  }
}

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

  const audioConfig = buildTTSAudioConfig({
    audioFormat,
    sampleRate,
    speed,
    modelOptions,
    logger,
  })

  const body: BytePlusTTSCreateRequest = {
    model,
    [TTS_TEXT_FIELD]: text,
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

function buildTTSAudioConfig(options: {
  audioFormat: BytePlusTTSAudioFormat
  sampleRate: number
  speed: number | undefined
  modelOptions: BytePlusTTSProviderOptions | undefined
  logger: InternalLogger
}): BytePlusTTSAudioConfig {
  const { audioFormat, sampleRate, speed, modelOptions, logger } = options
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
  return audioConfig
}

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

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? generateId('byteplus-tts')
}

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

export function toDurationSeconds(
  raw: number | string | undefined,
): number | undefined {
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (value === undefined) return undefined
  if (!Number.isFinite(value)) return undefined
  if (value <= 0) return undefined
  return value
}

export function createBytePlusSpeech<
  TModel extends BytePlusTTSModel = BytePlusTTSModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<BytePlusVoiceConfig, 'apiKey'>,
): BytePlusTTSAdapter<TModel> {
  return new BytePlusTTSAdapter(model, { ...config, apiKey })
}

export function byteplusSpeech<
  TModel extends BytePlusTTSModel = BytePlusTTSModel,
>(
  model: TModel,
  config?: Omit<BytePlusVoiceConfig, 'apiKey'>,
): BytePlusTTSAdapter<TModel> {
  return createBytePlusSpeech(model, getBytePlusVoiceApiKeyFromEnv(), config)
}
