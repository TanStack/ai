import OpenAI from 'openai'
import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { arrayBufferToBase64, generateId } from '@tanstack/ai-utils'
import { getGroqApiKeyFromEnv, withGroqDefaults } from '../utils/client'
import { validateAudioInput } from '../audio/audio-provider-options'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { GroqTTSModel } from '../model-meta'
import type { GroqTTSProviderOptions } from '../audio/tts-provider-options'
import type { GroqClientConfig } from '../utils/client'

export interface GroqTTSConfig extends GroqClientConfig {}

export class GroqTTSAdapter<TModel extends GroqTTSModel> extends BaseTTSAdapter<
  TModel,
  GroqTTSProviderOptions
> {
  readonly name = 'groq' as const

  protected client: OpenAI

  constructor(config: GroqTTSConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(withGroqDefaults(config))
  }

  async generateSpeech(
    options: TTSOptions<GroqTTSProviderOptions>,
  ): Promise<TTSResult> {
    const { model, text, voice, format, speed, modelOptions } = options

    validateAudioInput({ input: text, model: this.model })

    const request: OpenAI_SDK.Audio.SpeechCreateParams = {
      model,
      input: text,
      voice: voice ?? 'autumn',
      response_format: format ?? 'wav',
      ...(speed !== undefined && { speed }),
      ...(modelOptions ?? {}),
    }

    try {
      options.logger.request(
        `activity=tts provider=${this.name} model=${model} format=${request.response_format ?? 'default'} voice=${request.voice}`,
        { provider: this.name, model },
      )
      const response = await this.client.audio.speech.create(request)

      const arrayBuffer = await response.arrayBuffer()
      const base64 = arrayBufferToBase64(arrayBuffer)

      const outputFormat = request.response_format ?? 'wav'
      const contentType = this.getContentType(outputFormat)

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

export function createGroqSpeech<TModel extends GroqTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqTTSConfig, 'apiKey'>,
): GroqTTSAdapter<TModel> {
  return new GroqTTSAdapter({ apiKey, ...config }, model)
}

export function groqSpeech<TModel extends GroqTTSModel>(
  model: TModel,
  config?: Omit<GroqTTSConfig, 'apiKey'>,
): GroqTTSAdapter<TModel> {
  const apiKey = getGroqApiKeyFromEnv()
  return createGroqSpeech(model, apiKey, config)
}
