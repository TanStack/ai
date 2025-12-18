import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { GEMINI_TTS_MODELS } from '../model-meta'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { GoogleGenAI } from '@google/genai'
import type { GeminiClientConfig } from '../utils'
import type { GeminiTTSVoice } from '../model-meta'

/**
 * Provider-specific options for Gemini TTS
 *
 * @experimental Gemini TTS is an experimental feature.
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
export interface GeminiTTSProviderOptions {
  /**
   * Voice configuration for TTS.
   * Choose from 30 available voices with different characteristics.
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
   * System instruction for controlling speech style.
   * Use natural language to describe the desired speaking style,
   * pace, tone, accent, or other characteristics.
   *
   * @example "Speak slowly and calmly, as if telling a bedtime story"
   * @example "Use an upbeat, enthusiastic tone with moderate pace"
   * @example "Speak with a British accent"
   */
  systemInstruction?: string

  /**
   * Language code hint for the speech synthesis.
   * Gemini TTS supports 24 languages and can auto-detect,
   * but you can provide a hint for better results.
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
    const { model, text, modelOptions } = options

    const voiceConfig = modelOptions?.voiceConfig || {
      prebuiltVoiceConfig: {
        voiceName: 'Kore' as const,
      },
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
        speechConfig: {
          voiceConfig,
          ...(modelOptions?.languageCode && {
            languageCode: modelOptions.languageCode,
          }),
        },
      },
      ...(modelOptions?.systemInstruction && {
        systemInstruction: modelOptions.systemInstruction,
      }),
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

    if (!audioPart || !('inlineData' in audioPart)) {
      throw new Error('No audio data in Gemini TTS response')
    }

    const inlineData = (audioPart as any).inlineData
    const audioBase64 = inlineData.data
    const mimeType = inlineData.mimeType || 'audio/wav'
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
