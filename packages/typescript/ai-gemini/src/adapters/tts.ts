import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type { GEMINI_TTS_MODELS, GeminiTTSVoice } from '../model-meta'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { GoogleGenAI, SpeechConfig } from '@google/genai'
import type { GeminiClientConfig } from '../utils'

/**
 * Configuration for a single speaker in a multi-speaker dialogue.
 * Supported by Gemini 3.1 Flash TTS Preview and the 2.5 TTS models.
 */
export interface GeminiSpeakerVoiceConfig {
  /** A name used in the prompt to refer to this speaker */
  speaker: string
  /** Voice configuration for this speaker */
  voiceConfig: {
    prebuiltVoiceConfig: {
      voiceName: GeminiTTSVoice
    }
  }
}

/**
 * Provider-specific options for Gemini TTS
 *
 * @experimental Gemini TTS is an experimental feature.
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-tts-preview
 */
export interface GeminiTTSProviderOptions {
  /**
   * Voice configuration for single-speaker TTS.
   * Choose from 30 available voices with different characteristics.
   *
   * Use `multiSpeakerVoiceConfig` instead for dialogues.
   */
  voiceConfig?: {
    prebuiltVoiceConfig?: {
      /**
       * The voice name to use for speech synthesis.
       * @see https://ai.google.dev/gemini-api/docs/speech-generation#voices
       */
      voiceName?: GeminiTTSVoice
    }
  }

  /**
   * Multi-speaker voice configuration (up to 2 speakers).
   * Supported by Gemini 3.1 Flash TTS Preview and the 2.5 TTS models.
   *
   * Each speaker's lines in the prompt are prefixed with the name defined
   * here, e.g.:
   *
   * ```text
   * Joe: Hey, how's it going?
   * Jane: Not bad, you?
   * ```
   */
  multiSpeakerVoiceConfig?: {
    speakerVoiceConfigs: Array<GeminiSpeakerVoiceConfig>
  }

  /**
   * System instruction for controlling speech style.
   * Use natural language to describe the desired speaking style,
   * pace, tone, accent, or other characteristics.
   *
   * With Gemini 3.1 Flash TTS, you can also use inline audio tags like
   * `[whispering]`, `[laughs]`, `[excited]` directly in the input text
   * to control delivery.
   *
   * @example "Speak slowly and calmly, as if telling a bedtime story"
   * @example "Use an upbeat, enthusiastic tone with moderate pace"
   * @example "Speak with a British accent"
   */
  systemInstruction?: string

  /**
   * Language code hint for the speech synthesis.
   * Gemini 3.1 Flash TTS supports 70+ languages with auto-detection;
   * the 2.5 TTS models support 24 languages.
   *
   * @example "en-US" for American English
   * @example "es-ES" for Spanish (Spain)
   * @example "ja-JP" for Japanese
   */
  languageCode?: string
}

/**
 * Configuration for Gemini TTS adapter
 *
 * @experimental Gemini TTS is an experimental feature.
 */
export interface GeminiTTSConfig extends GeminiClientConfig {}

/** Model type for Gemini TTS */
export type GeminiTTSModel = (typeof GEMINI_TTS_MODELS)[number]

/**
 * Gemini Text-to-Speech Adapter
 *
 * Tree-shakeable adapter for Gemini TTS functionality.
 *
 * **IMPORTANT**: Gemini TTS uses the Live API (WebSocket-based) which requires
 * different handling than traditional REST APIs. This adapter provides a
 * simplified interface but may have limitations.
 *
 * @experimental Gemini TTS is an experimental feature and may change.
 *
 * Models:
 * - gemini-2.5-flash-preview-tts
 */
export class GeminiTTSAdapter<
  TModel extends GeminiTTSModel,
