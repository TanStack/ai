import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { CartesiaClient, toAudioFile } from './client'
import type { TranscriptionOptions, TranscriptionResult } from '@tanstack/ai'
import type { CartesiaConfig } from './client'
import type { CartesiaTranscriptionModel } from './model-meta'

interface CartesiaTranscript {
  text: string
  request_id?: string
  language?: string
  duration?: number
  words?: Array<{ word: string; start: number; end: number }>
}

/** Transcribe recorded audio with a Cartesia model. */
export class CartesiaTranscriptionAdapter<
  TModel extends CartesiaTranscriptionModel,
> extends BaseTranscriptionAdapter<TModel> {
  readonly name = 'cartesia' as const
  private readonly client: CartesiaClient

  /** Configure the model and API connection for transcription. */
  constructor(model: TModel, config?: CartesiaConfig) {
    super(model)
    this.client = new CartesiaClient(config)
  }

  /** Transcribe audio and return text and available word timings. */
  async transcribe(
    options: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    const { logger } = options
    logger.request(
      `activity=transcription provider=cartesia model=${this.model}`,
      {
        provider: this.name,
        model: this.model,
      },
    )
    try {
      if (options.prompt)
        throw new Error('Cartesia batch transcription does not support prompt')
      if (
        options.responseFormat &&
        options.responseFormat !== 'json' &&
        options.responseFormat !== 'verbose_json'
      ) {
        throw new Error(
          `Cartesia batch transcription does not support responseFormat '${options.responseFormat}'`,
        )
      }
      const form = new FormData()
      form.append('file', toAudioFile(options.audio))
      form.append('model', this.model)
      if (options.language) form.append('language', options.language)
      if (options.responseFormat === 'verbose_json')
        form.append('timestamp_granularities[]', 'word')
      const response = await this.client.post('/stt', form, options.abortSignal)
      const result = (await response.json()) as CartesiaTranscript
      return {
        id: result.request_id ?? this.generateId(),
        model: this.model,
        text: result.text,
        ...(result.language ? { language: result.language } : {}),
        ...(result.duration != null ? { duration: result.duration } : {}),
        ...(result.words ? { words: result.words } : {}),
      }
    } catch (error) {
      logger.errors('cartesia.transcribe fatal', {
        error,
        source: 'cartesia.transcribe',
      })
      throw error
    }
  }
}

/** Create a transcription adapter using the environment API key or supplied config. */
export function cartesiaTranscription<
  TModel extends CartesiaTranscriptionModel,
>(
  model: TModel,
  config?: CartesiaConfig,
): CartesiaTranscriptionAdapter<TModel> {
  return new CartesiaTranscriptionAdapter(model, config)
}

/** Create a transcription adapter with an explicit API key. */
export function createCartesiaTranscription<
  TModel extends CartesiaTranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<CartesiaConfig, 'apiKey'>,
): CartesiaTranscriptionAdapter<TModel> {
  return new CartesiaTranscriptionAdapter(model, { ...config, apiKey })
}
