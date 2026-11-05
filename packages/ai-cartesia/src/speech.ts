import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { CartesiaClient } from './client'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { CartesiaConfig } from './client'
import type { CartesiaTTSModel } from './model-meta'

export interface CartesiaSpeechOptions {
  language?: string
  normalization?: string
  pronunciationDictId?: string
  volume?: number
}

export class CartesiaSpeechAdapter<
  TModel extends CartesiaTTSModel,
> extends BaseTTSAdapter<TModel, CartesiaSpeechOptions> {
  readonly name = 'cartesia' as const
  private readonly client: CartesiaClient

  constructor(model: TModel, config?: CartesiaConfig) {
    super(model)
    this.client = new CartesiaClient(config)
  }

  async generateSpeech(
    options: TTSOptions<CartesiaSpeechOptions>,
  ): Promise<TTSResult> {
    const { logger } = options
    logger.request(
      `activity=generateSpeech provider=cartesia model=${this.model}`,
      {
        provider: this.name,
        model: this.model,
      },
    )
    try {
      if (!options.voice) throw new Error('Cartesia speech requires a voice ID')
      const format = options.format ?? 'mp3'
      if (format !== 'mp3' && format !== 'wav' && format !== 'pcm') {
        throw new Error(`Cartesia speech does not support format '${format}'`)
      }
      const outputFormat =
        format === 'mp3'
          ? { container: 'mp3', sample_rate: 44100, bit_rate: 128000 }
          : {
              container: format === 'wav' ? 'wav' : 'raw',
              encoding: 'pcm_s16le',
              sample_rate: 44100,
            }
      const modelOptions = options.modelOptions
      const response = await this.client.post(
        '/tts/bytes',
        JSON.stringify({
          model_id: this.model,
          transcript: options.text,
          voice: options.voice,
          output_format: outputFormat,
          ...(modelOptions?.language
            ? { language: modelOptions.language }
            : {}),
          ...(modelOptions?.normalization
            ? { normalization: modelOptions.normalization }
            : {}),
          ...(modelOptions?.pronunciationDictId
            ? { pronunciation_dict_id: modelOptions.pronunciationDictId }
            : {}),
          ...(options.speed != null || modelOptions?.volume != null
            ? {
                generation_config: {
                  ...(options.speed != null ? { speed: options.speed } : {}),
                  ...(modelOptions?.volume != null
                    ? { volume: modelOptions.volume }
                    : {}),
                },
              }
            : {}),
        }),
        options.abortSignal,
      )
      return {
        id: response.headers.get('x-request-id') ?? this.generateId(),
        model: this.model,
        audio: arrayBufferToBase64(await response.arrayBuffer()),
        format,
        contentType:
          format === 'mp3'
            ? 'audio/mpeg'
            : format === 'wav'
              ? 'audio/wav'
              : 'audio/pcm',
      }
    } catch (error) {
      logger.errors('cartesia.generateSpeech fatal', {
        error,
        source: 'cartesia.generateSpeech',
      })
      throw error
    }
  }
}

export function cartesiaSpeech<TModel extends CartesiaTTSModel>(
  model: TModel,
  config?: CartesiaConfig,
): CartesiaSpeechAdapter<TModel> {
  return new CartesiaSpeechAdapter(model, config)
}

export function createCartesiaSpeech<TModel extends CartesiaTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<CartesiaConfig, 'apiKey'>,
): CartesiaSpeechAdapter<TModel> {
  return new CartesiaSpeechAdapter(model, { ...config, apiKey })
}
