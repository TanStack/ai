import { BaseVoiceAdapter } from '@tanstack/ai/adapters'
import {
  arrayBufferToBase64,
  createElevenLabsClient,
  generateId,
  parseOutputFormat,
} from '../utils/client'
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type {
  GeneratedVoice,
  VoiceGenerationOptions,
  VoiceResult,
} from '@tanstack/ai'
import type { ElevenLabsClientConfig } from '../utils/client'
import type {
  ElevenLabsOutputFormat,
  ElevenLabsVoiceModel,
} from '../model-meta'

/**
 * Provider-specific voice-design options. Fields map 1:1 onto the SDK's
 * `VoiceDesignRequestModel` — mirroring the names so ElevenLabs'
 * documentation stays useful here.
 * @see https://elevenlabs.io/docs/api-reference/text-to-voice/design
 */
export interface ElevenLabsVoiceProviderOptions {
  /** Output audio format for the previews, `codec_samplerate[_bitrate]`. */
  outputFormat?: ElevenLabsOutputFormat
  /** Line the previews speak, 100..1000 characters. */
  text?: string
  /** Let ElevenLabs write the preview line from the description. */
  autoGenerateText?: boolean
  /** Preview loudness, -1 (quietest) to 1 (loudest). 0 is roughly -24 LUFS. */
  loudness?: number
  /** Deterministic sampling seed — same seed and inputs produce the same voice. */
  seed?: number
  /** How closely to follow the description. High values can sound robotic. */
  guidanceScale?: number
  /** Higher quality trades variety for fidelity. */
  quality?: number
  /** Let ElevenLabs expand a short description into a detailed one. */
  shouldEnhance?: boolean
  /**
   * Balance of description against reference audio, 0 (almost all reference)
   * to 1 (almost all description). `eleven_ttv_v3` only.
   */
  promptStrength?: number
  /** Metadata stored on the voice. Only used when the voice is saved. */
  labels?: Record<string, string>
  /** Remixing session to attach these generations to. */
  remixingSessionId?: string
  /** Remixing session iteration to attach these generations to. */
  remixingSessionIterationId?: string
}

/**
 * ElevenLabs voice-design adapter built on the official
 * `@elevenlabs/elevenlabs-js` SDK.
 *
 * ElevenLabs designs voices in two steps — generate previews, then promote one
 * into a real voice — but that is an implementation detail. Pass `name` to get
 * a saved voice back; leave it off to audition previews first.
 *
 * @example Audition previews
 * ```ts
 * const result = await generateVoice({
 *   adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
 *   prompt: 'A warm, gravelly narrator in his sixties with a slight Irish lilt',
 * })
 * ```
 *
 * @example Save the voice
 * ```ts
 * const result = await generateVoice({
 *   adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
 *   prompt: 'A bright, upbeat product demo host',
 *   name: 'Demo Host',
 * })
 * ```
 */
export class ElevenLabsVoiceAdapter<
  TModel extends ElevenLabsVoiceModel,
