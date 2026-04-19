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
  ElevenLabsMusicModel,
  ElevenLabsOutputFormat,
} from '../model-meta'

/**
 * A structured composition plan for ElevenLabs music generation.
 *
 * Mutually exclusive with `prompt` on the generate request.
 *
 * @see https://elevenlabs.io/docs/api-reference/music/compose
 */
export interface ElevenLabsMusicCompositionPlan {
  /**
   * Global styles, mood, instruments, tempo etc. describing the whole song.
   */
  globalStyles?: Array<string>
  /**
   * Section definitions (verse, chorus, bridge…) with local style hints
   * and optional lyrics.
   */
  sections?: Array<{
    sectionName: string
    positiveLocalStyles?: Array<string>
    negativeLocalStyles?: Array<string>
    durationMs?: number
    lines?: Array<string>
  }>
  [key: string]: unknown
}

/**
 * Provider-specific options for ElevenLabs music generation.
 */
export interface ElevenLabsMusicProviderOptions {
  /**
   * Output audio format encoded as `codec_samplerate[_bitrate]`.
   * Defaults to `mp3_44100_128`.
   */
  outputFormat?: ElevenLabsOutputFormat

  /**
   * Structured composition plan. Mutually exclusive with a free-form prompt.
   * When supplied, the `prompt` and `duration` passed to `generateAudio()`
   * are ignored by ElevenLabs.
   */
  compositionPlan?: ElevenLabsMusicCompositionPlan

  /** Deterministic sampling seed (incompatible with prompt) */
  seed?: number

  /** Force the output to be purely instrumental (prompt only) */
  forceInstrumental?: boolean

  /** Enforce strict section duration adherence when using a composition plan */
  respectSectionsDurations?: boolean

  /** Enterprise feature: store the generation for inpainting workflows */
  storeForInpainting?: boolean

  /** Sign the MP3 output with C2PA */
  signWithC2pa?: boolean
}

export interface ElevenLabsMusicConfig extends ElevenLabsClientConfig {}

/**
 * ElevenLabs music generation adapter.
 *
 * Exposed as an `audio` activity (via TanStack AI's `generateAudio()` API) —
 * pass a text prompt to get a complete, context-aware song.
 *
 * @example Free-form prompt
 * ```typescript
 * const adapter = elevenlabsMusic('music_v1')
 * const result = await generateAudio({
 *   adapter,
 *   prompt: 'An epic orchestral piece with heavy percussion',
 *   duration: 30, // seconds — converted to music_length_ms for you
 * })
 * ```
 *
 * @example Composition plan
 * ```typescript
 * const result = await generateAudio({
 *   adapter,
 *   prompt: '',
 *   modelOptions: {
 *     compositionPlan: {
 *       globalStyles: ['synthwave', '120 bpm'],
 *       sections: [
 *         { sectionName: 'intro', durationMs: 8000 },
 *         { sectionName: 'chorus', durationMs: 16000, lines: ['...'] },
 *       ],
 *     },
 *   },
 * })
 * ```
 *
 * @see https://elevenlabs.io/docs/api-reference/music/compose
 */
export class ElevenLabsMusicAdapter<
  TModel extends ElevenLabsMusicModel,
> extends BaseAudioAdapter<TModel, ElevenLabsMusicProviderOptions> {
  readonly name = 'elevenlabs' as const

  constructor(config: ElevenLabsMusicConfig, model: TModel) {
    super(config, model)
  }

  async generateAudio(
    options: AudioGenerationOptions<ElevenLabsMusicProviderOptions>,
  ): Promise<AudioGenerationResult> {
    const config = this.config as ElevenLabsMusicConfig
    const outputFormat = options.modelOptions?.outputFormat ?? 'mp3_44100_128'

    const url = `${resolveBaseUrl(config)}/v1/music?output_format=${encodeURIComponent(
      outputFormat,
    )}`

    const body = buildBody(options, this.model)

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

function buildBody(
  options: AudioGenerationOptions<ElevenLabsMusicProviderOptions>,
  model: string,
): Record<string, unknown> {
  const { prompt, duration, modelOptions } = options

  const body: Record<string, unknown> = {
    model_id: model,
  }

  if (modelOptions?.compositionPlan) {
    body.composition_plan = modelOptions.compositionPlan
  } else {
    body.prompt = prompt
    if (duration != null) {
      body.music_length_ms = Math.round(duration * 1000)
    }
  }

  if (modelOptions?.seed != null) body.seed = modelOptions.seed
  if (modelOptions?.forceInstrumental != null) {
    body.force_instrumental = modelOptions.forceInstrumental
  }
  if (modelOptions?.respectSectionsDurations != null) {
    body.respect_sections_durations = modelOptions.respectSectionsDurations
  }
  if (modelOptions?.storeForInpainting != null) {
    body.store_for_inpainting = modelOptions.storeForInpainting
  }
  if (modelOptions?.signWithC2pa != null) {
    body.sign_with_c2pa = modelOptions.signWithC2pa
  }

  return body
}

/**
 * Create an ElevenLabs music adapter with an explicit API key.
 */
export function createElevenLabsMusic<TModel extends ElevenLabsMusicModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsMusicConfig, 'apiKey'>,
): ElevenLabsMusicAdapter<TModel> {
  return new ElevenLabsMusicAdapter({ apiKey, ...config }, model)
}

/**
 * Create an ElevenLabs music adapter, pulling the API key from the environment.
 */
export function elevenlabsMusic<TModel extends ElevenLabsMusicModel>(
  model: TModel,
  config?: Omit<ElevenLabsMusicConfig, 'apiKey'>,
): ElevenLabsMusicAdapter<TModel> {
  const apiKey = getElevenLabsApiKeyFromEnv()
  return createElevenLabsMusic(model, apiKey, config)
}
