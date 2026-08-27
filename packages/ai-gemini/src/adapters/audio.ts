import { BaseAudioAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import { buildGeminiUsage } from '../usage'
import type { GEMINI_AUDIO_MODELS } from '../model-meta'
import type {
  AudioGenerationOptions,
  AudioGenerationResult,
} from '@tanstack/ai'
import type { GoogleGenAI } from '@google/genai'
import type { GeminiClientConfig } from '../utils/client'

export interface GeminiAudioProviderOptions {
  seed?: number
}

export interface GeminiAudioConfig extends GeminiClientConfig {}

/** Model type for Gemini Lyria audio generation */
export type GeminiAudioModel = (typeof GEMINI_AUDIO_MODELS)[number]

export class GeminiAudioAdapter<
  TModel extends GeminiAudioModel,
> extends BaseAudioAdapter<TModel, GeminiAudioProviderOptions> {
  readonly name = 'gemini' as const

  private readonly client: GoogleGenAI

  constructor(config: GeminiAudioConfig, model: TModel) {
    super(model, config)
    this.client = createGeminiClient(config)
  }

  async generateAudio(
    options: AudioGenerationOptions<GeminiAudioProviderOptions>,
  ): Promise<AudioGenerationResult> {
    const { model, prompt, modelOptions, logger } = options

    logger.request(`activity=generateAudio provider=gemini model=${model}`, {
      provider: 'gemini',
      model,
    })

    try {
      const response = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseModalities: ['AUDIO', 'TEXT'],
          ...(modelOptions?.seed != null ? { seed: modelOptions.seed } : {}),
        },
      })

      const parts = response.candidates?.[0]?.content?.parts ?? []
      const audioPart = parts.find((part: any) =>
        part.inlineData?.mimeType?.startsWith('audio/'),
      )

      if (!audioPart?.inlineData?.data) {
        throw new Error('No audio data in Gemini Lyria response')
      }

      const contentType = audioPart.inlineData.mimeType

      return {
        id: generateId(this.name),
        model,
        audio: {
          b64Json: audioPart.inlineData.data,
          ...(contentType !== undefined && { contentType }),
        },
        // Surface token usage (with per-modality breakdown) when Gemini reports
        // it. Spread conditionally for exactOptionalPropertyTypes.
        ...(response.usageMetadata
          ? { usage: buildGeminiUsage(response.usageMetadata) }
          : {}),
      }
    } catch (error) {
      logger.errors('gemini.generateAudio fatal', {
        error,
        source: 'gemini.generateAudio',
      })
      throw error
    }
  }
}

export function createGeminiAudio<TModel extends GeminiAudioModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiAudioConfig, 'apiKey'>,
): GeminiAudioAdapter<TModel> {
  // Put apiKey LAST so caller-supplied config can't silently override the
  // explicit argument.
  return new GeminiAudioAdapter({ ...config, apiKey }, model)
}

export function geminiAudio<TModel extends GeminiAudioModel>(
  model: TModel,
  config?: Omit<GeminiAudioConfig, 'apiKey'>,
): GeminiAudioAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiAudio(model, apiKey, config)
}
