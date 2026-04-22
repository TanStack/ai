import { BaseMusicAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type { GEMINI_LYRIA_MODELS } from '../model-meta'
import type {
  MusicGenerationOptions,
  MusicGenerationResult,
} from '@tanstack/ai'
import type { GoogleGenAI } from '@google/genai'
import type { GeminiClientConfig } from '../utils'

/**
 * Provider options for Gemini Lyria music generation.
 *
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 */
export interface GeminiMusicProviderOptions {
  /**
   * Output audio MIME type.
   * - `audio/mp3` (default, both models)
   * - `audio/wav` (Lyria 3 Pro only)
   */
  responseMimeType?: 'audio/mp3' | 'audio/wav'

  /**
   * Seed for deterministic generation.
   */
  seed?: number

  /**
   * Negative prompt — describe what to exclude from the output.
   */
  negativePrompt?: string
}

export interface GeminiMusicConfig extends GeminiClientConfig {}

/** Model type for Gemini Lyria music generation */
export type GeminiMusicModel = (typeof GEMINI_LYRIA_MODELS)[number]

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
 * const adapter = geminiMusic('lyria-3-pro-preview')
 * const result = await generateMusic({
 *   adapter,
 *   prompt: 'An upbeat jazz track with saxophone and drums',
 * })
 * ```
 */
export class GeminiMusicAdapter<
  TModel extends GeminiMusicModel,
> extends BaseMusicAdapter<TModel, GeminiMusicProviderOptions> {
  readonly name = 'gemini' as const

  private client: GoogleGenAI

  constructor(config: GeminiMusicConfig, model: TModel) {
    super(config, model)
    this.client = createGeminiClient(config)
  }

  async generateMusic(
    options: MusicGenerationOptions<GeminiMusicProviderOptions>,
  ): Promise<MusicGenerationResult> {
    const { model, prompt, modelOptions } = options

    const response = await this.client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        responseMimeType: modelOptions?.responseMimeType ?? 'audio/mp3',
        ...(modelOptions?.seed != null ? { seed: modelOptions.seed } : {}),
        ...(modelOptions?.negativePrompt
          ? { negativePrompt: modelOptions.negativePrompt }
          : {}),
      },
    })

    const parts = response.candidates?.[0]?.content?.parts ?? []
    const audioPart = parts.find((part: any) =>
      part.inlineData?.mimeType?.startsWith('audio/'),
    )

    if (!audioPart?.inlineData?.data) {
      throw new Error('No audio data in Gemini Lyria response')
    }

    const contentType = audioPart.inlineData.mimeType ?? 'audio/mp3'

    return {
      id: generateId(this.name),
      model,
      audio: {
        b64Json: audioPart.inlineData.data,
        contentType,
      },
    }
  }
}

/**
 * Creates a Gemini Lyria music adapter with an explicit API key.
 *
 * @param model - The Lyria model name (e.g., 'lyria-3-pro-preview')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 *
 * @example
 * ```typescript
 * const adapter = createGeminiMusic('lyria-3-pro-preview', 'your-api-key')
 * const result = await generateMusic({
 *   adapter,
 *   prompt: 'Ambient electronic music with soft pads',
 * })
 * ```
 */
export function createGeminiMusic<TModel extends GeminiMusicModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiMusicConfig, 'apiKey'>,
): GeminiMusicAdapter<TModel> {
  return new GeminiMusicAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Gemini Lyria music adapter with automatic API key detection.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in the environment.
 *
 * @param model - The Lyria model name (e.g., 'lyria-3-pro-preview')
 * @param config - Optional configuration (excluding apiKey)
 *
 * @example
 * ```typescript
 * const adapter = geminiMusic('lyria-3-pro-preview')
 * const result = await generateMusic({
 *   adapter,
 *   prompt: 'An orchestral piece with strings and brass',
 * })
 * ```
 */
export function geminiMusic<TModel extends GeminiMusicModel>(
  model: TModel,
  config?: Omit<GeminiMusicConfig, 'apiKey'>,
): GeminiMusicAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiMusic(model, apiKey, config)
}
