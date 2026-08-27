import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { generateId, getGrokApiKeyFromEnv, toAudioFile } from '../utils'
import type {
  TokenUsage,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionWord,
} from '@tanstack/ai'
import type { GrokTranscriptionModel } from '../model-meta'
import type { GrokTranscriptionProviderOptions } from '../audio/transcription-provider-options'

export interface GrokTranscriptionWord extends TranscriptionWord {
  /** Model confidence for the word, when xAI returns one. */
  confidence?: number
  /** Speaker index, populated when `modelOptions.diarize === true`. */
  speaker?: number
}

const DEFAULT_GROK_BASE_URL = 'https://api.x.ai/v1'

export interface GrokTranscriptionConfig {
  apiKey: string
  baseURL?: string
  /** Additional headers to merge into every request (e.g., test IDs). */
  defaultHeaders?: Record<string, string>
}

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

export class GrokTranscriptionAdapter<
  TModel extends GrokTranscriptionModel,
> extends BaseTranscriptionAdapter<TModel, GrokTranscriptionProviderOptions> {
  readonly name = 'grok' as const

  private readonly apiKey: string
  private readonly baseURL: string
  private readonly defaultHeaders: Record<string, string>

  constructor(config: GrokTranscriptionConfig, model: TModel) {
    super(model, config)
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

    const file = toAudioFile(audio, modelOptions?.audio_format)
    const form = buildTranscriptionFormData({ file, language, modelOptions })

    try {
      const response = await fetch(`${this.baseURL}/stt`, {
        method: 'POST',
        headers: {
          // `defaultHeaders` first so Authorization always wins.
          ...this.defaultHeaders,
          Authorization: `Bearer ${this.apiKey}`,
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
        (w) => {
          const tw: GrokTranscriptionWord = {
            word: w.text,
            start: w.start,
            end: w.end,
          }
          if (w.confidence !== undefined) tw.confidence = w.confidence
          if (w.speaker !== undefined) tw.speaker = w.speaker
          return tw
        },
      )

      const resolvedLanguage = data.language ?? language
      const usage: TokenUsage | undefined =
        data.duration !== undefined && data.duration > 0
          ? {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              billed: { quantity: data.duration, unit: 'seconds' },
              durationSeconds: data.duration,
            }
          : undefined
      return {
        id: generateId(this.name),
        model,
        text: data.text,
        ...(resolvedLanguage !== undefined && { language: resolvedLanguage }),
        duration: data.duration,
        ...(words !== undefined && { words }),
        ...(usage !== undefined && { usage }),
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

export function buildTranscriptionFormData(options: {
  file: File
  language: string | undefined
  modelOptions: GrokTranscriptionProviderOptions | undefined
}): FormData {
  const { file, language, modelOptions } = options
  const form = new FormData()
  form.set('file', file)
  if (language) form.set('language', language)
  if (modelOptions?.audio_format !== undefined) {
    form.set('audio_format', modelOptions.audio_format)
  }
  if (modelOptions?.sample_rate !== undefined) {
    form.set('sample_rate', String(modelOptions.sample_rate))
  }
  if (modelOptions?.inverse_text_normalization !== undefined) {
    form.set(
      'format',
      modelOptions.inverse_text_normalization ? 'true' : 'false',
    )
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
  return form
}

export function createGrokTranscription<TModel extends GrokTranscriptionModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokTranscriptionConfig, 'apiKey'>,
): GrokTranscriptionAdapter<TModel> {
  return new GrokTranscriptionAdapter({ apiKey, ...config }, model)
}

export function grokTranscription<TModel extends GrokTranscriptionModel>(
  model: TModel,
  config?: Omit<GrokTranscriptionConfig, 'apiKey'>,
): GrokTranscriptionAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokTranscription(model, apiKey, config)
}
