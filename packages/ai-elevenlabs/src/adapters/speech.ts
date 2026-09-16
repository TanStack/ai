import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import {
  arrayBufferToBase64,
  createElevenLabsClient,
  generateId,
  parseOutputFormat,
  readStreamToArrayBuffer,
} from '../utils/client'
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { ElevenLabsClientConfig } from '../utils/client'
import type { ElevenLabsOutputFormat, ElevenLabsTTSModel } from '../model-meta'

/**
 * ElevenLabs voice settings overrides. All fields are optional — omitted
 * values fall back to the voice's stored defaults.
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export interface ElevenLabsVoiceSettings {
  /** Voice stability, 0..1. Default 0.5. */
  stability?: number
  /** Similarity boost, 0..1. Default 0.75. */
  similarityBoost?: number
  /** Style exaggeration, 0..1. Default 0. */
  style?: number
  /** Playback speed. Default 1.0. */
  speed?: number
  /** Clarity/presence boost. Default true. */
  useSpeakerBoost?: boolean
}

/**
 * Provider-specific TTS options. `voice` on `generateSpeech()` takes priority
 * over `voiceId` here, but we expose the same field for callers that prefer
 * to keep voice configuration inside the adapter config.
 */
export interface ElevenLabsSpeechProviderOptions {
  /** ElevenLabs voice ID to synthesize. Required if `generateSpeech().voice` is not set. */
  voiceId?: string
  /** Output audio format encoded as `codec_samplerate[_bitrate]`. Overrides `format`, including WAV wrapping. Defaults to `mp3_44100_128`. */
  outputFormat?: ElevenLabsOutputFormat
  /** Voice-settings overrides for this request only. */
  voiceSettings?: ElevenLabsVoiceSettings
  /** ISO-639-1 language code to enforce (e.g. `'en'`, `'ja'`). */
  languageCode?: string
  /** Deterministic sampling seed, 0..4294967295. */
  seed?: number
  /** Previous text for stitching adjacent clips. */
  previousText?: string
  /** Next text for stitching adjacent clips. */
  nextText?: string
  /** Previous request IDs for stitching (max 3). */
  previousRequestIds?: Array<string>
  /** Next request IDs for stitching (max 3). */
  nextRequestIds?: Array<string>
  /** Text normalization toggle. Default `'auto'`. */
  applyTextNormalization?: 'auto' | 'on' | 'off'
  /** Language-specific text normalization (currently Japanese only, adds latency). */
  applyLanguageTextNormalization?: boolean
  /** Latency optimization level, 0..4. */
  optimizeStreamingLatency?: number
  /** Enable logging. Set false for zero-retention mode (enterprise only). */
  enableLogging?: boolean
}

/**
 * ElevenLabs text-to-speech adapter built on the official
 * `@elevenlabs/elevenlabs-js` SDK.
 *
 * @example
 * ```ts
 * const adapter = elevenlabsSpeech('eleven_multilingual_v2')
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Hello, world!',
 *   voice: '21m00Tcm4TlvDq8ikWAM',
 * })
 * ```
 */
export class ElevenLabsSpeechAdapter<
  TModel extends ElevenLabsTTSModel,
> extends BaseTTSAdapter<TModel, ElevenLabsSpeechProviderOptions> {
  readonly name = 'elevenlabs' as const

  private readonly client: ElevenLabsClient

  constructor(model: TModel, config?: ElevenLabsClientConfig) {
    super(model, config ?? {})
    this.client = createElevenLabsClient(config)
  }

  async generateSpeech(
    options: TTSOptions<ElevenLabsSpeechProviderOptions>,
  ): Promise<TTSResult> {
    const { logger } = options
    logger.request(
      `activity=generateSpeech provider=elevenlabs model=${this.model}`,
      { provider: 'elevenlabs', model: this.model },
    )
    try {
      const voiceId = options.voice ?? options.modelOptions?.voiceId
      if (!voiceId) {
        throw new Error(
          'ElevenLabs TTS requires a voice. Pass `voice` on generateSpeech() or `voiceId` in modelOptions.',
        )
      }
      const {
        outputFormat,
        voiceSettings,
        languageCode,
        seed,
        previousText,
        nextText,
        previousRequestIds,
        nextRequestIds,
        applyTextNormalization,
        applyLanguageTextNormalization,
        optimizeStreamingLatency,
        enableLogging,
      } = options.modelOptions ?? {}
      const effectiveOutputFormat =
        outputFormat ?? inferOutputFormatFromResponseFormat(options.format)
      const wrapAsWav = outputFormat == null && options.format === 'wav'

      const stream = await this.client.textToSpeech.convert(voiceId, {
        text: options.text,
        modelId: this.model,
        ...(effectiveOutputFormat
          ? { outputFormat: effectiveOutputFormat }
          : {}),
        ...(voiceSettings
          ? { voiceSettings: mapVoiceSettings(voiceSettings, options.speed) }
          : options.speed != null
            ? { voiceSettings: { speed: options.speed } }
            : {}),
        ...(languageCode ? { languageCode } : {}),
        ...(seed != null ? { seed } : {}),
        ...(previousText ? { previousText } : {}),
        ...(nextText ? { nextText } : {}),
        ...(previousRequestIds ? { previousRequestIds } : {}),
        ...(nextRequestIds ? { nextRequestIds } : {}),
        ...(applyTextNormalization ? { applyTextNormalization } : {}),
        ...(applyLanguageTextNormalization != null
          ? { applyLanguageTextNormalization }
          : {}),
        ...(optimizeStreamingLatency != null
          ? { optimizeStreamingLatency }
          : {}),
        ...(enableLogging != null ? { enableLogging } : {}),
      })

      const buffer = await readStreamToArrayBuffer(stream)
      const base64 = arrayBufferToBase64(
        wrapAsWav ? wrapPcmAsWav(buffer) : buffer,
      )
      const { format, contentType } = wrapAsWav
        ? { format: 'wav', contentType: 'audio/wav' }
        : parseOutputFormat(effectiveOutputFormat)

      return {
        id: generateId(this.name),
        model: this.model,
        audio: base64,
        format,
        contentType,
      }
    } catch (error) {
      logger.errors('elevenlabs.generateSpeech fatal', {
        error,
        source: 'elevenlabs.generateSpeech',
      })
      throw error
    }
  }

  protected override generateId(): string {
    return generateId(this.name)
  }
}

