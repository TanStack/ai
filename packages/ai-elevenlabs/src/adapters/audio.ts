import { BaseAudioAdapter } from '@tanstack/ai/adapters'
import {
  arrayBufferToBase64,
  createElevenLabsClient,
  generateId,
  parseOutputFormat,
  readStreamToArrayBuffer,
} from '../utils/client'
import {
  isElevenLabsMusicModel,
  isElevenLabsSoundEffectsModel,
} from '../model-meta'
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type {
  AudioGenerationOptions,
  AudioGenerationResult,
} from '@tanstack/ai'
import type { ElevenLabsClientConfig } from '../utils/client'
import type {
  ElevenLabsAudioModel,
  ElevenLabsMusicModel,
  ElevenLabsOutputFormat,
  ElevenLabsSoundEffectsModel,
} from '../model-meta'

export interface ElevenLabsMusicCompositionPlan {
  /** Positive global style descriptors (mood, instruments, tempo, …). */
  positiveGlobalStyles?: Array<string>
  /** Negative global style descriptors — styles to avoid. */
  negativeGlobalStyles?: Array<string>
  /** Section definitions (verse/chorus/bridge/…) with local style hints. */
  sections?: Array<{
    sectionName: string
    positiveLocalStyles?: Array<string>
    negativeLocalStyles?: Array<string>
    durationMs?: number
    lines?: Array<string>
  }>
}

interface CommonAudioOptions {
  /** Output audio format. Defaults to `mp3_44100_128`. */
  outputFormat?: ElevenLabsOutputFormat
}

export interface ElevenLabsMusicProviderOptions extends CommonAudioOptions {
  /** Structured composition plan. Mutually exclusive with `prompt`/`duration`. */
  compositionPlan?: ElevenLabsMusicCompositionPlan
  /** Deterministic sampling seed (incompatible with `prompt`). */
  seed?: number
  /** Force the output to be purely instrumental (prompt-mode only). */
  forceInstrumental?: boolean
  /** Strictly respect section durations in `compositionPlan`. */
  respectSectionsDurations?: boolean
}

export interface ElevenLabsSoundEffectsProviderOptions extends CommonAudioOptions {
  /** Prompt influence, 0..1. Default 0.3. Higher = more prompt adherence. */
  promptInfluence?: number
  /** Generate a loopable SFX (v2 only). */
  loop?: boolean
}

export type ElevenLabsAudioProviderOptions =
  | (ElevenLabsMusicProviderOptions & ElevenLabsSoundEffectsProviderOptions)
  | ElevenLabsMusicProviderOptions
  | ElevenLabsSoundEffectsProviderOptions

export class ElevenLabsAudioAdapter<
  TModel extends ElevenLabsAudioModel,
