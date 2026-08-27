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
import type {
  OpenAITranscriptionProviderOptions,
  OpenAITranscriptionResponseFormat,
} from '../audio/transcription-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

const DIARIZE_MODELS = ['gpt-4o-transcribe-diarize'] as const
const DIARIZE_RESPONSE_FORMATS = ['json', 'text', 'diarized_json'] as const

type DiarizeModel = (typeof DIARIZE_MODELS)[number]
type OpenAITranscriptionResponseMode = 'diarized' | 'verbose' | 'plain'

interface OpenAITranscriptionRequestPlan {
  request: OpenAI_SDK.Audio.TranscriptionCreateParamsNonStreaming
  responseMode: OpenAITranscriptionResponseMode
}

function isDiarizeModel(model: string): model is DiarizeModel {
  return DIARIZE_MODELS.includes(model as DiarizeModel)
}

function hasDiarizationOnlyOptions(
  responseFormat: OpenAITranscriptionResponseFormat | undefined,
  modelOptions: OpenAITranscriptionProviderOptions | undefined,
): boolean {
  return (
    responseFormat === 'diarized_json' ||
    modelOptions?.response_format === 'diarized_json' ||
    modelOptions?.known_speaker_names !== undefined ||
    modelOptions?.known_speaker_references !== undefined
  )
}

function assertDiarizeUnsupportedOptions(
  prompt: string | undefined,
  modelOptions: OpenAITranscriptionProviderOptions | undefined,
): void {
  const hasPrompt = prompt !== undefined || modelOptions?.prompt !== undefined
  if (hasPrompt) {
    throw new Error(
      'OpenAI diarization transcription models do not support prompts.',
    )
  }
  if (modelOptions?.include !== undefined) {
    throw new Error(
      'OpenAI diarization transcription models do not support the include option.',
    )
  }
  if (modelOptions?.timestamp_granularities !== undefined) {
    throw new Error(
      'OpenAI diarization transcription models do not support timestamp_granularities.',
    )
  }
}

function assertDiarizeKnownSpeakers(
  modelOptions: OpenAITranscriptionProviderOptions | undefined,
): void {
  const names = modelOptions?.known_speaker_names
  const references = modelOptions?.known_speaker_references
  if ((names === undefined) !== (references === undefined)) {
    throw new Error(
      'OpenAI diarization known_speaker_names and known_speaker_references must both be provided together.',
    )
  }
  const hasTooManyNames = names !== undefined && names.length > 4
  if (hasTooManyNames) {
    throw new Error(
      'OpenAI diarization transcription models support at most 4 known speaker names.',
    )
  }
  const hasTooManyReferences = references !== undefined && references.length > 4
  if (hasTooManyReferences) {
    throw new Error(
      'OpenAI diarization transcription models support at most 4 known speaker references.',
    )
  }
  if (
    names !== undefined &&
    references !== undefined &&
    names.length !== references.length
  ) {
    throw new Error(
      `OpenAI diarization known_speaker_names and known_speaker_references must have matching lengths; received ${names.length} names and ${references.length} references.`,
    )
  }
}

function mapDiarizedSegmentId(id: string, index: number): number {
  const match = /^seg_(\d+)$/.exec(id)
  if (match) return Number(match[1])

  if (id.trim() !== '') {
    const numericId = Number(id)
    if (!Number.isNaN(numericId)) return numericId
  }

  return index
}

function durationUsage(seconds: number): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    billed: { quantity: seconds, unit: 'seconds' },
    durationSeconds: seconds,
  }
}

function buildTranscriptionUsage(
  model: string,
  duration?: number,
  response?: OpenAI_SDK.Audio.TranscriptionCreateResponse,
): TokenUsage | undefined {
  const usage = response?.usage

  if (model.startsWith('gpt-4o')) {
    if (!usage) {
      return undefined
    }

    // gpt-4o-transcribe-diarize responses may report duration-based usage;
    // surface it rather than discarding billing data the API returned.
    if (usage.type === 'duration') {
      return durationUsage(usage.seconds)
    }

    const result: TokenUsage = {
      promptTokens: usage.input_tokens || 0,
      completionTokens: usage.output_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    }

    // Input can mix audio and text tokens (e.g. the optional `prompt`); read
    // the real breakdown instead of attributing every input token to audio.
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

    // Transcription output is always text.
    if (usage.output_tokens) {
      result.completionTokensDetails = { textTokens: usage.output_tokens }
    }

    return result
  }

  // Whisper-1 uses duration-based billing
  if (duration !== undefined && duration > 0) {
    return durationUsage(duration)
  }

  return undefined
}

