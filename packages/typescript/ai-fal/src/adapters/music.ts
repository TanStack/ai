import { BaseMusicAdapter } from '@tanstack/ai/adapters'
import { configureFalClient, generateId as utilGenerateId } from '../utils'
import {
  buildFalAudioInput,
  runFalAudio,
  transformFalAudioResponse,
} from './_audio-shared'
import type {
  MusicGenerationOptions,
  MusicGenerationResult,
} from '@tanstack/ai'
import type { FalClientConfig } from '../utils'
import type { FalModel, FalMusicProviderOptions } from '../model-meta'

/**
 * fal.ai music generation adapter.
 *
 * Supports fal.ai music models like minimax-music, diffrhythm, lyria2, etc.
 *
 * @example
 * ```typescript
 * const adapter = falMusic('fal-ai/minimax-music/v2.6')
 * const result = await generateMusic({
 *   adapter,
 *   prompt: 'An upbeat electronic track with synths',
 *   duration: 10,
 * })
 * ```
 */
export class FalMusicAdapter<TModel extends FalModel> extends BaseMusicAdapter<
  TModel,
  FalMusicProviderOptions<TModel>
> {
  readonly name = 'fal' as const

  constructor(model: TModel, config?: FalClientConfig) {
    super({}, model)
    configureFalClient(config)
  }

  async generateMusic(
    options: MusicGenerationOptions<FalMusicProviderOptions<TModel>>,
  ): Promise<MusicGenerationResult> {
    const input = buildFalAudioInput(options, this.model)
    const result = await runFalAudio(this.model, input)
    return transformFalAudioResponse(result, this.model, () =>
      this.generateId(),
    )
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }
}

export function falMusic<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalMusicAdapter<TModel> {
  return new FalMusicAdapter(model, config)
}
