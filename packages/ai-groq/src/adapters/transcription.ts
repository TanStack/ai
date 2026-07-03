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

/**
 * Configuration for the Groq Transcription adapter.
 */
export interface GroqTranscriptionConfig extends GroqClientConfig {}

/**
 * Flattens the `openai` SDK's `HeadersLike` config value into a plain record so
 * it can be merged into the raw `fetch` request this adapter issues. Handles
 * the shapes callers actually pass (`Headers`, an entries array, or a plain
 * object); null/undefined values are dropped.
 *
 * ponytail: doesn't unwrap the SDK's internal `NullableHeaders` class; forward
 * that shape here if the SDK ever hands it to adapter config.
 */
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
    for (const [key, value] of Object.entries(headers)) assign(key, value)
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

/**
 * Groq Transcription (Speech-to-Text) Adapter
 *
 * Tree-shakeable adapter for Groq audio transcription. Supports
 * whisper-large-v3 and whisper-large-v3-turbo.
 *
 * Features:
 * - Audio file uploads (File, Blob, ArrayBuffer, base64/data URL)
 * - Remote audio URLs passed directly via Groq's `url` field — no upload needed
 * - Verbose JSON response with segment and word timestamps
 * - Language detection or specification (ISO-639-1)
 * - Confidence scores derived from segment avg_logprob
 */
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

    // Groq's transcription endpoint only accepts 'json', 'text', and
    // 'verbose_json'. Reject 'srt'/'vtt' up front so callers get a clear
    // message instead of an opaque Groq HTTP error.
    if (responseFormat === 'srt' || responseFormat === 'vtt') {
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

    // HTTP/HTTPS URLs are forwarded directly via Groq's `url` field, which
    // avoids a round-trip upload. All other inputs (File, Blob, ArrayBuffer,
    // base64, data URL) are converted to a File and sent as `file`.
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
        const body = await response
          .json()
          .catch(() => null as Record<string, unknown> | null)
        const message =
          (body?.error as { message?: string } | undefined)?.message ??
          `Groq API error ${response.status}`
        throw new Error(message)
      }

      if (useVerbose) {
        const data = (await response.json()) as GroqVerboseTranscriptionResponse
        const requestId = data.x_groq?.id ?? generateId(this.name)

        // `TranscriptionResult` declares optional fields without `| undefined`,
        // so under exactOptionalPropertyTypes we must omit absent fields rather
        // than assigning `undefined`.
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
      } else if (effectiveFormat === 'text') {
        const text = await response.text()
        return {
          id: generateId(this.name),
          model,
          text,
          ...(language !== undefined && { language }),
        }
      } else {
        const data = (await response.json()) as GroqJsonTranscriptionResponse
        return {
          id: data.x_groq?.id ?? generateId(this.name),
          model,
          text: data.text,
          ...(language !== undefined && { language }),
        }
      }
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.transcribe fatal`, {
        error,
        source: `${this.name}.transcribe`,
      })
      throw error
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

/**
 * Creates a Groq transcription adapter with an explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'whisper-large-v3-turbo')
 * @param apiKey - Your Groq API key
 * @param config - Optional additional configuration
 * @returns Configured Groq transcription adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGroqTranscription('whisper-large-v3-turbo', 'gsk_...');
 *
 * const result = await generateTranscription({
 *   adapter,
 *   audio: audioFile,
 *   language: 'en',
 * });
 * ```
 */
export function createGroqTranscription<TModel extends GroqTranscriptionModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqTranscriptionConfig, 'apiKey'>,
): GroqTranscriptionAdapter<TModel> {
  return new GroqTranscriptionAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Groq transcription adapter using the `GROQ_API_KEY` environment
 * variable. Type resolution happens here at the call site.
 *
 * Looks for `GROQ_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (browser with injected env)
 *
 * @param model - The model name (e.g., 'whisper-large-v3-turbo')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Groq transcription adapter instance
 * @throws Error if GROQ_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * const adapter = groqTranscription('whisper-large-v3-turbo');
 *
 * const result = await generateTranscription({
 *   adapter,
 *   audio: 'https://example.com/audio.mp3',
 * });
 *
 * console.log(result.text)
 * ```
 */
export function groqTranscription<TModel extends GroqTranscriptionModel>(
  model: TModel,
  config?: Omit<GroqTranscriptionConfig, 'apiKey'>,
): GroqTranscriptionAdapter<TModel> {
  const apiKey = getGroqApiKeyFromEnv()
  return createGroqTranscription(model, apiKey, config)
}