export interface OpenAITranscriptionConfig extends OpenAIClientConfig {}

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
    const { model, language } = options

    try {
      const { request, responseMode } = this.buildTranscriptionRequest(options)

      options.logger.request(
        `activity=transcription provider=${this.name} model=${model} verbose=${responseMode === 'verbose'} diarized=${responseMode === 'diarized'}`,
        { provider: this.name, model },
      )
      if (responseMode === 'diarized') {
        const response = (await this.client.audio.transcriptions.create(
          request,
        )) as OpenAI_SDK.Audio.TranscriptionDiarized

        if (!Array.isArray(response.segments)) {
          throw new Error(
            `OpenAI diarized transcription response did not include segments (model=${model}, response_format=diarized_json).`,
          )
        }

        const segments = response.segments.map(
          (segment, index): TranscriptionSegment => ({
            id: mapDiarizedSegmentId(segment.id, index),
            start: segment.start,
            end: segment.end,
            text: segment.text,
            speaker: segment.speaker,
          }),
        )

        const usage = buildTranscriptionUsage(
          model,
          response.duration,
          response,
        )
        return {
          id: generateId(this.name),
          model,
          text: response.text,
          duration: response.duration,
          segments,
          ...(usage !== undefined && { usage }),
        }
      }

      if (responseMode === 'verbose') {
        const response = (await this.client.audio.transcriptions.create({
          ...request,
          response_format: 'verbose_json',
        })) as OpenAI_SDK.Audio.Transcriptions.TranscriptionVerbose

        const segments = response.segments?.map(
          (seg): TranscriptionSegment => ({
            id: seg.id,
            start: seg.start,
            end: seg.end,
            text: seg.text,
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
      }

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
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.transcribe fatal`, {
        error: toRunErrorPayload(error, `${this.name}.transcribe failed`),
        source: `${this.name}.transcribe`,
      })
      throw error
    }
  }

  private buildTranscriptionRequest(
    options: TranscriptionOptions<OpenAITranscriptionProviderOptions>,
  ): OpenAITranscriptionRequestPlan {
    const { model, audio, language, prompt, responseFormat, modelOptions } =
      options
    const file = this.prepareAudioFile(audio)
    const isDiarizeTranscriptionModel = isDiarizeModel(model)
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

    this.validateDiarizationOptions({
      model,
      prompt,
      responseFormat: topLevelResponseFormat,
      modelOptions,
    })

    const responseMode = this.resolveResponseMode({
      model,
      isDiarizeTranscriptionModel,
      effectiveResponseFormat,
    })
    const responseFormatValue =
      responseMode === 'diarized'
        ? 'diarized_json'
        : this.mapResponseFormat(effectiveResponseFormat)

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
    const needsAutoChunking =
      isDiarizeTranscriptionModel &&
      modelOptions?.chunking_strategy === undefined
    if (needsAutoChunking) {
      request.chunking_strategy = 'auto'
    }
    request.response_format = responseFormatValue

    return { request, responseMode }
  }

  private resolveResponseMode({
    model,
    isDiarizeTranscriptionModel,
    effectiveResponseFormat,
  }: {
    model: string
    isDiarizeTranscriptionModel: boolean
    effectiveResponseFormat?: OpenAITranscriptionResponseFormat
  }): OpenAITranscriptionResponseMode {
    const isDiarizedMode =
      effectiveResponseFormat === 'diarized_json' ||
      (isDiarizeTranscriptionModel && effectiveResponseFormat === undefined)
    if (isDiarizedMode) {
      return 'diarized'
    }

    const isVerboseMode =
      effectiveResponseFormat === 'verbose_json' ||
      (effectiveResponseFormat === undefined && model === 'whisper-1')
    if (isVerboseMode) {
      return 'verbose'
    }

    return 'plain'
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

  private validateDiarizationOptions({
    model,
    prompt,
    responseFormat,
    modelOptions,
  }: Pick<
    TranscriptionOptions<OpenAITranscriptionProviderOptions>,
    'model' | 'prompt' | 'modelOptions'
  > & {
    responseFormat?: OpenAITranscriptionResponseFormat
  }): void {
    const isDiarizeTranscriptionModel = isDiarizeModel(model)
    const modelOptionsResponseFormat = modelOptions?.response_format

    const hasDiarizeOptionsOnWrongModel =
      !isDiarizeTranscriptionModel &&
      hasDiarizationOnlyOptions(responseFormat, modelOptions)
    if (hasDiarizeOptionsOnWrongModel) {
      throw new Error(
        `OpenAI speaker diarization options (response_format: 'diarized_json', known_speaker_names, known_speaker_references) are only supported with OpenAI diarization transcription models; model is "${model}".`,
      )
    }

    if (!isDiarizeTranscriptionModel) return

    this.assertDiarizeResponseFormats(
      responseFormat,
      modelOptionsResponseFormat,
    )
    assertDiarizeUnsupportedOptions(prompt, modelOptions)
    assertDiarizeKnownSpeakers(modelOptions)
  }

  private assertDiarizeResponseFormats(
    responseFormat: OpenAITranscriptionResponseFormat | undefined,
    modelOptionsResponseFormat: OpenAITranscriptionResponseFormat | undefined,
  ): void {
    const requestedResponseFormats = [
      this.mapResponseFormat(responseFormat),
      ...(modelOptionsResponseFormat !== undefined
        ? [this.mapResponseFormat(modelOptionsResponseFormat)]
        : []),
    ]
    const unsupportedResponseFormat = requestedResponseFormats.find(
      (format) =>
        !DIARIZE_RESPONSE_FORMATS.includes(
          format as (typeof DIARIZE_RESPONSE_FORMATS)[number],
        ),
    )
    if (unsupportedResponseFormat !== undefined) {
      throw new Error(
        `OpenAI diarization transcription models only support json, text, and diarized_json response formats; received "${unsupportedResponseFormat}".`,
      )
    }
  }

  protected mapResponseFormat(
    format?: OpenAITranscriptionResponseFormat,
  ): OpenAITranscriptionResponseFormat {
    if (!format) return 'json'
    return format
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
