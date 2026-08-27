import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { base64ToArrayBuffer, generateId } from '@tanstack/ai-utils'
import { getGroqApiKeyFromEnv, withGroqDefaults } from '../utils/client'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from '@tanstack/ai'
import type { GroqTranscriptionModel } from '../model-meta'
import type { GroqTranscriptionProviderOptions } from '../audio/transcription-provider-options'
import type { GroqClientConfig } from '../utils/client'

export interface GroqTranscriptionConfig extends GroqClientConfig {}

async function groqTranscriptionError(response: Response): Promise<string> {
  const body = await response
    .json()
    .catch(() => null as Record<string, unknown> | null)
  return (
    (body?.error as { message?: string } | undefined)?.message ??
    `Groq API error ${response.status}`
  )
}

function parseVerboseTranscription(
  data: GroqVerboseTranscriptionResponse,
  model: string,
  adapterName: string,
): TranscriptionResult {
  const requestId = data.x_groq?.id ?? generateId(adapterName)
  const segments = data.segments?.map(
    (seg): TranscriptionSegment => ({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      confidence: Math.exp(seg.avg_logprob),
    }),
  )
  const words = data.words?.map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }))
  return {
    id: requestId,
    model,
    text: data.text,
    ...(data.language !== undefined && { language: data.language }),
    ...(data.duration !== undefined && { duration: data.duration }),
    ...(segments !== undefined && { segments }),
    ...(words !== undefined && { words }),
  }
}

function normalizeHeaders(
  headers: GroqTranscriptionConfig['defaultHeaders'],
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out
  const assign = (key: string, value: unknown) => {
    if (value != null) out[key] = String(value)
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => assign(key, value))
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) assign(key, value)
  } else {
    const headerEntries = Object.entries(headers)
    for (const [key, value] of headerEntries) assign(key, value)
  }
  return out
}

// Shape of Groq's verbose_json transcription response
interface GroqVerboseTranscriptionResponse {
  task?: string
  language?: string
  duration?: number
  text: string
  segments?: Array<{
    id: number
    seek?: number
    start: number
    end: number
    text: string
    tokens?: Array<number>
    temperature?: number
    avg_logprob: number
    compression_ratio?: number
    no_speech_prob?: number
  }>
  words?: Array<{ word: string; start: number; end: number }>
  x_groq?: { id?: string }
}

// Shape of Groq's json transcription response
interface GroqJsonTranscriptionResponse {
  text: string
  x_groq?: { id?: string }
}

export class GroqTranscriptionAdapter<
  TModel extends GroqTranscriptionModel,
