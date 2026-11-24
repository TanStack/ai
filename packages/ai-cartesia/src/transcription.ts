import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { createCartesiaClient, toAudioFile } from './client'
import type { Cartesia } from '@cartesia/cartesia-js'
import type { TranscriptionOptions, TranscriptionResult } from '@tanstack/ai'
import type { CartesiaAdapterConfig } from './client'
import type { CartesiaTranscriptionModel } from './model-meta'

/** Transcribe recorded audio with a Cartesia model. */
export class CartesiaTranscriptionAdapter<
  TModel extends CartesiaTranscriptionModel,
> extends BaseTranscriptionAdapter<TModel> {
  readonly name = 'cartesia' as const
  private readonly client: Cartesia
  readonly defaultModelOptions: Record<string, unknown> | undefined

  /** Configure the model and API connection for transcription. */
  constructor(
    model: TModel,
    config: CartesiaAdapterConfig<Record<string, unknown>> = {},
  ) {
    super(model)
    const { defaultModelOptions, ...clientConfig } = config
    this.client = createCartesiaClient(clientConfig)
    this.defaultModelOptions = defaultModelOptions
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
      const result = await this.client.stt.transcribe(
        {
          file: toAudioFile(options.audio),
          model: this.model,
          // Omit language and Cartesia uses English and translates other
          // speech. The cast only narrows the string.
          language:
            options.language as Cartesia.STTTranscribeParams['language'],
          timestamp_granularities:
            options.responseFormat === 'verbose_json' ? ['word'] : undefined,
        },
        { signal: options.abortSignal },
      )
      if (typeof result.text !== 'string') {
        throw new Error('Cartesia transcription response has no text')
      }
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
  config?: CartesiaAdapterConfig<Record<string, unknown>>,
): CartesiaTranscriptionAdapter<TModel> {
  return new CartesiaTranscriptionAdapter(model, config)
}

/** Create a transcription adapter with an explicit API key. */
export function createCartesiaTranscription<
  TModel extends CartesiaTranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<CartesiaAdapterConfig<Record<string, unknown>>, 'apiKey'>,
): CartesiaTranscriptionAdapter<TModel> {
  return new CartesiaTranscriptionAdapter(model, { ...config, apiKey })
}
