import OpenAI from 'openai'
import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { base64ToArrayBuffer, generateId } from '@tanstack/ai-utils'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAITranscriptionModel } from '../model-meta'
import type { OpenAITranscriptionProviderOptions } from '../audio/transcription-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI Transcription adapter
 */
export interface OpenAITranscriptionConfig extends OpenAIClientConfig {}

/**
 * OpenAI Transcription (Speech-to-Text) Adapter.
 * Supports whisper-1 and gpt-4o-transcribe* models. Verbose JSON output
 * (timestamps + segments) only available on whisper-1.
 */
export class OpenAITranscriptionAdapter<
  TModel extends OpenAITranscriptionModel,
> extends BaseTranscriptionAdapter<TModel, OpenAITranscriptionProviderOptions> {
  readonly name = 'openai' as const

  protected client: OpenAI

  constructor(config: OpenAITranscriptionConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(config)
  }

  async transcribe(
    options: TranscriptionOptions<OpenAITranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const { model, audio, language, prompt, responseFormat, modelOptions } =
      options

    const file = this.prepareAudioFile(audio)

    const request: OpenAI_SDK.Audio.TranscriptionCreateParams = {
      model,
      file,
      language,
      prompt,
      response_format: this.mapResponseFormat(responseFormat),
      ...modelOptions,
    }

    // Only Whisper supports verbose_json. The gpt-4o-* transcribe models
    // accept only json/text and reject verbose_json with HTTP 400.
    const useVerbose =
      responseFormat === 'verbose_json' ||
      (!responseFormat && model === 'whisper-1')

    try {
      options.logger.request(
        `activity=transcription provider=${this.name} model=${model} verbose=${useVerbose}`,
        { provider: this.name, model },
      )
      if (useVerbose) {
        const response = (await this.client.audio.transcriptions.create({
          ...request,
          response_format: 'verbose_json',
        })) as OpenAI_SDK.Audio.Transcriptions.TranscriptionVerbose

        return {
          id: generateId(this.name),
          model,
          text: response.text,
          language: response.language,
          duration: response.duration,
          segments: response.segments?.map(
            (seg): TranscriptionSegment => ({
              id: seg.id,
              start: seg.start,
              end: seg.end,
              text: seg.text,
              // The OpenAI SDK types `avg_logprob` as `number`, so call Math.exp
              // directly. Guarding with `seg.avg_logprob ?` would treat `0`
              // (perfect confidence) as missing.
              confidence: Math.exp(seg.avg_logprob),
            }),
          ),
          words: response.words?.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
          })),
        }
      } else {
        const response = await this.client.audio.transcriptions.create(request)

        return {
          id: generateId(this.name),
          model,
          text: typeof response === 'string' ? response : response.text,
          language,
        }
      }
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.transcribe fatal`, {
        error: toRunErrorPayload(error, `${this.name}.transcribe failed`),
        source: `${this.name}.transcribe`,
      })
      throw error
    }
  }

  protected prepareAudioFile(audio: string | File | Blob | ArrayBuffer): File {
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

  // Throws on Node < 20 where the global `File` constructor isn't available.
  private ensureFileSupport(): void {
    if (typeof File === 'undefined') {
      throw new Error(
        '`File` is not available in this environment. ' +
          'Use Node.js 20 or newer, or pass a File object directly.',
      )
    }
  }

  protected mapResponseFormat(
    format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt',
  ): OpenAI_SDK.Audio.TranscriptionCreateParams['response_format'] {
    if (!format) return 'json'
    return format as OpenAI_SDK.Audio.TranscriptionCreateParams['response_format']
  }
}

export function createOpenaiTranscription<
  TModel extends OpenAITranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITranscriptionConfig, 'apiKey'>,
): OpenAITranscriptionAdapter<TModel> {
  return new OpenAITranscriptionAdapter({ apiKey, ...config }, model)
}

export function openaiTranscription<TModel extends OpenAITranscriptionModel>(
  model: TModel,
  config?: Omit<OpenAITranscriptionConfig, 'apiKey'>,
): OpenAITranscriptionAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiTranscription(model, apiKey, config)
}
