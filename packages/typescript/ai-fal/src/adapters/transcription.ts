import { fal } from '@fal-ai/client'
import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import {
  configureFalClient,
  dataUrlToBlob,
  generateId as utilGenerateId,
} from '../utils'
import type { OutputType, Result } from '@fal-ai/client'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from '@tanstack/ai'
import type { FalClientConfig } from '../utils'
import type { FalModel, FalModelInput } from '../model-meta'

/**
 * Provider options for transcription, excluding fields TanStack AI handles.
 */
export type FalTranscriptionProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'audio_url'
>

interface FalChunk {
  text: string
  timestamp?: [number, number] | null
  speaker?: string
}

/**
 * fal.ai transcription (speech-to-text) adapter.
 *
 * Supports fal.ai STT models like whisper, wizper, etc.
 *
 * @example
 * ```typescript
 * const adapter = falTranscription('fal-ai/whisper')
 * const result = await generateTranscription({
 *   adapter,
 *   audio: 'https://example.com/audio.mp3',
 *   language: 'en',
 * })
 * ```
 */
export class FalTranscriptionAdapter<
  TModel extends FalModel,
> extends BaseTranscriptionAdapter<
  TModel,
  FalTranscriptionProviderOptions<TModel>
> {
  readonly name = 'fal' as const

  constructor(model: TModel, config?: FalClientConfig) {
    super(model, {})
    configureFalClient(config)
  }

  async transcribe(
    options: TranscriptionOptions<FalTranscriptionProviderOptions<TModel>>,
  ): Promise<TranscriptionResult> {
    const { logger } = options
    logger.request(
      `activity=generateTranscription provider=fal model=${this.model}`,
      {
        provider: 'fal',
        model: this.model,
      },
    )
    try {
      const input = this.buildInput(options)
      const result = await fal.subscribe(this.model, { input })
      return this.transformResponse(result)
    } catch (error) {
      logger.errors('fal.generateTranscription fatal', {
        error,
        source: 'fal.generateTranscription',
      })
      throw error
    }
  }

  private buildInput(
    options: TranscriptionOptions<FalTranscriptionProviderOptions<TModel>>,
  ): FalModelInput<TModel> {
    // fal-client auto-uploads Blob/File inputs via fal.storage.upload, but
    // passes strings through unchanged — so a `data:` URL would reach fal's
    // API and get rejected with a 422 "Unsupported data URL". Decode data
    // URLs to a Blob up front so the auto-upload path handles them.
    let audioInput: string | Blob | File
    if (options.audio instanceof ArrayBuffer) {
      audioInput = new Blob([options.audio])
    } else if (typeof options.audio === 'string') {
      audioInput = dataUrlToBlob(options.audio) ?? options.audio
    } else {
      audioInput = options.audio
    }

    const input = {
      ...options.modelOptions,
      audio_url: audioInput,
      ...(options.language ? { language: options.language } : {}),
      ...(options.prompt ? { prompt: options.prompt } : {}),
    } as FalModelInput<TModel>
    return input
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  private transformResponse(
    response: Result<OutputType<TModel>>,
  ): TranscriptionResult {
    const data = response.data as Record<string, unknown>

    const text = (data.text as string) || ''

    // Map fal chunks to TanStack segments. fal whisper can return
    // `timestamp: null` on some chunks (e.g. when word-level timing is
    // disabled), and the runtime payload is not actually constrained to a
    // 2-tuple — treat it as unknown and validate before indexing.
    let segments: Array<TranscriptionSegment> | undefined
    const chunks = data.chunks as Array<FalChunk> | undefined
    if (chunks && Array.isArray(chunks)) {
      segments = chunks.flatMap((chunk, index) => {
        const ts = chunk.timestamp as unknown
        if (
          !Array.isArray(ts) ||
          ts.length < 2 ||
          typeof ts[0] !== 'number' ||
          typeof ts[1] !== 'number'
        ) {
          return []
        }
        return [
          {
            id: index,
            start: ts[0],
            end: ts[1],
            text: chunk.text,
            ...(chunk.speaker ? { speaker: chunk.speaker } : {}),
          },
        ]
      })
    }

    // Extract language from response
    const language =
      (data.language as string) ||
      (data.inferred_languages as Array<string> | undefined)?.[0] ||
      (data.languages as Array<string> | undefined)?.[0]

    return {
      id: response.requestId || this.generateId(),
      model: this.model,
      text,
      language,
      segments,
    }
  }
}

export function falTranscription<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalTranscriptionAdapter<TModel> {
  return new FalTranscriptionAdapter(model, config)
}
