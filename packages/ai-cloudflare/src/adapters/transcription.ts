import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { arrayBufferToBase64, generateId } from '@tanstack/ai-utils'
import { isBindingConfig, resolveConfigFromEnv } from '../utils/config'
import { runModel } from '../utils/run'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
  TranscriptionWord,
} from '@tanstack/ai'
import type {
  CloudflareConfig,
  CloudflareConfigInput,
  FetchLike,
} from '../utils/config'
import type { CloudflareTranscriptionModel } from '../utils/models'

/** Extra inputs forwarded to the transcription model (model specific). */
export type CloudflareTranscriptionProviderOptions = Record<string, unknown>

interface WhisperOutput {
  text?: string
  transcription_info?: { language?: string; duration?: number }
  segments?: Array<{ start: number; end: number; text: string }>
  words?: Array<{ word?: string; start?: number; end?: number }>
}

interface NovaOutput {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string
        words?: Array<{ word?: string; start?: number; end?: number }>
      }>
    }>
  }
  metadata?: { duration?: number }
}

async function toBytes(
  audio: TranscriptionOptions['audio'],
  fetchImpl: FetchLike,
  signal: AbortSignal | undefined,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (typeof audio === 'string') {
    // Base64 (data URI or bare) or a URL to fetch.
    if (/^https?:\/\//.test(audio)) {
      const response = await fetchImpl(audio, { signal })
      if (!response.ok) {
        throw new Error(
          `Could not fetch audio from ${audio} (${response.status})`,
        )
      }
      return {
        bytes: await response.arrayBuffer(),
        contentType: response.headers.get('content-type') ?? 'audio/mpeg',
      }
    }
    const match = /^data:([^;]+);base64,(.*)$/.exec(audio)
    const base64 = match?.[2] ?? audio
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { bytes: bytes.buffer, contentType: match?.[1] ?? 'audio/mpeg' }
  }
  if (audio instanceof ArrayBuffer) {
    return { bytes: audio, contentType: 'audio/mpeg' }
  }
  return {
    bytes: await audio.arrayBuffer(),
    contentType: audio.type || 'audio/mpeg',
  }
}

/**
 * Cloudflare transcription adapter. Whisper models take base64 audio in the
 * `audio` input; Deepgram Nova takes the raw bytes. Both return text plus
 * timed words, and Whisper also returns segments.
 */
export class CloudflareTranscriptionAdapter<
  TModel extends CloudflareTranscriptionModel,
> extends BaseTranscriptionAdapter<
  TModel,
  CloudflareTranscriptionProviderOptions
> {
  readonly name = 'cloudflare' as const

  constructor(
    private readonly cfConfig: CloudflareConfig,
    model: TModel,
  ) {
    super(model, {})
  }

  async transcribe(
    options: TranscriptionOptions<CloudflareTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const { model, logger, language, prompt } = options
    try {
      logger.request(
        `activity=transcription provider=${this.name} model=${model}`,
        {
          provider: this.name,
          model,
        },
      )
      const fetchImpl =
        (isBindingConfig(this.cfConfig) ? undefined : this.cfConfig.fetch) ??
        fetch
      const { bytes, contentType } = await toBytes(
        options.audio,
        fetchImpl,
        options.abortSignal,
      )
      const output = model.startsWith('@cf/deepgram/')
        ? await this.runNova(model, bytes, contentType, options)
        : await this.runWhisper(
            model,
            bytes,
            { language, prompt, ...options.modelOptions },
            options.abortSignal,
          )
      return { id: generateId(this.name), model, ...output }
    } catch (error: unknown) {
      logger.errors(`${this.name}.transcribe fatal`, {
        error: toRunErrorPayload(error, `${this.name}.transcribe failed`),
        source: `${this.name}.transcribe`,
      })
      throw error
    }
  }

  private async runWhisper(
    model: string,
    bytes: ArrayBuffer,
    inputs: { language?: string; prompt?: string } & Record<string, unknown>,
    signal: AbortSignal | undefined,
  ): Promise<Omit<TranscriptionResult, 'id' | 'model'>> {
    const { language, prompt, ...rest } = inputs
    const output = (await runModel(
      this.cfConfig,
      model,
      {
        ...(language && { language }),
        ...(prompt && { initial_prompt: prompt }),
        ...rest,
        audio: arrayBufferToBase64(bytes),
      },
      { signal },
    )) as WhisperOutput
    if (typeof output.text !== 'string') {
      throw new Error(`Workers AI ${model} returned no transcript`)
    }
    return {
      text: output.text,
      language: output.transcription_info?.language,
      duration: output.transcription_info?.duration,
      segments: output.segments?.map(
        (segment, id): TranscriptionSegment => ({
          id,
          start: segment.start,
          end: segment.end,
          text: segment.text.trim(),
        }),
      ),
      words: toWords(output.words),
    }
  }

  private async runNova(
    model: string,
    bytes: ArrayBuffer,
    contentType: string,
    options: TranscriptionOptions<CloudflareTranscriptionProviderOptions>,
  ): Promise<Omit<TranscriptionResult, 'id' | 'model'>> {
    const output = (await runModel(
      this.cfConfig,
      model,
      {
        ...(options.language && { language: options.language }),
        ...options.modelOptions,
      },
      {
        signal: options.abortSignal,
        binary: { field: 'audio', body: bytes, contentType },
      },
    )) as NovaOutput
    const alternative = output.results?.channels?.[0]?.alternatives?.[0]
    if (typeof alternative?.transcript !== 'string') {
      throw new Error(`Workers AI ${model} returned no transcript`)
    }
    return {
      text: alternative.transcript,
      duration: output.metadata?.duration,
      words: toWords(alternative?.words),
    }
  }
}

function toWords(
  words: Array<{ word?: string; start?: number; end?: number }> | undefined,
): Array<TranscriptionWord> | undefined {
  return words?.map((w) => ({
    word: (w.word ?? '').trim(),
    start: w.start ?? 0,
    end: w.end ?? 0,
  }))
}

export function createCloudflareTranscription<
  TModel extends CloudflareTranscriptionModel,
>(
  model: TModel,
  config: CloudflareConfig,
): CloudflareTranscriptionAdapter<TModel> {
  return new CloudflareTranscriptionAdapter(config, model)
}

export function cloudflareTranscription<
  TModel extends CloudflareTranscriptionModel,
>(
  model: TModel,
  config?: CloudflareConfigInput,
): CloudflareTranscriptionAdapter<TModel> {
  return new CloudflareTranscriptionAdapter(resolveConfigFromEnv(config), model)
}
