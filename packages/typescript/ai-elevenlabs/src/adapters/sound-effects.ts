import { BaseAudioAdapter } from '@tanstack/ai/adapters'
import {
  arrayBufferToBase64,
  buildHeaders,
  generateId,
  getElevenLabsApiKeyFromEnv,
  parseOutputFormat,
  postForAudio,
  resolveBaseUrl,
} from '../utils'
import type { ElevenLabsClientConfig } from '../utils'
import type {
  AudioGenerationOptions,
  AudioGenerationResult,
} from '@tanstack/ai'
import type {
  ElevenLabsOutputFormat,
  ElevenLabsSoundEffectsModel,
} from '../model-meta'

/**
 * Provider-specific options for ElevenLabs sound-effect generation.
 */
export interface ElevenLabsSoundEffectsProviderOptions {
  /**
   * Output format encoded as `codec_samplerate[_bitrate]`.
   * Defaults to `mp3_44100_128`.
   */
  outputFormat?: ElevenLabsOutputFormat

  /**
   * 0–1. Higher values make the generation follow the prompt more closely.
   * Defaults to 0.3.
   */
  promptInfluence?: number

  /**
   * Generate a smoothly-looping sound effect.
   * Only supported by `eleven_text_to_sound_v2`.
   */
  loop?: boolean
}

export interface ElevenLabsSoundEffectsConfig extends ElevenLabsClientConfig {}

/**
 * ElevenLabs sound-effect adapter.
 *
 * Generates short SFX clips (0.5–30 seconds) from natural-language descriptions.
 * Exposed as an `audio` activity.
 *
 * @example
 * ```typescript
 * const adapter = elevenlabsSoundEffects('eleven_text_to_sound_v2')
 * const result = await generateAudio({
 *   adapter,
 *   prompt: 'Glass shattering on a tile floor',
 *   duration: 2,
 * })
 * ```
 *
 * @see https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
 */
export class ElevenLabsSoundEffectsAdapter<
  TModel extends ElevenLabsSoundEffectsModel,
> extends BaseAudioAdapter<TModel, ElevenLabsSoundEffectsProviderOptions> {
  readonly name = 'elevenlabs' as const

  constructor(config: ElevenLabsSoundEffectsConfig, model: TModel) {
    super(config, model)
  }

  async generateAudio(
    options: AudioGenerationOptions<ElevenLabsSoundEffectsProviderOptions>,
  ): Promise<AudioGenerationResult> {
    const config = this.config as ElevenLabsSoundEffectsConfig
    const outputFormat =
      options.modelOptions?.outputFormat ?? 'mp3_44100_128'

    const url = `${resolveBaseUrl(config)}/v1/sound-generation?output_format=${encodeURIComponent(
      outputFormat,
    )}`

    const body: Record<string, unknown> = {
      text: options.prompt,
      model_id: this.model,
    }

    if (options.duration != null) body.duration_seconds = options.duration
    if (options.modelOptions?.promptInfluence != null) {
      body.prompt_influence = options.modelOptions.promptInfluence
    }
    if (options.modelOptions?.loop != null) {
      body.loop = options.modelOptions.loop
    }

    const { bytes, contentType } = await postForAudio(
      url,
      buildHeaders(config),
      JSON.stringify(body),
    )

    const { contentType: fallbackContentType } = parseOutputFormat(outputFormat)

    return {
      id: generateId(this.name),
      model: this.model,
      audio: {
        b64Json: arrayBufferToBase64(bytes),
        contentType: contentType || fallbackContentType,
        duration: options.duration,
      },
    }
  }
}

/**
 * Create an ElevenLabs sound-effects adapter with an explicit API key.
 */
export function createElevenLabsSoundEffects<
  TModel extends ElevenLabsSoundEffectsModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsSoundEffectsConfig, 'apiKey'>,
): ElevenLabsSoundEffectsAdapter<TModel> {
  return new ElevenLabsSoundEffectsAdapter({ apiKey, ...config }, model)
}

/**
 * Create an ElevenLabs sound-effects adapter using the API key from the environment.
 */
export function elevenlabsSoundEffects<
  TModel extends ElevenLabsSoundEffectsModel,
>(
  model: TModel,
  config?: Omit<ElevenLabsSoundEffectsConfig, 'apiKey'>,
): ElevenLabsSoundEffectsAdapter<TModel> {
  const apiKey = getElevenLabsApiKeyFromEnv()
  return createElevenLabsSoundEffects(model, apiKey, config)
}
