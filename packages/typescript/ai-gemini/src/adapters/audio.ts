import { BaseAudioAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type { GEMINI_AUDIO_MODELS } from '../model-meta'
import type {
  AudioGenerationOptions,
  AudioGenerationResult,
} from '@tanstack/ai'
import type { GoogleGenAI } from '@google/genai'
import type { GeminiClientConfig } from '../utils'

/**
 * Provider options for Gemini Lyria music generation.
 *
 * Notes on the Lyria 3 surface area:
 * - `lyria-3-clip-preview` always returns MP3 (30-second clips). It does
 *   not accept `responseMimeType`, and duration is fixed at 30 seconds —
 *   the generic `duration` option on `AudioActivityOptions` is ignored.
 * - `lyria-3-pro-preview` returns MP3 by default. Duration is controlled
 *   via the natural-language prompt, not a separate SDK field, so the
 *   generic `duration` option is similarly ignored.
 * - `negativePrompt` is NOT accepted by `GenerateContentConfig` and has
 *   therefore been removed from this surface to avoid giving callers a
 *   silently-dropped knob.
 *
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 */
export interface GeminiAudioProviderOptions {
  /**
   * Seed for deterministic generation.
   */
  seed?: number
}

export interface GeminiAudioConfig extends GeminiClientConfig {}

/** Model type for Gemini Lyria audio generation */
export type GeminiAudioModel = (typeof GEMINI_AUDIO_MODELS)[number]

/**
 * Gemini Lyria Music Generation Adapter.
 *
 * Tree-shakeable adapter for Google Lyria music generation via the Gemini API.
 *
 * Models:
 * - `lyria-3-pro-preview` — flagship model, full-length songs with verses,
 *   choruses, and bridges. Outputs MP3 or WAV at 48 kHz stereo.
 * - `lyria-3-clip-preview` — 30-second clips in MP3.
 *
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 *
 * @example
 * ```typescript
 * const adapter = geminiAudio('lyria-3-pro-preview')
 * const result = await generateAudio({
 *   adapter,
 *   prompt: 'An upbeat jazz track with saxophone and drums',
 * })
 * ```
 */
export class GeminiAudioAdapter<
  TModel extends GeminiAudioModel,
> extends BaseAudioAdapter<TModel, GeminiAudioProviderOptions> {
  readonly name = 'gemini' as const

  private client: GoogleGenAI

  constructor(config: GeminiAudioConfig, model: TModel) {
    super(model, config)
    this.client = createGeminiClient(config)
  }

  async generateAudio(
    options: AudioGenerationOptions<GeminiAudioProviderOptions>,
  ): Promise<AudioGenerationResult> {
    const { model, prompt, modelOptions, logger } = options

    logger.request(`activity=generateAudio provider=gemini model=${model}`, {
      provider: 'gemini',
      model,
    })

    try {
      // FIXME (SDK audit): Lyria 3 music generation may not belong on
      // generateContent at all — @google/genai exposes a `LiveMusicSession`
      // (`ai.live.music.connect`) with a `musicGenerationConfig` object.
      // `seed` is valid on GenerateContentConfig, and Lyria always returns
      // MP3 today, so we don't forward `responseMimeType` either.
      // The runtime test `emits only GenerateContentConfig-valid fields`
      // asserts the config shape so a later SDK audit can catch regressions.
      const response = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseModalities: ['AUDIO', 'TEXT'],
          ...(modelOptions?.seed != null ? { seed: modelOptions.seed } : {}),
        },
      })

      const parts = response.candidates?.[0]?.content?.parts ?? []
      const audioPart = parts.find((part: any) =>
        part.inlineData?.mimeType?.startsWith('audio/'),
      )

      if (!audioPart?.inlineData?.data) {
        throw new Error('No audio data in Gemini Lyria response')
      }

      // audioPart was selected because mimeType.startsWith('audio/') was
      // truthy, so the mime type is guaranteed to be a string here. Trust the
      // value Gemini returned rather than inventing a non-standard
      // `audio/mp3` fallback (IANA is `audio/mpeg`).
      const contentType = audioPart.inlineData.mimeType

      return {
        id: generateId(this.name),
        model,
        audio: {
          b64Json: audioPart.inlineData.data,
          contentType,
        },
      }
    } catch (error) {
      logger.errors('gemini.generateAudio fatal', {
        error,
        source: 'gemini.generateAudio',
      })
      throw error
    }
  }
}

/**
 * Creates a Gemini Lyria audio adapter with an explicit API key.
 *
 * @param model - The Lyria model name (e.g., 'lyria-3-pro-preview')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 *
 * @example
 * ```typescript
 * const adapter = createGeminiAudio('lyria-3-pro-preview', 'your-api-key')
 * const result = await generateAudio({
 *   adapter,
 *   prompt: 'Ambient electronic music with soft pads',
 * })
 * ```
 */
export function createGeminiAudio<TModel extends GeminiAudioModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiAudioConfig, 'apiKey'>,
): GeminiAudioAdapter<TModel> {
  // Put apiKey LAST so caller-supplied config can't silently override the
  // explicit argument.
  return new GeminiAudioAdapter({ ...config, apiKey }, model)
}

/**
 * Creates a Gemini Lyria audio adapter with automatic API key detection.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in the environment.
 *
 * @param model - The Lyria model name (e.g., 'lyria-3-pro-preview')
 * @param config - Optional configuration (excluding apiKey)
 *
 * @example
 * ```typescript
 * const adapter = geminiAudio('lyria-3-pro-preview')
 * const result = await generateAudio({
 *   adapter,
 *   prompt: 'An orchestral piece with strings and brass',
 * })
 * ```
 */
export function geminiAudio<TModel extends GeminiAudioModel>(
  model: TModel,
  config?: Omit<GeminiAudioConfig, 'apiKey'>,
): GeminiAudioAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiAudio(model, apiKey, config)
}
