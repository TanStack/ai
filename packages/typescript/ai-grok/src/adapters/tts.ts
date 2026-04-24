import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { generateId, getGrokApiKeyFromEnv } from '../utils'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { GrokTTSModel } from '../model-meta'
import type {
  GrokTTSCodec,
  GrokTTSProviderOptions,
  GrokTTSVoice,
} from '../audio/tts-provider-options'

const DEFAULT_GROK_BASE_URL = 'https://api.x.ai/v1'

/**
 * Configuration for the Grok TTS adapter.
 *
 * Unlike chat/image/summarize adapters, TTS does not use the OpenAI SDK
 * because xAI's `/v1/tts` endpoint is not OpenAI-compatible. This config
 * is a minimal subset suitable for direct `fetch` calls.
 */
export interface GrokSpeechConfig {
  apiKey: string
  baseURL?: string
  /** Additional headers to merge into every request (e.g., test IDs). */
  defaultHeaders?: Record<string, string>
}

/**
 * Grok Text-to-Speech Adapter.
 *
 * Talks to `POST {baseURL}/tts` per
 * https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
 */
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

    const codec = pickCodec(modelOptions?.codec, format)
    const outputFormat: Record<string, unknown> = { codec }
    if (modelOptions?.sample_rate !== undefined) {
      outputFormat.sample_rate = modelOptions.sample_rate
    }
    if (codec === 'mp3' && modelOptions?.bit_rate !== undefined) {
      outputFormat.bit_rate = modelOptions.bit_rate
    }

    const body: Record<string, unknown> = {
      text,
      voice_id: (voice as GrokTTSVoice | undefined) ?? 'eve',
      language: modelOptions?.language ?? 'en',
      output_format: outputFormat,
    }
    if (modelOptions?.optimize_streaming_latency !== undefined) {
      body.optimize_streaming_latency = modelOptions.optimize_streaming_latency
    }
    if (modelOptions?.text_normalization !== undefined) {
      body.text_normalization = modelOptions.text_normalization
    }

    try {
      const response = await fetch(`${this.baseURL}/tts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...this.defaultHeaders,
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
      const audio = Buffer.from(arrayBuffer).toString('base64')

      return {
        id: generateId(this.name),
        model,
        audio,
        format: codec,
        contentType: getContentType(codec),
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

/**
 * Maps the cross-provider `TTSOptions.format` onto Grok's supported codecs.
 * `opus` and `aac` are not supported by Grok — we fall back to mp3.
 * An explicit `modelOptions.codec` always wins.
 */
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
      // Grok doesn't support flac output; fall back to mp3.
      return 'mp3'
    case 'opus':
    case 'aac':
      return 'mp3'
    default:
      return 'mp3'
  }
}

function getContentType(codec: GrokTTSCodec): string {
  switch (codec) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'pcm':
      return 'audio/pcm'
    case 'mulaw':
      return 'audio/basic'
    case 'alaw':
      return 'audio/x-alaw-basic'
  }
}

/**
 * Creates a Grok speech (TTS) adapter with an explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createGrokSpeech('grok-tts', 'xai-...')
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Hello from Grok',
 *   voice: 'eve',
 * })
 * ```
 */
export function createGrokSpeech<TModel extends GrokTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokSpeechConfig, 'apiKey'>,
): GrokSpeechAdapter<TModel> {
  return new GrokSpeechAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Grok speech (TTS) adapter, reading the API key from
 * `XAI_API_KEY` in the environment.
 *
 * @throws Error if `XAI_API_KEY` is not set.
 */
export function grokSpeech<TModel extends GrokTTSModel>(
  model: TModel,
  config?: Omit<GrokSpeechConfig, 'apiKey'>,
): GrokSpeechAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokSpeech(model, apiKey, config)
}
