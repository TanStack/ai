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
 * Supports tts-1, tts-1-hd, and gpt-4o-audio-preview models.
 * Voices: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse.
 * Formats: mp3, opus, aac, flac, wav, pcm. Speed 0.25 to 4.0.
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

export function createOpenaiSpeech<TModel extends OpenAITTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITTSConfig, 'apiKey'>,
): OpenAITTSAdapter<TModel> {
  return new OpenAITTSAdapter({ apiKey, ...config }, model)
}

export function openaiSpeech<TModel extends OpenAITTSModel>(
  model: TModel,
  config?: Omit<OpenAITTSConfig, 'apiKey'>,
): OpenAITTSAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiSpeech(model, apiKey, config)
}
