import { BaseSoundEffectsAdapter } from '@tanstack/ai/adapters'
import { configureFalClient, generateId as utilGenerateId } from '../utils'
import {
  buildFalAudioInput,
  runFalAudio,
  transformFalAudioResponse,
} from './_audio-shared'
import type {
  SoundEffectsGenerationOptions,
  SoundEffectsGenerationResult,
} from '@tanstack/ai'
import type { FalClientConfig } from '../utils'
import type { FalModel, FalSoundEffectsProviderOptions } from '../model-meta'

/**
 * fal.ai sound-effects generation adapter.
 *
 * Supports fal.ai sound-effect models such as
 * `fal-ai/elevenlabs/sound-effects/v2` and
 * `fal-ai/mmaudio-v2/text-to-audio`.
 *
 * @example
 * ```typescript
 * const adapter = falSoundEffects('fal-ai/elevenlabs/sound-effects/v2')
 * const result = await generateSoundEffects({
 *   adapter,
 *   prompt: 'Thunderclap followed by heavy rain',
 *   duration: 5,
 * })
 * ```
 */
export class FalSoundEffectsAdapter<
  TModel extends FalModel,
> extends BaseSoundEffectsAdapter<
  TModel,
  FalSoundEffectsProviderOptions<TModel>
> {
  readonly name = 'fal' as const

  constructor(model: TModel, config?: FalClientConfig) {
    super({}, model)
    configureFalClient(config)
  }

  async generateSoundEffects(
    options: SoundEffectsGenerationOptions<
      FalSoundEffectsProviderOptions<TModel>
    >,
  ): Promise<SoundEffectsGenerationResult> {
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

export function falSoundEffects<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalSoundEffectsAdapter<TModel> {
  return new FalSoundEffectsAdapter(model, config)
}
