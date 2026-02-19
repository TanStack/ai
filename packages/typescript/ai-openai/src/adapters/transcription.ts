import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import {
  createOpenAIClient,
  generateId,
  getOpenAIApiKeyFromEnv,
} from '../utils/client'
import type { OpenAITranscriptionModel } from '../model-meta'
import type { OpenAITranscriptionProviderOptions } from '../audio/transcription-provider-options'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI Transcription adapter
 */
export interface OpenAITranscriptionConfig extends OpenAIClientConfig {}

/**
 * OpenAI Transcription (Speech-to-Text) Adapter
 *
 * Tree-shakeable adapter for OpenAI audio transcription functionality.
 * Supports whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe, and gpt-4o-transcribe-diarize models.
 *
 * Features:
 * - Multiple transcription models with different capabilities
 * - Language detection or specification
 * - Multiple output formats: json, text, srt, verbose_json, vtt
 * - Word and segment-level timestamps (with verbose_json)
 * - Speaker diarization (with gpt-4o-transcribe-diarize)
 */
export class OpenAITranscriptionAdapter<
  TModel extends OpenAITranscriptionModel,
> extends BaseTranscriptionAdapter<TModel, OpenAITranscriptionProviderOptions> {
  readonly name = 'openai' as const

  private client: OpenAI_SDK

  constructor(config: OpenAITranscriptionConfig, model: TModel) {
    super(config, model)
    this.client = createOpenAIClient(config)
  }

  async transcribe(
    options: TranscriptionOptions<OpenAITranscriptionProviderOptions>,
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

    // Call OpenAI API - use verbose_json to get timestamps when available
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

  private prepareAudioFile(audio: string | File | Blob | ArrayBuffer): File {
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

  private mapResponseFormat(
    format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt',
  ): OpenAI_SDK.Audio.TranscriptionCreateParams['response_format'] {
    if (!format) return 'json'
    return format as OpenAI_SDK.Audio.TranscriptionCreateParams['response_format']
  }
}

/**
 * Creates an OpenAI transcription adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'whisper-1')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI transcription adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiTranscription('whisper-1', "sk-...");
 *
 * const result = await generateTranscription({
 *   adapter,
 *   audio: audioFile,
 *   language: 'en'
 * });
 * ```
 */
export function createOpenaiTranscription<
  TModel extends OpenAITranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITranscriptionConfig, 'apiKey'>,
): OpenAITranscriptionAdapter<TModel> {
  return new OpenAITranscriptionAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI transcription adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'whisper-1')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI transcription adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiTranscription('whisper-1');
 *
 * const result = await generateTranscription({
 *   adapter,
 *   audio: audioFile
 * });
 *
 * console.log(result.text)
 * ```
 */
export function openaiTranscription<TModel extends OpenAITranscriptionModel>(
  model: TModel,
  config?: Omit<OpenAITranscriptionConfig, 'apiKey'>,
): OpenAITranscriptionAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiTranscription(model, apiKey, config)
}
