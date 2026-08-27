import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { arrayBufferToBase64, generateId, getGrokApiKeyFromEnv } from '../utils'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { GrokTTSModel } from '../model-meta'
import type {
  GrokTTSCodec,
  GrokTTSProviderOptions,
} from '../audio/tts-provider-options'

const DEFAULT_GROK_BASE_URL = 'https://api.x.ai/v1'

export interface GrokSpeechConfig {
  apiKey: string
  baseURL?: string
  /** Additional headers to merge into every request (e.g., test IDs). */
  defaultHeaders?: Record<string, string>
}

export class GrokSpeechAdapter<
  TModel extends GrokTTSModel,
> extends BaseTTSAdapter<TModel, GrokTTSProviderOptions> {
  readonly name = 'grok' as const

  private readonly apiKey: string
  private readonly baseURL: string
  private readonly defaultHeaders: Record<string, string>

  constructor(config: GrokSpeechConfig, model: TModel) {
    super(model, config)
    this.apiKey = config.apiKey
    this.baseURL = (config.baseURL ?? DEFAULT_GROK_BASE_URL).replace(/\/+$/, '')
    this.defaultHeaders = config.defaultHeaders ?? {}
  }

  async generateSpeech(
    options: TTSOptions<GrokTTSProviderOptions>,
  ): Promise<TTSResult> {
    const { logger } = options
    const { model, text, voice, format, modelOptions } = options

    logger.request(`activity=generateSpeech provider=grok model=${model}`, {
      provider: 'grok',
      model,
    })

    const { body, codec, sampleRateForContentType } = buildTTSRequestBody({
      text,
      voice,
      format,
      modelOptions,
    })

    try {
      const response = await fetch(`${this.baseURL}/tts`, {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Grok TTS request failed: ${response.status} ${errorText}`,
        )
      }

      const arrayBuffer = await response.arrayBuffer()
      const audio = arrayBufferToBase64(arrayBuffer)

      return {
        id: generateId(this.name),
        model,
        audio,
        format: codec,
        contentType: getContentType(codec, sampleRateForContentType),
      }
    } catch (error) {
      logger.errors('grok.generateSpeech fatal', {
        error,
        source: 'grok.generateSpeech',
      })
      throw error
    }
  }
}

export function buildTTSRequestBody(options: {
  text: string
  voice: string | undefined
  format: TTSOptions['format'] | undefined
  modelOptions: GrokTTSProviderOptions | undefined
}): {
  body: Record<string, unknown>
  codec: GrokTTSCodec
  sampleRateForContentType: number
} {
  const { text, voice, format, modelOptions } = options

  const codec = pickCodec(modelOptions?.codec, format)

  const callerSampleRate = modelOptions?.sample_rate
  const pcmDefault = 24000
  const needsRateInContentType = codec === 'pcm'

  const outputFormat: Record<string, unknown> = { codec }
  if (callerSampleRate !== undefined) {
    outputFormat.sample_rate = callerSampleRate
  } else if (needsRateInContentType) {
    outputFormat.sample_rate = pcmDefault
  }
  if (codec === 'mp3' && modelOptions?.bit_rate !== undefined) {
    outputFormat.bit_rate = modelOptions.bit_rate
  }

  const sampleRateForContentType = callerSampleRate ?? pcmDefault

  const body: Record<string, unknown> = {
    text,
    voice_id: voice ?? 'eve',
    language: modelOptions?.language ?? 'en',
    output_format: outputFormat,
  }
  if (modelOptions?.optimize_streaming_latency !== undefined) {
    body.optimize_streaming_latency = modelOptions.optimize_streaming_latency
  }
  if (modelOptions?.text_normalization !== undefined) {
    body.text_normalization = modelOptions.text_normalization
  }

  return { body, codec, sampleRateForContentType }
}

function pickCodec(
  codecOverride: GrokTTSCodec | undefined,
  format: TTSOptions['format'] | undefined,
): GrokTTSCodec {
  if (codecOverride) return codecOverride
  if (!format) return 'mp3'
  switch (format) {
    case 'mp3':
    case 'wav':
    case 'pcm':
      return format
    case 'flac':
    case 'opus':
    case 'aac':
      return 'mp3'
    default:
      return 'mp3'
  }
}

export function getContentType(
  codec: GrokTTSCodec,
  sampleRate: number,
): string {
  switch (codec) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'pcm':
      // `audio/L16` requires a `rate` parameter per RFC 3551/3555.
      return `audio/L16;rate=${sampleRate}`
    case 'mulaw':
      return sampleRate === 8000
        ? 'audio/basic'
        : `audio/PCMU;rate=${sampleRate}`
    case 'alaw':
      return sampleRate === 8000
        ? 'audio/x-alaw-basic'
        : `audio/PCMA;rate=${sampleRate}`
  }
}

export function createGrokSpeech<TModel extends GrokTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokSpeechConfig, 'apiKey'>,
): GrokSpeechAdapter<TModel> {
  return new GrokSpeechAdapter({ apiKey, ...config }, model)
}

export function grokSpeech<TModel extends GrokTTSModel>(
  model: TModel,
  config?: Omit<GrokSpeechConfig, 'apiKey'>,
): GrokSpeechAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokSpeech(model, apiKey, config)
}
