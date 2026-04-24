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
  ElevenLabsOutputFormat,
} from '../model-meta'

/**
 * Structured composition plan for ElevenLabs music generation. Mutually
 * exclusive with a free-form `prompt` on the `generateAudio()` call — when
 * supplied, `prompt` is ignored by ElevenLabs.
 *
 * We mirror the SDK's camelCase naming. Lengths are in milliseconds.
 * @see https://elevenlabs.io/docs/api-reference/music/compose
 */
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

/**
 * Provider options common to all ElevenLabs audio endpoints.
 */
interface CommonAudioOptions {
  /** Output audio format. Defaults to `mp3_44100_128`. */
  outputFormat?: ElevenLabsOutputFormat
}

/**
 * Provider options for music generation (`music_v1`).
 */
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

/**
 * Provider options for sound-effect generation (`eleven_text_to_sound_v*`).
 */
export interface ElevenLabsSoundEffectsProviderOptions
  extends CommonAudioOptions {
  /** Prompt influence, 0..1. Default 0.3. Higher = more prompt adherence. */
  promptInfluence?: number
  /** Generate a loopable SFX (v2 only). */
  loop?: boolean
}

/**
 * Union of per-model provider options. We keep both branches on one type so
 * the adapter stays tree-shakeable; callers narrow by model at the factory.
 */
export type ElevenLabsAudioProviderOptions =
  | (ElevenLabsMusicProviderOptions & ElevenLabsSoundEffectsProviderOptions)
  | ElevenLabsMusicProviderOptions
  | ElevenLabsSoundEffectsProviderOptions

/**
 * ElevenLabs audio generation adapter. Dispatches to music or SFX endpoints
 * based on the model id. Music → `client.music.compose`, SFX →
 * `client.textToSoundEffects.convert`.
 *
 * @example
 * ```ts
 * const music = elevenlabsAudio('music_v1')
 * await generateAudio({ adapter: music, prompt: 'lo-fi beat', duration: 15 })
 *
 * const sfx = elevenlabsAudio('eleven_text_to_sound_v2')
 * await generateAudio({ adapter: sfx, prompt: 'glass shattering', duration: 3 })
 * ```
 */
export class ElevenLabsAudioAdapter<
  TModel extends ElevenLabsAudioModel,
> extends BaseAudioAdapter<TModel, ElevenLabsAudioProviderOptions> {
  readonly name = 'elevenlabs' as const

  private client: ElevenLabsClient

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
    const music = (options.modelOptions ??
      {}) as ElevenLabsMusicProviderOptions
    const outputFormat = music.outputFormat

    const stream = await this.client.music.compose({
      modelId: 'music_v1',
      ...(options.prompt && !music.compositionPlan
        ? { prompt: options.prompt }
        : {}),
      ...(music.compositionPlan
        ? { compositionPlan: toMusicPrompt(music.compositionPlan) }
        : {}),
      ...(options.duration != null && !music.compositionPlan
        ? { musicLengthMs: Math.round(options.duration * 1000) }
        : {}),
      // See speech.ts — widened output format cast back to SDK's closed union.
      ...(outputFormat ? { outputFormat: outputFormat as never } : {}),
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
    const sfx = (options.modelOptions ??
      {}) as ElevenLabsSoundEffectsProviderOptions
    const outputFormat = sfx.outputFormat

    const stream = await this.client.textToSoundEffects.convert({
      text: options.prompt,
      modelId: this.model,
      ...(options.duration != null
        ? { durationSeconds: options.duration }
        : {}),
      ...(outputFormat ? { outputFormat: outputFormat as never } : {}),
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

/**
 * Create an ElevenLabs audio adapter using `ELEVENLABS_API_KEY` from env.
 */
export function elevenlabsAudio<TModel extends ElevenLabsAudioModel>(
  model: TModel,
  config?: ElevenLabsClientConfig,
): ElevenLabsAudioAdapter<TModel> {
  return new ElevenLabsAudioAdapter(model, config)
}

/**
 * Create an ElevenLabs audio adapter with an explicit API key.
 */
export function createElevenLabsAudio<TModel extends ElevenLabsAudioModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsClientConfig, 'apiKey'>,
): ElevenLabsAudioAdapter<TModel> {
  return new ElevenLabsAudioAdapter(model, { apiKey, ...config })
}
