import OpenAI from 'openai'
import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { base64ToArrayBuffer, generateId } from '@tanstack/ai-utils'
import {
  getLovableApiKeyFromEnv,
  openaiRequestOptions,
  withLovableDefaults,
} from '../utils/client'
import type {
  TokenUsage,
  TranscriptionOptions,
  TranscriptionResponseFormat,
  TranscriptionResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { LovableTranscriptionModel } from '../model-meta'
import type { LovableTranscriptionProviderOptions } from '../audio/transcription-provider-options'
import type { LovableClientConfig } from '../utils/client'

function isPlainFormat(format: string): format is 'json' | 'text' {
  return format === 'json' || format === 'text'
}

export interface LovableTranscriptionConfig extends LovableClientConfig {}

function buildTranscriptionUsage(
  response?: OpenAI_SDK.Audio.TranscriptionCreateResponse,
): TokenUsage | undefined {
  const usage = response?.usage
  if (!usage || usage.type === 'duration') {
    return undefined
  }

  const result: TokenUsage = {
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  }

  const inputDetails = usage.input_token_details
  const promptTokensDetails = {
    ...(inputDetails?.audio_tokens
      ? { audioTokens: inputDetails.audio_tokens }
      : {}),
    ...(inputDetails?.text_tokens
      ? { textTokens: inputDetails.text_tokens }
      : {}),
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }
  if (usage.output_tokens) {
    result.completionTokensDetails = { textTokens: usage.output_tokens }
  }

  return result
}

export class LovableTranscriptionAdapter<
  TModel extends LovableTranscriptionModel,
> extends BaseTranscriptionAdapter<
  TModel,
  LovableTranscriptionProviderOptions
> {
  readonly name = 'lovable' as const

  protected client: OpenAI

  constructor(config: LovableTranscriptionConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(withLovableDefaults(config))
  }

  async transcribe(
    options: TranscriptionOptions<LovableTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const { model, language } = options

    try {
      const request = this.buildTranscriptionRequest(options)

      options.logger.request(
        `activity=transcription provider=${this.name} model=${model}`,
        { provider: this.name, model },
      )

      const response = await this.client.audio.transcriptions.create(
        request,
        openaiRequestOptions(options.abortSignal),
      )
      const usage =
        typeof response === 'string'
          ? undefined
          : buildTranscriptionUsage(response)

      return {
        id: generateId(this.name),
        model,
        text: typeof response === 'string' ? response : response.text,
        ...(language !== undefined && { language }),
        ...(usage !== undefined && { usage }),
      }
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.transcribe fatal`, {
        error: toRunErrorPayload(error, `${this.name}.transcribe failed`),
        source: `${this.name}.transcribe`,
      })
      throw error
    }
  }

  private buildTranscriptionRequest(
    options: TranscriptionOptions<LovableTranscriptionProviderOptions>,
  ): OpenAI_SDK.Audio.TranscriptionCreateParamsNonStreaming {
    const { model, audio, language, prompt, responseFormat, modelOptions } =
      options
    const file = this.prepareAudioFile(audio)
    const topLevelResponseFormat = responseFormat
    const effectiveResponseFormat =
      topLevelResponseFormat ?? modelOptions?.response_format

    if (
      topLevelResponseFormat !== undefined &&
      modelOptions?.response_format !== undefined &&
      topLevelResponseFormat !== modelOptions.response_format
    ) {
      throw new Error(
        `Conflicting response formats: responseFormat="${topLevelResponseFormat}" and modelOptions.response_format="${modelOptions.response_format}". Provide only one.`,
      )
    }

    if (
      effectiveResponseFormat !== undefined &&
      !isPlainFormat(effectiveResponseFormat)
    ) {
      throw new Error(
        `lovable: model "${model}" only supports json and text response formats; received "${effectiveResponseFormat}".`,
      )
    }

    const request: OpenAI_SDK.Audio.TranscriptionCreateParamsNonStreaming = {
      ...modelOptions,
      model,
      file,
    }
    delete request.stream
    if (language !== undefined) {
      request.language = language
    }
    if (prompt !== undefined) {
      request.prompt = prompt
    }
    request.response_format = mapResponseFormat(effectiveResponseFormat)

    return request
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

  private ensureFileSupport(): void {
    if (typeof File === 'undefined') {
      throw new Error(
        '`File` is not available in this environment. ' +
          'Use Node.js 20 or newer, or pass a File object directly.',
      )
    }
  }
}

function mapResponseFormat(
  format?: TranscriptionResponseFormat,
): 'json' | 'text' {
  if (format === 'text') return 'text'
  return 'json'
}

export function createLovableTranscription<
  TModel extends LovableTranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<LovableTranscriptionConfig, 'apiKey'>,
): LovableTranscriptionAdapter<TModel> {
  return new LovableTranscriptionAdapter({ apiKey, ...config }, model)
}

export function lovableTranscription<TModel extends LovableTranscriptionModel>(
  model: TModel,
  config?: Omit<LovableTranscriptionConfig, 'apiKey'>,
): LovableTranscriptionAdapter<TModel> {
  return createLovableTranscription(model, getLovableApiKeyFromEnv(), config)
}
