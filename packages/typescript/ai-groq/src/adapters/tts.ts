import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { createGroqClient, generateId, getGroqApiKeyFromEnv } from '../utils'
import { validateAudioInput } from '../audio/audio-provider-options'
import type { GroqTTSModel } from '../model-meta'
import type {
  GroqTTSFormat,
  GroqTTSProviderOptions,
  GroqTTSVoice,
} from '../audio/tts-provider-options'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type Groq_SDK from 'groq-sdk'
import type { GroqClientConfig } from '../utils'

/**
 * Configuration for Groq TTS adapter
 */
export interface GroqTTSConfig extends GroqClientConfig {}

/**
 * Groq Text-to-Speech Adapter
 *
 * Tree-shakeable adapter for Groq TTS functionality.
 * Supports canopylabs/orpheus-v1-english and canopylabs/orpheus-arabic-saudi models.
 *
 * Features:
 * - English voices: autumn(f), diana(f), hannah(f), austin(m), daniel(m), troy(m)
 * - Arabic voices: fahad(m), sultan(m), lulwa(f), noura(f)
 * - Output formats: flac, mp3, mulaw, ogg, wav (only wav currently supported)
 * - Speed control
 * - Configurable sample rate
 * - Vocal direction support (English voices only)
 */
export class GroqTTSAdapter<TModel extends GroqTTSModel> extends BaseTTSAdapter<
  TModel,
  GroqTTSProviderOptions
> {
  readonly name = 'groq' as const

  private client: Groq_SDK

  constructor(config: GroqTTSConfig, model: TModel) {
    super(config, model)
    this.client = createGroqClient(config)
  }

  async generateSpeech(
    options: TTSOptions<GroqTTSProviderOptions>,
  ): Promise<TTSResult> {
    const {
      model,
      text,
      voice = 'autumn',
      format = 'wav',
      speed,
      modelOptions,
    } = options

    validateAudioInput({ input: text, model })

    const voiceFormat = format as GroqTTSFormat

    const request: Groq_SDK.Audio.Speech.SpeechCreateParams = {
      model,
      input: text,
      voice: voice as GroqTTSVoice,
      response_format: voiceFormat,
      speed,
      ...modelOptions,
    }

    const response = await this.client.audio.speech.create(request)

    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const contentType = this.getContentType(voiceFormat)

    return {
      id: generateId(this.name),
      model,
      audio: base64,
      format: voiceFormat,
      contentType,
    }
  }

  private getContentType(format: string): string {
    const contentTypes: Record<string, string> = {
      flac: 'audio/flac',
      mp3: 'audio/mpeg',
      mulaw: 'audio/basic',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
    }
    return contentTypes[format] || 'audio/wav'
  }
}

/**
 * Creates a Groq speech adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'canopylabs/orpheus-v1-english')
 * @param apiKey - Your Groq API key
 * @param config - Optional additional configuration
 * @returns Configured Groq speech adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGroqSpeech('canopylabs/orpheus-v1-english', "gsk_...");
 *
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Hello, world!',
 *   voice: 'autumn'
 * });
 * ```
 */
export function createGroqSpeech<TModel extends GroqTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqTTSConfig, 'apiKey'>,
): GroqTTSAdapter<TModel> {
  return new GroqTTSAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Groq speech adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `GROQ_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'canopylabs/orpheus-v1-english')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Groq speech adapter instance with resolved types
 * @throws Error if GROQ_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GROQ_API_KEY from environment
 * const adapter = groqSpeech('canopylabs/orpheus-v1-english');
 *
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Welcome to TanStack AI!',
 *   voice: 'autumn',
 *   format: 'wav'
 * });
 * ```
 */
export function groqSpeech<TModel extends GroqTTSModel>(
  model: TModel,
  config?: Omit<GroqTTSConfig, 'apiKey'>,
): GroqTTSAdapter<TModel> {
  const apiKey = getGroqApiKeyFromEnv()
  return createGroqSpeech(model, apiKey, config)
}
