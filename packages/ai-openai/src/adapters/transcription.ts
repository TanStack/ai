import OpenAI from 'openai'
import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { base64ToArrayBuffer, generateId } from '@tanstack/ai-utils'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type {
  TokenUsage,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAITranscriptionModel } from '../model-meta'
import type { OpenAITranscriptionProviderOptions } from '../audio/transcription-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Build TokenUsage from transcription response.
 * Whisper-1 uses duration-based billing, GPT-4o models use token-based billing.
 */
function buildTranscriptionUsage(
  model: string,
  duration?: number,
  response?: OpenAI_SDK.Audio.TranscriptionCreateResponse,
): TokenUsage | undefined {
  // GPT-4o transcription models return usage with tokens
  if (model.startsWith('gpt-4o')) {
    // Check if response has usage field (GPT-4o models may include this)
    const usage = response?.usage as
      | {
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
        }
      | undefined

    if (usage) {
      return {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
        promptTokensDetails: {
          audioTokens: usage.prompt_tokens,
        },
        completionTokensDetails: {
          textTokens: usage.completion_tokens,
        },
      }
    }
  }

  // Whisper-1 uses duration-based billing
  if (duration !== undefined && duration > 0) {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationSeconds: duration,
    }
  }

  return undefined
}

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
 * - Word and segment-level timestamps (with verbose_json — whisper-1 only;
 *   gpt-4o-* transcribe models accept only json/text and reject verbose_json
 *   with HTTP 400)
 * - Speaker diarization (with gpt-4o-transcribe-diarize)
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

    // With exactOptionalPropertyTypes, vendor SDK request shapes reject
    // `T | undefined` in optional fields. Build the request incrementally and
    // only set optional fields when they're actually defined.
    const responseFormatValue = this.mapResponseFormat(responseFormat)
    const request: OpenAI_SDK.Audio.TranscriptionCreateParams = {
      model,
      file,
      ...(modelOptions ?? {}),
    }
    if (language !== undefined) {
      request.language = language
    }
    if (prompt !== undefined) {
      request.prompt = prompt
    }
    if (responseFormatValue !== undefined) {
      request.response_format = responseFormatValue
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

        // `TranscriptionResult` declares optional fields without `| undefined`,
        // so under exactOptionalPropertyTypes we must omit absent fields rather
        // than assigning `undefined`.
        const segments = response.segments?.map(
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
        )
        const words = response.words?.map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        }))
        const usage = buildTranscriptionUsage(
          model,
          response.duration,
          response,
        )
        return {
          id: generateId(this.name),
          model,
          text: response.text,
          language: response.language,
          duration: response.duration,
          ...(segments !== undefined && { segments }),
          ...(words !== undefined && { words }),
          ...(usage !== undefined && { usage }),
        }
      } else {
        const response = await this.client.audio.transcriptions.create(request)

        const usage =
          typeof response === 'string'
            ? undefined
            : buildTranscriptionUsage(model, undefined, response)
        return {
          id: generateId(this.name),
          model,
          text: typeof response === 'string' ? response : response.text,
          ...(language !== undefined && { language }),
          ...(usage !== undefined && { usage }),
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
    return format
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