> extends BaseVoiceAdapter<TModel, ElevenLabsVoiceProviderOptions> {
  readonly name = 'elevenlabs' as const

  private readonly client: ElevenLabsClient

  constructor(model: TModel, config?: ElevenLabsClientConfig) {
    super(model, config ?? {})
    this.client = createElevenLabsClient(config)
  }

  async generateVoice(
    options: VoiceGenerationOptions<ElevenLabsVoiceProviderOptions>,
  ): Promise<VoiceResult> {
    const { logger } = options
    logger.request(
      `activity=generateVoice provider=elevenlabs model=${this.model}`,
      { provider: 'elevenlabs', model: this.model },
    )
    try {
      // `voiceDescription` is required by the design endpoint, so reference
      // audio alone is not enough here — unlike clone-only providers.
      if (!options.prompt) {
        throw new Error(
          'ElevenLabs voice design requires a `prompt` describing the voice. Reference audio alone is not supported; pass both to guide the design with a real speaker.',
        )
      }

      const opts = options.modelOptions ?? {}
      const referenceAudioBase64 = await toReferenceAudioBase64(
        options.referenceAudio,
      )
      if (referenceAudioBase64 && this.model !== 'eleven_ttv_v3') {
        throw new Error(
          `ElevenLabs only accepts reference audio on eleven_ttv_v3, but this adapter is using "${this.model}".`,
        )
      }

      const requestOptions = options.abortSignal
        ? { abortSignal: options.abortSignal }
        : {}

      const previewResponse = await this.client.textToVoice.design(
        {
          voiceDescription: options.prompt,
          modelId: this.model,
          ...(opts.outputFormat ? { outputFormat: opts.outputFormat } : {}),
          ...(opts.text ? { text: opts.text } : {}),
          ...(opts.autoGenerateText != null
            ? { autoGenerateText: opts.autoGenerateText }
            : {}),
          ...(opts.loudness != null ? { loudness: opts.loudness } : {}),
          ...(opts.seed != null ? { seed: opts.seed } : {}),
          ...(opts.guidanceScale != null
            ? { guidanceScale: opts.guidanceScale }
            : {}),
          ...(opts.quality != null ? { quality: opts.quality } : {}),
          ...(opts.shouldEnhance != null
            ? { shouldEnhance: opts.shouldEnhance }
            : {}),
          ...(opts.promptStrength != null
            ? { promptStrength: opts.promptStrength }
            : {}),
          ...(referenceAudioBase64 ? { referenceAudioBase64 } : {}),
          ...(opts.remixingSessionId
            ? { remixingSessionId: opts.remixingSessionId }
            : {}),
          ...(opts.remixingSessionIterationId
            ? { remixingSessionIterationId: opts.remixingSessionIterationId }
            : {}),
        },
        requestOptions,
      )

      const { format, contentType } = parseOutputFormat(opts.outputFormat)
      const voices: Array<GeneratedVoice> = previewResponse.previews.map(
        (preview) => ({
          voiceId: preview.generatedVoiceId,
          audio: preview.audioBase64,
          format,
          contentType: preview.mediaType || contentType,
          duration: preview.durationSecs,
          ...(preview.language ? { language: preview.language } : {}),
          saved: false,
          // The design endpoint returns a finished preview; nothing trains.
          status: 'ready' as const,
        }),
      )

      // A caller who passed `name` asked for a persisted voice. Returning an
      // empty list would report success for a request that produced nothing.
      if (voices.length === 0) {
        throw new Error(
          'ElevenLabs returned no voice previews for this description. Try a longer, more specific prompt.',
        )
      }

      if (options.name) {
        voices[0] = await this.promoteFirstPreview(
          voices,
          options.name,
          options.description ?? options.prompt,
          opts.labels,
          requestOptions,
        )
      }

      return {
        id: generateId(this.name),
        model: this.model,
        voices,
        previewText: previewResponse.text,
      }
    } catch (error) {
      logger.errors('elevenlabs.generateVoice fatal', {
        error,
        source: 'elevenlabs.generateVoice',
      })
      throw error
    }
  }

  /**
   * Promote the best preview into a real library voice. The remaining
   * generated ids go along as `playedNotSelectedVoiceIds` — ElevenLabs uses
   * them as RLHF signal for future designs.
   */
  private async promoteFirstPreview(
    voices: ReadonlyArray<GeneratedVoice>,
    voiceName: string,
    voiceDescription: string,
    labels: Record<string, string> | undefined,
    requestOptions: { abortSignal?: AbortSignal },
  ): Promise<GeneratedVoice> {
    const [best, ...rest] = voices
    if (!best) {
      throw new Error('No preview to promote into a library voice.')
    }

    const saved = await this.client.textToVoice.create(
      {
        voiceName,
        voiceDescription,
        generatedVoiceId: best.voiceId,
        ...(labels ? { labels } : {}),
        ...(rest.length > 0
          ? { playedNotSelectedVoiceIds: rest.map((voice) => voice.voiceId) }
          : {}),
      },
      requestOptions,
    )

    return { ...best, voiceId: saved.voiceId, saved: true }
  }

  protected override generateId(): string {
    return generateId(this.name)
  }
}

/**
 * Normalize reference audio to the bare base64 the design endpoint wants.
 *
 * https URLs are rejected rather than fetched: ElevenLabs has no URL field
 * here, and downloading caller-supplied media into memory to inline it is a
 * footgun on large files.
 */
async function toReferenceAudioBase64(
  audio: VoiceGenerationOptions['referenceAudio'],
): Promise<string | undefined> {
  if (audio == null) return undefined
  if (audio instanceof ArrayBuffer) return arrayBufferToBase64(audio)
  if (typeof audio !== 'string') {
    return arrayBufferToBase64(await audio.arrayBuffer())
  }

  if (audio.startsWith('data:')) {
    const commaIndex = audio.indexOf(',')
    const header = commaIndex === -1 ? '' : audio.slice(5, commaIndex)
    if (commaIndex === -1 || !/;base64$/i.test(header)) {
      throw new Error(
        'ElevenLabs voice design needs base64 reference audio. Pass a base64 data URL, a base64 string, a Blob, or an ArrayBuffer.',
      )
    }
    return audio.slice(commaIndex + 1)
  }

  if (/^https?:\/\//i.test(audio)) {
    throw new Error(
      'ElevenLabs voice design does not accept reference audio URLs. Read the file yourself and pass a Blob, ArrayBuffer, or base64 string.',
    )
  }

  return audio
}

/**
 * Create an ElevenLabs voice-design adapter using `ELEVENLABS_API_KEY` from env.
 */
export function elevenlabsVoiceDesign<TModel extends ElevenLabsVoiceModel>(
  model: TModel,
  config?: ElevenLabsClientConfig,
): ElevenLabsVoiceAdapter<TModel> {
  return new ElevenLabsVoiceAdapter(model, config)
}

/**
 * Create an ElevenLabs voice-design adapter with an explicit API key.
 */
export function createElevenLabsVoiceDesign<
  TModel extends ElevenLabsVoiceModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsClientConfig, 'apiKey'>,
): ElevenLabsVoiceAdapter<TModel> {
  return new ElevenLabsVoiceAdapter(model, { apiKey, ...config })
}
