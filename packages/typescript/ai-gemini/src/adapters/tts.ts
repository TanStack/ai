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

/**
 * Provider-specific options for Gemini TTS
 *
 * @experimental Gemini TTS is an experimental feature and uses the Live API.
 */
export interface GeminiTTSProviderOptions {
  /**
   * Voice configuration for TTS.
   * Note: Gemini TTS uses the Live API which has limited configuration options.
   */
  voiceConfig?: {
    prebuiltVoiceConfig?: {
      voiceName?: string
    }
  }
}

/**
 * Configuration for Gemini TTS adapter
 *
 * @experimental Gemini TTS is an experimental feature.
 */
export interface GeminiTTSConfig extends GeminiClientConfig {}

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
export class GeminiTTSAdapter extends BaseTTSAdapter<
  typeof GEMINI_TTS_MODELS,
  GeminiTTSProviderOptions
> {
  readonly name = 'gemini'
  readonly models = GEMINI_TTS_MODELS

  private client: GoogleGenAI

  constructor(config: GeminiTTSConfig) {
    super(config)
    this.client = createGeminiClient(config)
  }

  /**
   * Generate speech from text using Gemini's TTS model.
   *
   * Note: Gemini's TTS functionality uses the Live API, which is WebSocket-based.
   * This implementation uses the multimodal generation endpoint with audio output
   * configuration, which may have different capabilities than the full Live API.
   *
   * @experimental This implementation is experimental and may change.
   */
  async generateSpeech(
    options: TTSOptions<GeminiTTSProviderOptions>,
  ): Promise<TTSResult> {
    const { model, text, providerOptions } = options

    // Use Gemini's multimodal content generation with audio output
    // Note: This requires the model to support audio output
    const voiceConfig = providerOptions?.voiceConfig || {
      prebuiltVoiceConfig: {
        voiceName: 'Kore', // Default Gemini voice
      },
    }

    const response = await this.client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: `Please speak the following text: ${text}` }],
        },
      ],
      config: {
        // Configure for audio output
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig,
        },
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
 * Creates a Gemini TTS adapter with explicit API key
 *
 * @experimental Gemini TTS is an experimental feature and may change.
 *
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini TTS adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGeminiTTS("your-api-key");
 *
 * const result = await ai({
 *   adapter,
 *   model: 'gemini-2.5-flash-preview-tts',
 *   text: 'Hello, world!'
 * });
 * ```
 */
export function createGeminiTTS(
  apiKey: string,
  config?: Omit<GeminiTTSConfig, 'apiKey'>,
): GeminiTTSAdapter {
  return new GeminiTTSAdapter({ apiKey, ...config })
}

/**
 * Creates a Gemini TTS adapter with automatic API key detection from environment variables.
 *
 * @experimental Gemini TTS is an experimental feature and may change.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini TTS adapter instance
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY from environment
 * const adapter = geminiTTS();
 *
 * const result = await ai({
 *   adapter,
 *   model: 'gemini-2.5-flash-preview-tts',
 *   text: 'Welcome to TanStack AI!'
 * });
 * ```
 */
export function geminiTTS(
  config?: Omit<GeminiTTSConfig, 'apiKey'>,
): GeminiTTSAdapter {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiTTS(apiKey, config)
}