> extends BaseAudioAdapter<TModel, ElevenLabsAudioProviderOptions> {
  readonly name = 'elevenlabs' as const

  private readonly client: ElevenLabsClient

  constructor(model: TModel, config?: ElevenLabsClientConfig) {
    super(model, config ?? {})
    this.client = createElevenLabsClient(config)
  }

  async generateAudio(
    options: AudioGenerationOptions<ElevenLabsAudioProviderOptions>,
  ): Promise<AudioGenerationResult> {
    const { logger } = options
    logger.request(
      `activity=generateAudio provider=elevenlabs model=${this.model}`,
      { provider: 'elevenlabs', model: this.model },
    )
    try {
      if (isElevenLabsMusicModel(this.model)) {
        return await this.runMusic(options)
      }
      if (isElevenLabsSoundEffectsModel(this.model)) {
        return await this.runSoundEffects(options)
      }
      throw new Error(
        `Unsupported ElevenLabs audio model "${this.model}". Expected one of: music_v1, eleven_text_to_sound_v2, eleven_text_to_sound_v1.`,
      )
    } catch (error) {
      logger.errors('elevenlabs.generateAudio fatal', {
        error,
        source: 'elevenlabs.generateAudio',
      })
      throw error
    }
  }

  private async runMusic(
    options: AudioGenerationOptions<ElevenLabsAudioProviderOptions>,
  ): Promise<AudioGenerationResult> {
    // Gated by isElevenLabsMusicModel() in generateAudio().
    const modelId = this.model as ElevenLabsMusicModel
    const music = (options.modelOptions ?? {}) as ElevenLabsMusicProviderOptions
    const outputFormat = music.outputFormat

    const stream = await this.client.music.compose({
      modelId,
      ...(options.prompt && !music.compositionPlan
        ? { prompt: options.prompt }
        : {}),
      ...(music.compositionPlan
        ? { compositionPlan: toMusicPrompt(music.compositionPlan) }
        : {}),
      ...(options.duration != null && !music.compositionPlan
        ? { musicLengthMs: Math.round(options.duration * 1000) }
        : {}),
      ...(outputFormat ? { outputFormat } : {}),
      ...(music.seed != null ? { seed: music.seed } : {}),
      ...(music.forceInstrumental != null
        ? { forceInstrumental: music.forceInstrumental }
        : {}),
      ...(music.respectSectionsDurations != null
        ? { respectSectionsDurations: music.respectSectionsDurations }
        : {}),
    })

    return this.finalize(stream, outputFormat, options.duration)
  }

  private async runSoundEffects(
    options: AudioGenerationOptions<ElevenLabsAudioProviderOptions>,
  ): Promise<AudioGenerationResult> {
    // Gated by isElevenLabsSoundEffectsModel() in generateAudio().
    const modelId = this.model as ElevenLabsSoundEffectsModel
    const sfx = (options.modelOptions ??
      {}) as ElevenLabsSoundEffectsProviderOptions
    const outputFormat = sfx.outputFormat

    const stream = await this.client.textToSoundEffects.convert({
      text: options.prompt,
      modelId,
      ...(options.duration != null
        ? { durationSeconds: options.duration }
        : {}),
      ...(outputFormat ? { outputFormat } : {}),
      ...(sfx.promptInfluence != null
        ? { promptInfluence: sfx.promptInfluence }
        : {}),
      ...(sfx.loop != null ? { loop: sfx.loop } : {}),
    })

    return this.finalize(stream, outputFormat, options.duration)
  }

  private async finalize(
    stream: ReadableStream<Uint8Array>,
    outputFormat: ElevenLabsOutputFormat | undefined,
    duration: number | undefined,
  ): Promise<AudioGenerationResult> {
    const buffer = await readStreamToArrayBuffer(stream)
    const base64 = arrayBufferToBase64(buffer)
    const { contentType } = parseOutputFormat(outputFormat)
    return {
      id: generateId(this.name),
      model: this.model,
      audio: {
        b64Json: base64,
        contentType,
        ...(duration != null ? { duration } : {}),
      },
    }
  }

  protected override generateId(): string {
    return generateId(this.name)
  }
}

function toMusicPrompt(plan: ElevenLabsMusicCompositionPlan) {
  return {
    positiveGlobalStyles: plan.positiveGlobalStyles ?? [],
    negativeGlobalStyles: plan.negativeGlobalStyles ?? [],
    sections: (plan.sections ?? []).map((section) => ({
      sectionName: section.sectionName,
      positiveLocalStyles: section.positiveLocalStyles ?? [],
      negativeLocalStyles: section.negativeLocalStyles ?? [],
      durationMs: section.durationMs ?? 10000,
      lines: section.lines ?? [],
    })),
  }
}

export function elevenlabsAudio<TModel extends ElevenLabsAudioModel>(
  model: TModel,
  config?: ElevenLabsClientConfig,
): ElevenLabsAudioAdapter<TModel> {
  return new ElevenLabsAudioAdapter(model, config)
}

export function createElevenLabsAudio<TModel extends ElevenLabsAudioModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsClientConfig, 'apiKey'>,
): ElevenLabsAudioAdapter<TModel> {
  return new ElevenLabsAudioAdapter(model, { apiKey, ...config })
}
