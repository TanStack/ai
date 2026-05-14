import OpenAI from 'openai'
import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { arrayBufferToBase64, generateId } from '@tanstack/ai-utils'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  validateAudioInput,
  validateInstructions,
  validateSpeed,
} from '../audio/audio-provider-options'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAITTSModel } from '../model-meta'
import type { OpenAITTSProviderOptions } from '../audio/tts-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

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
export class OpenAITTSAdapter<
  TModel extends OpenAITTSModel,
> extends BaseTTSAdapter<TModel, OpenAITTSProviderOptions> {
  readonly name = 'openai' as const

  protected client: OpenAI

  constructor(config: OpenAITTSConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(config)
  }

  async generateSpeech(
    options: TTSOptions<OpenAITTSProviderOptions>,
  ): Promise<TTSResult> {
    const { model, text, voice, format, speed, modelOptions } = options

    validateAudioInput({ input: text, model: this.model, voice: 'alloy' })
    if (speed !== undefined) {
      validateSpeed({ speed, model: this.model, input: '', voice: 'alloy' })
    }
    if (modelOptions) {
      validateInstructions({
        ...modelOptions,
        model,
        input: '',
        voice: 'alloy',
      })
    }

    const request: OpenAI_SDK.Audio.SpeechCreateParams = {
      model,
      input: text,
      voice: (voice || 'alloy') as OpenAI_SDK.Audio.SpeechCreateParams['voice'],
      response_format: format,
      speed,
      ...modelOptions,
    }

    try {
      options.logger.request(
        `activity=tts provider=${this.name} model=${model} format=${request.response_format ?? 'default'} voice=${request.voice}`,
        { provider: this.name, model },
      )
      const response = await this.client.audio.speech.create(request)

      // Convert response to base64. Buffer is Node-only; use atob fallback in
      // browser/edge runtimes where the SDK can run.
      const arrayBuffer = await response.arrayBuffer()
      const base64 = arrayBufferToBase64(arrayBuffer)

      const outputFormat = (request.response_format as string) || 'mp3'
      const contentTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        opus: 'audio/opus',
        aac: 'audio/aac',
        flac: 'audio/flac',
        wav: 'audio/wav',
        pcm: 'audio/pcm',
      }
      const contentType = contentTypes[outputFormat] || 'audio/mpeg'

      return {
        id: generateId(this.name),
        model,
        audio: base64,
        format: outputFormat,
        contentType,
      }
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      options.logger.errors(`${this.name}.generateSpeech fatal`, {
        error: toRunErrorPayload(error, `${this.name}.generateSpeech failed`),
        source: `${this.name}.generateSpeech`,
      })
      throw error
    }
  }
}

/**
 * Creates an OpenAI speech adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'tts-1', 'tts-1-hd')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI speech adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiSpeech('tts-1-hd', "sk-...");
 *
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Hello, world!',
 *   voice: 'nova'
 * });
 * ```
 */
export function createOpenaiSpeech<TModel extends OpenAITTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITTSConfig, 'apiKey'>,
): OpenAITTSAdapter<TModel> {
  return new OpenAITTSAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI speech adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'tts-1', 'tts-1-hd')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI speech adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiSpeech('tts-1');
 *
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Welcome to TanStack AI!',
 *   voice: 'alloy',
 *   format: 'mp3'
 * });
 * ```
 */
export function openaiSpeech<TModel extends OpenAITTSModel>(
  model: TModel,
  config?: Omit<OpenAITTSConfig, 'apiKey'>,
): OpenAITTSAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiSpeech(model, apiKey, config)
}