> extends BaseTTSAdapter<TModel, GeminiTTSProviderOptions> {
  readonly name = 'gemini' as const

  private client: GoogleGenAI

  constructor(config: GeminiTTSConfig, model: TModel) {
    super(config, model)
    this.client = createGeminiClient(config)
  }

  /**
   * Generate speech from text using Gemini's TTS model.
   *
   * @experimental This implementation is experimental and may change.
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  async generateSpeech(
    options: TTSOptions<GeminiTTSProviderOptions>,
  ): Promise<TTSResult> {
    const { model, text, modelOptions, voice } = options

    const speechConfig: SpeechConfig = {}

    if (modelOptions?.multiSpeakerVoiceConfig) {
      speechConfig.multiSpeakerVoiceConfig =
        modelOptions.multiSpeakerVoiceConfig
    } else {
      // Honor the standard TTSOptions.voice (used by every other TTS adapter)
      // as a fallback for the prebuilt voice name. If an explicit
      // modelOptions.voiceConfig is supplied it wins.
      const voiceName = (voice as GeminiTTSVoice | undefined) ?? 'Kore'
      speechConfig.voiceConfig = modelOptions?.voiceConfig ?? {
        prebuiltVoiceConfig: { voiceName },
      }
    }

    if (modelOptions?.languageCode) {
      speechConfig.languageCode = modelOptions.languageCode
    }

    const response = await this.client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig,
        // systemInstruction belongs inside `config` per the @google/genai
        // contract — matches sibling Gemini adapters (summarize, text).
        ...(modelOptions?.systemInstruction && {
          systemInstruction: modelOptions.systemInstruction,
        }),
      },
    })

    // Extract audio data from response
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts

    if (!parts || parts.length === 0) {
      throw new Error('No audio output received from Gemini TTS')
    }

    // Look for inline data (audio)
    const audioPart = parts.find((part: any) =>
      part.inlineData?.mimeType?.startsWith('audio/'),
    )

    if (!audioPart || !audioPart.inlineData || !audioPart.inlineData.data) {
      throw new Error('No audio data in Gemini TTS response')
    }

    const audioBase64 = audioPart.inlineData.data
    const mimeType = audioPart.inlineData.mimeType || 'audio/wav'

    // Gemini TTS models return raw 16-bit LE PCM with a mime type like
    // `audio/L16;codec=pcm;rate=24000`. That isn't playable in an <audio>
    // element and the bare string isn't a usable file extension, so we
    // prepend a RIFF/WAV header here and normalize the result to audio/wav.
    const pcm = parsePcmMimeType(mimeType)
    if (pcm) {
      const wavBase64 = wrapPcmBase64AsWav(audioBase64, pcm.sampleRate)
      return {
        id: generateId(this.name),
        model,
        audio: wavBase64,
        format: 'wav',
        contentType: 'audio/wav',
      }
    }

    const format = mimeType.split('/')[1] || 'wav'

    return {
      id: generateId(this.name),
      model,
      audio: audioBase64,
      format,
      contentType: mimeType,
    }
  }
}

function parsePcmMimeType(
  mimeType: string,
): { sampleRate: number; channels: number } | undefined {
  const normalized = mimeType.toLowerCase()
  const isPcm =
    normalized.startsWith('audio/l16') || normalized.includes('codec=pcm')
  if (!isPcm) return undefined

  const rateMatch = /rate=(\d+)/.exec(normalized)
  const channelsMatch = /channels=(\d+)/.exec(normalized)
  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
    channels: channelsMatch ? Number(channelsMatch[1]) : 1,
  }
}

function wrapPcmBase64AsWav(
  pcmBase64: string,
  sampleRate: number,
  channels = 1,
): string {
  const pcmBytes =
    typeof Buffer !== 'undefined'
      ? new Uint8Array(Buffer.from(pcmBase64, 'base64'))
      : decodeBase64(pcmBase64)

  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcmBytes.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  new Uint8Array(buffer, 44).set(pcmBytes)

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64')
  }
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

/**
 * Creates a Gemini TTS adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @experimental Gemini TTS is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'gemini-2.5-flash-preview-tts')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini TTS adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGeminiSpeech('gemini-2.5-flash-preview-tts', "your-api-key");
 *
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Hello, world!'
 * });
 * ```
 */
export function createGeminiSpeech<TModel extends GeminiTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiTTSConfig, 'apiKey'>,
): GeminiTTSAdapter<TModel> {
  return new GeminiTTSAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Gemini speech adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * @experimental Gemini TTS is an experimental feature and may change.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'gemini-2.5-flash-preview-tts')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini speech adapter instance with resolved types
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY from environment
 * const adapter = geminiSpeech('gemini-2.5-flash-preview-tts');
 *
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Welcome to TanStack AI!'
 * });
 * ```
 */
export function geminiSpeech<TModel extends GeminiTTSModel>(
  model: TModel,
  config?: Omit<GeminiTTSConfig, 'apiKey'>,
): GeminiTTSAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiSpeech(model, apiKey, config)
}
