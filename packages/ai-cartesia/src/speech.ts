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

/** Generate speech with a Cartesia Sonic model. */
export class CartesiaSpeechAdapter<
  TModel extends CartesiaTTSModel,
> extends BaseTTSAdapter<TModel, CartesiaSpeechOptions> {
  readonly name = 'cartesia' as const
  private readonly client: CartesiaClient

  /** Configure the model and API connection for speech generation. */
  constructor(model: TModel, config?: CartesiaConfig) {
    super(model)
    this.client = new CartesiaClient(config)
  }

  /** Generate audio for text using the requested voice and format. */
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
      if (
        options.speed != null &&
        (options.speed < 0.6 || options.speed > 1.5)
      ) {
        throw new Error(
          `Cartesia speech speed must be from 0.6 to 1.5 (received ${options.speed})`,
        )
      }
      const modelOptions = options.modelOptions
      if (
        modelOptions?.volume != null &&
        (modelOptions.volume < 0.5 || modelOptions.volume > 2)
      ) {
        throw new Error(
          `Cartesia speech volume must be from 0.5 to 2 (received ${modelOptions.volume})`,
        )
      }
      const outputFormat =
        format === 'mp3'
          ? { container: 'mp3', sample_rate: 44100, bit_rate: 128000 }
          : {
              container: format === 'wav' ? 'wav' : 'raw',
              encoding: 'pcm_s16le',
              sample_rate: 44100,
            }
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
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength === 0) {
        throw new Error('Cartesia speech returned empty audio')
      }
      return {
        id: response.headers.get('x-request-id') ?? this.generateId(),
        model: this.model,
        audio: arrayBufferToBase64(bytes),
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

/** Create a speech adapter using the environment API key or supplied config. */
export function cartesiaSpeech<TModel extends CartesiaTTSModel>(
  model: TModel,
  config?: CartesiaConfig,
): CartesiaSpeechAdapter<TModel> {
  return new CartesiaSpeechAdapter(model, config)
}

/** Create a speech adapter with an explicit API key. */
export function createCartesiaSpeech<TModel extends CartesiaTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<CartesiaConfig, 'apiKey'>,
): CartesiaSpeechAdapter<TModel> {
  return new CartesiaSpeechAdapter(model, { ...config, apiKey })
}
