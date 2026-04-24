import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { generateId, getGrokApiKeyFromEnv, toAudioFile } from '../utils'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionWord,
} from '@tanstack/ai'
import type { GrokTranscriptionModel } from '../model-meta'
import type { GrokTranscriptionProviderOptions } from '../audio/transcription-provider-options'

const DEFAULT_GROK_BASE_URL = 'https://api.x.ai/v1'

/**
 * Configuration for the Grok transcription adapter.
 *
 * Uses direct `fetch` rather than the OpenAI SDK because xAI's `/v1/stt`
 * endpoint is not OpenAI-compatible.
 */
export interface GrokTranscriptionConfig {
  apiKey: string
  baseURL?: string
  /** Additional headers to merge into every request (e.g., test IDs). */
  defaultHeaders?: Record<string, string>
}

/**
 * xAI STT response shape from `POST /v1/stt`.
 * Grok returns word-level timestamps only; no segment array.
 */
interface GrokSTTWord {
  text: string
  start: number
  end: number
  confidence?: number
  speaker?: number
}

interface GrokSTTResponse {
  text: string
  language?: string
  duration?: number
  words?: Array<GrokSTTWord>
  channels?: Array<unknown>
}

/**
 * Grok Speech-to-Text Adapter.
 *
 * Talks to `POST {baseURL}/stt` per
 * https://docs.x.ai/developers/rest-api-reference/inference/voice
 */
export class GrokTranscriptionAdapter<
  TModel extends GrokTranscriptionModel,
> extends BaseTranscriptionAdapter<TModel, GrokTranscriptionProviderOptions> {
  readonly name = 'grok' as const

  private readonly apiKey: string
  private readonly baseURL: string
  private readonly defaultHeaders: Record<string, string>

  constructor(config: GrokTranscriptionConfig, model: TModel) {
    super(config, model)
    this.apiKey = config.apiKey
    this.baseURL = (config.baseURL ?? DEFAULT_GROK_BASE_URL).replace(/\/+$/, '')
    this.defaultHeaders = config.defaultHeaders ?? {}
  }

  async transcribe(
    options: TranscriptionOptions<GrokTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const { logger } = options
    const { model, audio, language, modelOptions } = options

    logger.request(
      `activity=generateTranscription provider=grok model=${model}`,
      { provider: 'grok', model },
    )

    const file = toAudioFile(audio)
    const form = new FormData()
    form.set('file', file)
    if (language) form.set('language', language)
    if (modelOptions?.audio_format !== undefined) {
      form.set('audio_format', modelOptions.audio_format)
    }
    if (modelOptions?.sample_rate !== undefined) {
      form.set('sample_rate', String(modelOptions.sample_rate))
    }
    if (modelOptions?.format !== undefined) {
      form.set('format', modelOptions.format ? 'true' : 'false')
    }
    if (modelOptions?.multichannel !== undefined) {
      form.set('multichannel', modelOptions.multichannel ? 'true' : 'false')
    }
    if (modelOptions?.channels !== undefined) {
      form.set('channels', String(modelOptions.channels))
    }
    if (modelOptions?.diarize !== undefined) {
      form.set('diarize', modelOptions.diarize ? 'true' : 'false')
    }

    try {
      const response = await fetch(`${this.baseURL}/stt`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...this.defaultHeaders,
        },
        body: form,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Grok transcription request failed: ${response.status} ${errorText}`,
        )
      }

      const data = (await response.json()) as GrokSTTResponse

      const words: Array<TranscriptionWord> | undefined = data.words?.map(
        (w) => ({
          word: w.text,
          start: w.start,
          end: w.end,
        }),
      )

      return {
        id: generateId(this.name),
        model,
        text: data.text,
        language: data.language ?? language,
        duration: data.duration,
        words,
      }
    } catch (error) {
      logger.errors('grok.transcribe fatal', {
        error,
        source: 'grok.transcribe',
      })
      throw error
    }
  }
}

/**
 * Creates a Grok transcription adapter with an explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createGrokTranscription('grok-stt', 'xai-...')
 * const result = await generateTranscription({
 *   adapter,
 *   audio: audioFile,
 *   language: 'en',
 * })
 * ```
 */
export function createGrokTranscription<TModel extends GrokTranscriptionModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokTranscriptionConfig, 'apiKey'>,
): GrokTranscriptionAdapter<TModel> {
  return new GrokTranscriptionAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Grok transcription adapter, reading the API key from
 * `XAI_API_KEY` in the environment.
 *
 * @throws Error if `XAI_API_KEY` is not set.
 */
export function grokTranscription<TModel extends GrokTranscriptionModel>(
  model: TModel,
  config?: Omit<GrokTranscriptionConfig, 'apiKey'>,
): GrokTranscriptionAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokTranscription(model, apiKey, config)
}
