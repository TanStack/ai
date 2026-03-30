import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import { createOpenAICompatibleClient } from '../utils/client'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAICompatibleClientConfig } from '../types/config'

/**
 * OpenAI-Compatible Transcription (Speech-to-Text) Adapter
 *
 * A generalized base class for providers that implement OpenAI-compatible audio
 * transcription APIs. Providers can extend this class and only need to:
 * - Set `baseURL` in the config
 * - Lock the generic type parameters to provider-specific types
 * - Override audio handling or response mapping methods as needed
 *
 * All methods that handle audio input or map response formats are `protected`
 * so subclasses can override them.
 */
export class OpenAICompatibleTranscriptionAdapter<
  TModel extends string,
  TProviderOptions extends object = Record<string, any>,
> extends BaseTranscriptionAdapter<TModel, TProviderOptions> {
  readonly name: string

  protected client: OpenAI_SDK

  constructor(
    config: OpenAICompatibleClientConfig,
    model: TModel,
    name: string = 'openai-compatible',
  ) {
    super(config, model)
    this.name = name
    this.client = createOpenAICompatibleClient(config)
  }

  async transcribe(
    options: TranscriptionOptions<TProviderOptions>,
  ): Promise<TranscriptionResult> {
    const { model, audio, language, prompt, responseFormat, modelOptions } =
      options

    // Convert audio input to File object
    const file = this.prepareAudioFile(audio)

    // Build request
    const request: OpenAI_SDK.Audio.TranscriptionCreateParams = {
      model,
      file,
      language,
      prompt,
      response_format: this.mapResponseFormat(responseFormat),
      ...modelOptions,
    }

    // Call API - use verbose_json to get timestamps when available
    const useVerbose =
      responseFormat === 'verbose_json' ||
      (!responseFormat && model !== 'whisper-1')

    if (useVerbose) {
      const response = await this.client.audio.transcriptions.create({
        ...request,
        response_format: 'verbose_json',
      })

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
            confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
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
  }

  protected prepareAudioFile(audio: string | File | Blob | ArrayBuffer): File {
    // If already a File, return it
    if (typeof File !== 'undefined' && audio instanceof File) {
      return audio
    }

    // If Blob, convert to File
    if (typeof Blob !== 'undefined' && audio instanceof Blob) {
      return new File([audio], 'audio.mp3', {
        type: audio.type || 'audio/mpeg',
      })
    }

    // If ArrayBuffer, convert to File
    if (audio instanceof ArrayBuffer) {
      return new File([audio], 'audio.mp3', { type: 'audio/mpeg' })
    }

    // If base64 string, decode and convert to File
    if (typeof audio === 'string') {
      // Check if it's a data URL
      if (audio.startsWith('data:')) {
        const parts = audio.split(',')
        const header = parts[0]
        const base64Data = parts[1] || ''
        const mimeMatch = header?.match(/data:([^;]+)/)
        const mimeType = mimeMatch?.[1] || 'audio/mpeg'
        const binaryStr = atob(base64Data)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        const extension = mimeType.split('/')[1] || 'mp3'
        return new File([bytes], `audio.${extension}`, { type: mimeType })
      }

      // Assume raw base64
      const binaryStr = atob(audio)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      return new File([bytes], 'audio.mp3', { type: 'audio/mpeg' })
    }

    throw new Error('Invalid audio input type')
  }

  protected mapResponseFormat(
    format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt',
  ): OpenAI_SDK.Audio.TranscriptionCreateParams['response_format'] {
    if (!format) return 'json'
    return format as OpenAI_SDK.Audio.TranscriptionCreateParams['response_format']
  }
}
