import { fal } from '@fal-ai/client'
import { BaseAudioAdapter } from '@tanstack/ai/adapters'
import {
  configureFalClient,
  deriveAudioContentType,
  generateId as utilGenerateId,
} from '../utils/client'
import { buildFalUsage, takeBillableUnits } from '../utils/billing'
import type { OutputType, Result } from '@fal-ai/client'
import type {
  AudioGenerationOptions,
  AudioGenerationResult,
} from '@tanstack/ai'
import type { FalClientConfig } from '../utils/client'
import type { FalModel, FalModelInput } from '../model-meta'

export type FalAudioProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt'
>

const DURATION_FRAGMENT_BUILDERS: Record<
  string,
  (seconds: number) => Record<string, unknown>
> = {
  'fal-ai/elevenlabs/music': (seconds) => ({ music_length_ms: seconds * 1000 }),
  'fal-ai/stable-audio-25/text-to-audio': (seconds) => ({
    seconds_total: seconds,
  }),
}

function buildDurationFragment(
  model: string,
  duration: number | undefined,
): Record<string, unknown> {
  if (duration == null) return {}
  const builder = DURATION_FRAGMENT_BUILDERS[model]
  return builder ? builder(duration) : { duration }
}

export class FalAudioAdapter<TModel extends FalModel> extends BaseAudioAdapter<
  TModel,
  FalAudioProviderOptions<TModel>
> {
  readonly name = 'fal' as const

  constructor(model: TModel, config?: FalClientConfig) {
    super(model, {})
    configureFalClient(config)
  }

  async generateAudio(
    options: AudioGenerationOptions<FalAudioProviderOptions<TModel>>,
  ): Promise<AudioGenerationResult> {
    const { logger } = options
    logger.request(`activity=generateAudio provider=fal model=${this.model}`, {
      provider: 'fal',
      model: this.model,
    })
    try {
      const input = this.buildInput(options)
      // Request-specific abortSignal only — not fal.config() (global).
      const result = await fal.subscribe(this.model, {
        input,
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      })
      return this.transformResponse(result)
    } catch (error) {
      logger.errors('fal.generateAudio fatal', {
        error,
        source: 'fal.generateAudio',
      })
      throw error
    }
  }

  private buildInput(
    options: AudioGenerationOptions<FalAudioProviderOptions<TModel>>,
  ): FalModelInput<TModel> {
    return {
      ...buildDurationFragment(this.model, options.duration),
      ...options.modelOptions,
      prompt: options.prompt,
    } as FalModelInput<TModel>
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  private transformResponse(
    response: Result<OutputType<TModel>>,
  ): AudioGenerationResult {
    const data = response.data as Record<string, unknown>

    // fal returns { audio: { url, content_type } } or { audio_url: string }
    let audioUrl: string | undefined
    let contentType: string | undefined

    if (
      data['audio'] &&
      typeof data['audio'] === 'object' &&
      'url' in data['audio']
    ) {
      const audioObj = data['audio'] as { url: string; content_type?: string }
      audioUrl = audioObj.url
      contentType = audioObj.content_type
    } else if (typeof data.audio_url === 'string') {
      audioUrl = data.audio_url
    }

    if (!audioUrl) {
      throw new Error('Audio URL not found in fal audio generation response')
    }

    const usage = buildFalUsage(takeBillableUnits(response.requestId))

    return {
      id: response.requestId || this.generateId(),
      model: this.model,
      audio: {
        url: audioUrl,
        contentType: deriveAudioContentType(contentType, audioUrl),
      },
      ...(usage ? { usage } : {}),
    }
  }
}

export function falAudio<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalAudioAdapter<TModel> {
  return new FalAudioAdapter(model, config)
}