> extends BaseTranscriptionAdapter<TModel, GroqTranscriptionProviderOptions> {
  readonly name = 'groq' as const

  private readonly apiKey: string
  private readonly baseURL: string
  private readonly defaultHeaders: Record<string, string>

  constructor(config: GroqTranscriptionConfig, model: TModel) {
    super(model, {})
    const resolved = withGroqDefaults(config)
    this.apiKey = resolved.apiKey
    this.baseURL = resolved.baseURL ?? 'https://api.groq.com/openai/v1'
    this.defaultHeaders = normalizeHeaders(resolved.defaultHeaders)
  }

  async transcribe(
    options: TranscriptionOptions<GroqTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const { model, audio, language, prompt, responseFormat, modelOptions } =
      options

    const isSubtitleFormat =
      responseFormat === 'srt' || responseFormat === 'vtt'
    if (isSubtitleFormat) {
      throw new Error(
        `Groq transcription does not support responseFormat='${responseFormat}'. ` +
          `Supported values: 'json', 'text', 'verbose_json'.`,
      )
    }

    // Default to verbose_json so callers get language, duration, and timestamps
    // without having to opt in explicitly. Both Groq whisper models support it.
    const effectiveFormat = responseFormat ?? 'verbose_json'
    const useVerbose = effectiveFormat === 'verbose_json'

    const form = new FormData()
    form.append('model', model)
    form.append('response_format', effectiveFormat)
    if (language !== undefined) form.append('language', language)
    if (prompt !== undefined) form.append('prompt', prompt)
    if (modelOptions?.temperature !== undefined) {
      form.append('temperature', String(modelOptions.temperature))
    }
    if (modelOptions?.timestamp_granularities !== undefined) {
      for (const g of modelOptions.timestamp_granularities) {
        form.append('timestamp_granularities[]', g)
      }
    }

    if (typeof audio === 'string' && /^https?:\/\//.test(audio)) {
      form.append('url', audio)
    } else {
      form.append('file', this.prepareAudioFile(audio))
    }

    try {
      options.logger.request(
        `activity=transcription provider=${this.name} model=${model} verbose=${useVerbose}`,
        { provider: this.name, model },
      )

      const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: form,
      })

      if (!response.ok) {
        throw new Error(await groqTranscriptionError(response))
      }

      return await this.parseTranscriptionResponse(
        response,
        model,
        language,
        useVerbose,
        effectiveFormat,
      )
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.transcribe fatal`, {
        error,
        source: `${this.name}.transcribe`,
      })
      throw error
    }
  }

  private async parseTranscriptionResponse(
    response: Response,
    model: string,
    language: string | undefined,
    useVerbose: boolean,
    effectiveFormat: string,
  ): Promise<TranscriptionResult> {
    if (useVerbose) {
      return parseVerboseTranscription(
        (await response.json()) as GroqVerboseTranscriptionResponse,
        model,
        this.name,
      )
    }
    if (effectiveFormat === 'text') {
      const text = await response.text()
      return {
        id: generateId(this.name),
        model,
        text,
        ...(language !== undefined && { language }),
      }
    }
    const data = (await response.json()) as GroqJsonTranscriptionResponse
    return {
      id: data.x_groq?.id ?? generateId(this.name),
      model,
      text: data.text,
      ...(language !== undefined && { language }),
    }
  }

  private prepareAudioFile(audio: string | File | Blob | ArrayBuffer): File {
    if (typeof File !== 'undefined' && audio instanceof File) {
      return audio
    }
    if (typeof Blob !== 'undefined' && audio instanceof Blob) {
      this.ensureFileSupport()
      return new File([audio], 'audio.mp3', {
        type: audio.type || 'audio/mpeg',
      })
    }
    if (typeof ArrayBuffer !== 'undefined' && audio instanceof ArrayBuffer) {
      this.ensureFileSupport()
      return new File([audio], 'audio.mp3', { type: 'audio/mpeg' })
    }
    if (typeof audio === 'string') {
      this.ensureFileSupport()

      if (audio.startsWith('data:')) {
        const parts = audio.split(',')
        const header = parts[0]
        const base64Data = parts[1] || ''
        const mimeMatch = header?.match(/data:([^;]+)/)
        const mimeType = mimeMatch?.[1] || 'audio/mpeg'
        const bytes = base64ToArrayBuffer(base64Data)
        const extension = mimeType.split('/')[1] || 'mp3'
        return new File([bytes], `audio.${extension}`, { type: mimeType })
      }

      const bytes = base64ToArrayBuffer(audio)
      return new File([bytes], 'audio.mp3', { type: 'audio/mpeg' })
    }

    throw new Error('Invalid audio input type')
  }

  // Throws on Node < 20 where the global `File` constructor is unavailable.
  private ensureFileSupport(): void {
    if (typeof File === 'undefined') {
      throw new Error(
        '`File` is not available in this environment. ' +
          'Use Node.js 20 or newer, or pass a File object directly.',
      )
    }
  }
}

export function createGroqTranscription<TModel extends GroqTranscriptionModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqTranscriptionConfig, 'apiKey'>,
): GroqTranscriptionAdapter<TModel> {
  return new GroqTranscriptionAdapter({ apiKey, ...config }, model)
}

export function groqTranscription<TModel extends GroqTranscriptionModel>(
  model: TModel,
  config?: Omit<GroqTranscriptionConfig, 'apiKey'>,
): GroqTranscriptionAdapter<TModel> {
  const apiKey = getGroqApiKeyFromEnv()
  return createGroqTranscription(model, apiKey, config)
}
