import { fal } from '@fal-ai/client'
import { BaseAudioAdapter } from '@tanstack/ai/adapters'
import {
  configureFalClient,
  deriveAudioContentType,
  generateId as utilGenerateId,
} from '../utils'
import type { OutputType, Result } from '@fal-ai/client'
import type {
  AudioGenerationOptions,
  AudioGenerationResult,
} from '@tanstack/ai'
import type { FalClientConfig } from '../utils'
import type { FalModel, FalModelInput } from '../model-meta'

/**
 * Provider options for audio generation, excluding fields TanStack AI handles.
 */
export type FalAudioProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt'
>

/**
 * Fal audio models don't agree on the name for "how long should this be."
 * Most accept seconds via `duration`, but a few use model-specific fields —
 * e.g. ElevenLabs wants milliseconds via `music_length_ms`, Stable Audio wants
 * `seconds_total`. Explicit per-model entries override the default; user
 * `modelOptions` still win over either.
 */
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

/**
 * fal.ai audio generation adapter.
 *
 * Supports fal.ai audio models like diffrhythm (music), sound effects, etc.
 *
 * @example
 * ```typescript
 * const adapter = falAudio('fal-ai/diffrhythm')
 * const result = await generateAudio({
 *   adapter,
 *   prompt: 'An upbeat electronic track with synths',
 *   duration: 10,
 * })
 * ```
 */
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
      const result = await fal.subscribe(this.model, { input })
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

    if (data.audio && typeof data.audio === 'object' && 'url' in data.audio) {
      const audioObj = data.audio as { url: string; content_type?: string }
      audioUrl = audioObj.url
      contentType = audioObj.content_type
    } else if (typeof data.audio_url === 'string') {
      audioUrl = data.audio_url
    }

    if (!audioUrl) {
      throw new Error('Audio URL not found in fal audio generation response')
    }

    return {
      id: response.requestId || this.generateId(),
      model: this.model,
      audio: {
        url: audioUrl,
        contentType: deriveAudioContentType(contentType, audioUrl),
      },
    }
  }
}

export function falAudio<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalAudioAdapter<TModel> {
  return new FalAudioAdapter(model, config)
}
