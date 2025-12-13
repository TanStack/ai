import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { OPENAI_TTS_MODELS } from '../model-meta'
import {
  createOpenAIClient,
  generateId,
  getOpenAIApiKeyFromEnv,
} from '../utils'
import {
  validateAudioInput,
  validateInstructions,
  validateSpeed,
} from '../audio/audio-provider-options'
import type {
  OpenAITTSFormat,
  OpenAITTSProviderOptions,
  OpenAITTSVoice,
} from '../audio/tts-provider-options'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIClientConfig } from '../utils'

/**
 * Configuration for OpenAI TTS adapter
 */
export interface OpenAITTSConfig extends OpenAIClientConfig {}

/**
 * OpenAI Text-to-Speech Adapter
 *
 * Tree-shakeable adapter for OpenAI TTS functionality.
 * Supports tts-1, tts-1-hd, and gpt-4o-audio-preview models.
 *
 * Features:
 * - Multiple voice options: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse
 * - Multiple output formats: mp3, opus, aac, flac, wav, pcm
 * - Speed control (0.25 to 4.0)
 */
export class OpenAITTSAdapter extends BaseTTSAdapter<
  typeof OPENAI_TTS_MODELS,
  OpenAITTSProviderOptions
> {
  readonly name = 'openai' as const
  readonly models = OPENAI_TTS_MODELS

  private client: OpenAI_SDK

  constructor(config: OpenAITTSConfig) {
    super(config)
    this.client = createOpenAIClient(config)
  }

  async generateSpeech(
    options: TTSOptions<OpenAITTSProviderOptions>,
  ): Promise<TTSResult> {
    const { model, text, voice, format, speed, providerOptions } = options

    // Validate inputs using existing validators
    const audioOptions = {
      input: text,
      model,
      voice: voice as OpenAITTSVoice,
      speed,
      response_format: format as OpenAITTSFormat,
      ...providerOptions,
    }

    validateAudioInput(audioOptions)
    validateSpeed(audioOptions)
    validateInstructions(audioOptions)

    // Build request
    const request: OpenAI_SDK.Audio.SpeechCreateParams = {
      model,
      input: text,
      voice: voice || 'alloy',
      response_format: format,
      speed,
      ...providerOptions,
    }

    // Call OpenAI API
    const response = await this.client.audio.speech.create(request)

    // Convert response to base64
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const outputFormat = format || 'mp3'
    const contentType = this.getContentType(outputFormat)

    return {
      id: generateId(this.name),
      model,
      audio: base64,
      format: outputFormat,
      contentType,
    }
  }

  private getContentType(format: string): string {
    const contentTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      opus: 'audio/opus',
      aac: 'audio/aac',
      flac: 'audio/flac',
      wav: 'audio/wav',
      pcm: 'audio/pcm',
    }
    return contentTypes[format] || 'audio/mpeg'
  }
}

/**
 * Creates an OpenAI TTS adapter with explicit API key
 *
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI TTS adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiTTS("sk-...");
 *
 * const result = await ai({
 *   adapter,
 *   model: 'tts-1-hd',
 *   text: 'Hello, world!',
 *   voice: 'nova'
 * });
 * ```
 */
export function createOpenaiTTS(
  apiKey: string,
  config?: Omit<OpenAITTSConfig, 'apiKey'>,
): OpenAITTSAdapter {
  return new OpenAITTSAdapter({ apiKey, ...config })
}

/**
 * Creates an OpenAI TTS adapter with automatic API key detection from environment variables.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI TTS adapter instance
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiTTS();
 *
 * const result = await ai({
 *   adapter,
 *   model: 'tts-1',
 *   text: 'Welcome to TanStack AI!',
 *   voice: 'alloy',
 *   format: 'mp3'
 * });
 * ```
 */
export function openaiTTS(
  config?: Omit<OpenAITTSConfig, 'apiKey'>,
): OpenAITTSAdapter {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiTTS(apiKey, config)
}