function mapVoiceSettings(
  settings: ElevenLabsVoiceSettings,
  speedOverride: number | undefined,
): Record<string, unknown> {
  return {
    ...(settings.stability != null ? { stability: settings.stability } : {}),
    ...(settings.similarityBoost != null
      ? { similarityBoost: settings.similarityBoost }
      : {}),
    ...(settings.style != null ? { style: settings.style } : {}),
    ...(speedOverride != null
      ? { speed: speedOverride }
      : settings.speed != null
        ? { speed: settings.speed }
        : {}),
    ...(settings.useSpeakerBoost != null
      ? { useSpeakerBoost: settings.useSpeakerBoost }
      : {}),
  }
}

/**
 * Map the standard TTSOptions `format` (mp3/opus/aac/flac/wav/pcm) to a
 * reasonable ElevenLabs `outputFormat` so callers don't need to know the
 * full codec/samplerate string for the common case.
 */
function inferOutputFormatFromResponseFormat(
  format: TTSOptions['format'] | undefined,
): ElevenLabsOutputFormat | undefined {
  switch (format) {
    case 'mp3':
      return 'mp3_44100_128'
    case 'pcm':
    case 'wav':
      return 'pcm_44100'
    case 'opus':
      return 'opus_48000_128'
    case undefined:
      return undefined
    case 'aac':
    case 'flac':
    default:
      throw new Error(
        `ElevenLabs TTS does not support format '${format}'. Use mp3, pcm, opus, or wav.`,
      )
  }
}

/** Wrap ElevenLabs pcm_44100 (16-bit little-endian mono) in a RIFF/WAV container. */
function wrapPcmAsWav(pcm: ArrayBuffer): ArrayBuffer {
  const wav = new ArrayBuffer(44 + pcm.byteLength)
  const bytes = new Uint8Array(wav)
  const header = new DataView(wav)
  const encoder = new TextEncoder()
  bytes.set(encoder.encode('RIFF'), 0)
  header.setUint32(4, 36 + pcm.byteLength, true)
  bytes.set(encoder.encode('WAVEfmt '), 8)
  header.setUint32(16, 16, true) // PCM format chunk size
  header.setUint16(20, 1, true) // PCM encoding
  header.setUint16(22, 1, true) // mono
  header.setUint32(24, 44100, true) // sample rate
  header.setUint32(28, 44100 * 2, true) // bytes per second
  header.setUint16(32, 2, true) // bytes per sample
  header.setUint16(34, 16, true) // bits per sample
  bytes.set(encoder.encode('data'), 36)
  header.setUint32(40, pcm.byteLength, true)
  bytes.set(new Uint8Array(pcm), 44)
  return wav
}

/**
 * Create an ElevenLabs speech adapter using `ELEVENLABS_API_KEY` from env.
 */
export function elevenlabsSpeech<TModel extends ElevenLabsTTSModel>(
  model: TModel,
  config?: ElevenLabsClientConfig,
): ElevenLabsSpeechAdapter<TModel> {
  return new ElevenLabsSpeechAdapter(model, config)
}

/**
 * Create an ElevenLabs speech adapter with an explicit API key.
 */
export function createElevenLabsSpeech<TModel extends ElevenLabsTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsClientConfig, 'apiKey'>,
): ElevenLabsSpeechAdapter<TModel> {
  return new ElevenLabsSpeechAdapter(model, { apiKey, ...config })
}
