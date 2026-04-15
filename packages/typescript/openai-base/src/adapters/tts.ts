import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import { createOpenAICompatibleClient } from '../utils/client'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAICompatibleClientConfig } from '../types/config'

/**
 * OpenAI-Compatible Text-to-Speech Adapter
 *
 * A generalized base class for providers that implement OpenAI-compatible TTS APIs.
 * Providers can extend this class and only need to:
 * - Set `baseURL` in the config
 * - Lock the generic type parameters to provider-specific types
 * - Override validation methods or request building for provider-specific constraints
 *
 * All methods that validate inputs or build requests are `protected` so subclasses
 * can override them.
 */
export class OpenAICompatibleTTSAdapter<
  TModel extends string,
  TProviderOptions extends object = Record<string, any>,
> extends BaseTTSAdapter<TModel, TProviderOptions> {
  readonly name: string

  protected client: OpenAI_SDK

  constructor(
    config: OpenAICompatibleClientConfig,
    model: TModel,
    name: string = 'openai-compatible',
  ) {
    super(config, model)
    this.name = name
    this.client = createOpenAICompatibleClient(config)
  }

  async generateSpeech(
    options: TTSOptions<TProviderOptions>,
  ): Promise<TTSResult> {
    const { model, text, voice, format, speed, modelOptions } = options

    // Validate inputs
    this.validateAudioInput(text)
    this.validateSpeed(speed)
    this.validateInstructions(model, modelOptions)

    // Build request
    const request: OpenAI_SDK.Audio.SpeechCreateParams = {
      model,
      input: text,
      voice: (voice || 'alloy') as OpenAI_SDK.Audio.SpeechCreateParams['voice'],
      response_format: format,
      speed,
      ...modelOptions,
    }

    // Call API
    const response = await this.client.audio.speech.create(request)

    // Convert response to base64
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const outputFormat = (request.response_format as string) || 'mp3'
    const contentType = this.getContentType(outputFormat)

    return {
      id: generateId(this.name),
      model,
      audio: base64,
      format: outputFormat,
      contentType,
    }
  }

  protected validateAudioInput(text: string): void {
    if (text.length > 4096) {
      throw new Error('Input text exceeds maximum length of 4096 characters.')
    }
  }

  protected validateSpeed(speed?: number): void {
    if (speed !== undefined) {
      if (speed < 0.25 || speed > 4.0) {
        throw new Error('Speed must be between 0.25 and 4.0.')
      }
    }
  }

  protected validateInstructions(
    _model: string,
    _modelOptions?: TProviderOptions,
  ): void {
    // Default: no instructions validation — subclasses can override
  }

  protected getContentType(format: string): string {
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
