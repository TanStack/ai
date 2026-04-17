import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import {
  arrayBufferToBase64,
  buildHeaders,
  generateId,
  getElevenLabsApiKeyFromEnv,
  parseOutputFormat,
  postForAudio,
  resolveBaseUrl,
} from '../utils'
import type {
  ElevenLabsClientConfig,
} from '../utils'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type {
  ElevenLabsOutputFormat,
  ElevenLabsTTSModel,
} from '../model-meta'

/**
 * Voice settings accepted by ElevenLabs TTS.
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export interface ElevenLabsVoiceSettings {
  /** 0–1, default 0.5 */
  stability?: number
  /** 0–1, default 0.75 */
  similarity_boost?: number
  /** 0+, default 0 */
  style?: number
  /** default 1.0 */
  speed?: number
  /** default true */
  use_speaker_boost?: boolean
}

/**
 * Provider-specific options for ElevenLabs text-to-speech.
 */
export interface ElevenLabsSpeechProviderOptions {
  /**
   * ElevenLabs requires a voice to synthesize. You can either pass the voice
   * here or on the `voice` field of `generateSpeech({...})`.
   *
   * Grab voice IDs from the "Voices" section of the ElevenLabs app or the
   * `/v1/voices` endpoint.
   */
  voiceId?: string

  /**
   * Output audio format encoded as `codec_samplerate[_bitrate]`.
   * Defaults to `mp3_44100_128`.
   */
  outputFormat?: ElevenLabsOutputFormat

  /** Voice-setting overrides */
  voiceSettings?: ElevenLabsVoiceSettings

  /**
   * ISO 639-1 language code to enforce language detection (e.g. 'en', 'ja').
   */
  languageCode?: string

  /** Optional seed for deterministic sampling (0–4294967295). */
  seed?: number

  /** Previous text for stitching adjacent clips */
  previousText?: string
  /** Next text for stitching adjacent clips */
  nextText?: string

  /** Enable logging (defaults to true) */
  enableLogging?: boolean

  /** Streaming latency optimisation level 0–4 */
  optimizeStreamingLatency?: number

  /**
   * Text normalisation toggle — 'auto' | 'on' | 'off'
   * @default 'auto'
   */
  applyTextNormalization?: 'auto' | 'on' | 'off'
  /** Language-specific text normalisation */
  applyLanguageTextNormalization?: boolean
}

export interface ElevenLabsSpeechConfig extends ElevenLabsClientConfig {}

/**
 * ElevenLabs text-to-speech adapter.
 *
 * @example
 * ```typescript
 * const adapter = elevenlabsSpeech('eleven_v3')
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Hello, world!',
 *   voice: 'JBFqnCBsd6RMkjVDRZzb', // voice_id
 * })
 * ```
 *
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export class ElevenLabsSpeechAdapter<
  TModel extends ElevenLabsTTSModel,
> extends BaseTTSAdapter<TModel, ElevenLabsSpeechProviderOptions> {
  readonly name = 'elevenlabs' as const

  constructor(
    config: ElevenLabsSpeechConfig,
    model: TModel,
  ) {
    super(config, model)
  }

  async generateSpeech(
    options: TTSOptions<ElevenLabsSpeechProviderOptions>,
  ): Promise<TTSResult> {
    const voiceId = options.voice ?? options.modelOptions?.voiceId
    if (!voiceId) {
      throw new Error(
        'ElevenLabs TTS requires a voice id. Pass it via `voice` on generateSpeech() or `modelOptions.voiceId`.',
      )
    }

    const config = this.config as ElevenLabsSpeechConfig
    const outputFormat =
      options.modelOptions?.outputFormat ??
      mapCommonFormat(options.format) ??
      'mp3_44100_128'

    const url = `${resolveBaseUrl(config)}/v1/text-to-speech/${encodeURIComponent(
      voiceId,
    )}?output_format=${encodeURIComponent(outputFormat)}`

    const body = buildBody(options, this.model)

    const { bytes, contentType } = await postForAudio(
      url,
      buildHeaders(config),
      JSON.stringify(body),
    )

    const { format, contentType: fallbackContentType } = parseOutputFormat(
      outputFormat,
    )

    return {
      id: generateId(this.name),
      model: this.model,
      audio: arrayBufferToBase64(bytes),
      format,
      contentType: contentType || fallbackContentType,
    }
  }
}

function buildBody(
  options: TTSOptions<ElevenLabsSpeechProviderOptions>,
  model: string,
): Record<string, unknown> {
  const { text, speed, modelOptions } = options
  const settings: ElevenLabsVoiceSettings = { ...modelOptions?.voiceSettings }
  if (speed != null && settings.speed == null) {
    settings.speed = speed
  }

  const body: Record<string, unknown> = {
    text,
    model_id: model,
  }

  if (Object.keys(settings).length > 0) {
    body.voice_settings = settings
  }
  if (modelOptions?.languageCode) body.language_code = modelOptions.languageCode
  if (modelOptions?.seed != null) body.seed = modelOptions.seed
  if (modelOptions?.previousText) body.previous_text = modelOptions.previousText
  if (modelOptions?.nextText) body.next_text = modelOptions.nextText
  if (modelOptions?.applyTextNormalization) {
    body.apply_text_normalization = modelOptions.applyTextNormalization
  }
  if (modelOptions?.applyLanguageTextNormalization != null) {
    body.apply_language_text_normalization =
      modelOptions.applyLanguageTextNormalization
  }
  if (modelOptions?.enableLogging != null) {
    body.enable_logging = modelOptions.enableLogging
  }
  if (modelOptions?.optimizeStreamingLatency != null) {
    body.optimize_streaming_latency = modelOptions.optimizeStreamingLatency
  }

  return body
}

function mapCommonFormat(
  format: TTSOptions['format'],
): ElevenLabsOutputFormat | undefined {
  if (!format) return undefined
  switch (format) {
    case 'mp3':
      return 'mp3_44100_128'
    case 'wav':
      return 'pcm_44100'
    case 'pcm':
      return 'pcm_44100'
    case 'opus':
      return 'opus_48000_128'
    default:
      return undefined
  }
}

/**
 * Create an ElevenLabs TTS adapter with an explicit API key.
 */
export function createElevenLabsSpeech<TModel extends ElevenLabsTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsSpeechConfig, 'apiKey'>,
): ElevenLabsSpeechAdapter<TModel> {
  return new ElevenLabsSpeechAdapter({ apiKey, ...config }, model)
}

/**
 * Create an ElevenLabs TTS adapter, pulling the API key from the environment.
 *
 * Looks for `ELEVENLABS_API_KEY` or `ELEVEN_API_KEY`.
 */
export function elevenlabsSpeech<TModel extends ElevenLabsTTSModel>(
  model: TModel,
  config?: Omit<ElevenLabsSpeechConfig, 'apiKey'>,
): ElevenLabsSpeechAdapter<TModel> {
  const apiKey = getElevenLabsApiKeyFromEnv()
  return createElevenLabsSpeech(model, apiKey, config)
}
