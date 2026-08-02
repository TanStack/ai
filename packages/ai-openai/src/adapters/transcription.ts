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

// OpenAI diarized segments carry string ids like `seg_0`, but the shared
// TranscriptionSegment.id is numeric: parse the numeric suffix (or a plain
// numeric string) and fall back to the array index otherwise. The empty-string
// guard matters because Number('') is 0, which would collide with `seg_0`.
function mapDiarizedSegmentId(id: string, index: number): number {
  const match = /^seg_(\d+)$/.exec(id)
  if (match) return Number(match[1])

  if (id.trim() !== '') {
    const numericId = Number(id)
    if (!Number.isNaN(numericId)) return numericId
  }

  return index
}

/**
 * Build TokenUsage from transcription response.
 * Whisper-1 uses duration-based billing, GPT-4o models use token-based billing.
 */
function buildTranscriptionUsage(
  model: string,
  duration?: number,
  response?: OpenAI_SDK.Audio.TranscriptionCreateResponse,
): TokenUsage | undefined {
  const usage = response?.usage

  // GPT-4o transcription models are billed by token. Surface the token counts
  // and the per-modality input breakdown when present. These models must never
  // fall through to the duration path below — when usage is absent there is no
  // billing data to report, so return undefined rather than fabricating a
  // duration-based result for a token-billed model.
  if (model.startsWith('gpt-4o')) {
    if (!usage) {
      return undefined
    }

    // gpt-4o-transcribe-diarize responses may report duration-based usage;
    // surface it rather than discarding billing data the API returned.
    if (usage.type === 'duration') {
      return {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationSeconds: usage.seconds,
      }
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
 * Supports whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe, and gpt-4o-transcribe-diarize.
 *
 * Features:
 * - Multiple transcription models with different capabilities
 * - Language detection or specification
 * - Multiple output formats: json, text, srt, verbose_json, vtt, diarized_json
 * - Word and segment-level timestamps (with verbose_json — whisper-1 only;
 *   gpt-4o-transcribe and gpt-4o-mini-transcribe accept only json/text and
 *   reject verbose_json with HTTP 400)
 * - Speaker diarization (with gpt-4o-transcribe-diarize, which accepts json,
 *   text, and diarized_json)
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

        // Guard the cast: a proxy/gateway or API change that returns a
        // non-diarized shape would otherwise fail with a context-free
        // TypeError deep in the mapping below.
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
          // Always include segments (even empty) for diarized requests: the
          // caller asked for speaker segments, so an empty list is meaningful
          // and should not look like a non-diarized result.
          segments,
          ...(usage !== undefined && { usage }),
        }
      }

      if (responseMode === 'verbose') {
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

    // With exactOptionalPropertyTypes, vendor SDK request shapes reject
    // `T | undefined` in optional fields. Build the request incrementally and
    // only set optional fields when they're actually defined.
    // Spread modelOptions first so it can never override the validated
    // `model`/`file` fields (server routes often pass modelOptions through
    // from untyped client input).
    const request: OpenAI_SDK.Audio.TranscriptionCreateParamsNonStreaming = {
      ...modelOptions,
      model,
      file,
    }
    // `stream` is not a supported provider option for this adapter; an
    // untyped passthrough setting it would flip the SDK into streaming mode
    // and break response parsing.
    delete request.stream
    if (language !== undefined) {
      request.language = language
    }
    if (prompt !== undefined) {
      request.prompt = prompt
    }
    if (
      isDiarizeTranscriptionModel &&
      modelOptions?.chunking_strategy === undefined
    ) {
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
    if (
      effectiveResponseFormat === 'diarized_json' ||
      (isDiarizeTranscriptionModel && effectiveResponseFormat === undefined)
    ) {
      return 'diarized'
    }

    // Only Whisper supports verbose_json. gpt-4o-transcribe and
    // gpt-4o-mini-transcribe accept only json/text and reject verbose_json
    // with HTTP 400 (the diarize model is handled above).
    if (
      effectiveResponseFormat === 'verbose_json' ||
      (effectiveResponseFormat === undefined && model === 'whisper-1')
    ) {
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

    // `chunking_strategy` is deliberately NOT rejected here: per the OpenAI
    // API it is a general transcription parameter for all models (only
    // *required* for gpt-4o-transcribe-diarize inputs longer than 30s).
    if (
      !isDiarizeTranscriptionModel &&
      (responseFormat === 'diarized_json' ||
        modelOptionsResponseFormat === 'diarized_json' ||
        modelOptions?.known_speaker_names !== undefined ||
        modelOptions?.known_speaker_references !== undefined)
    ) {
      throw new Error(
        `OpenAI speaker diarization options (response_format: 'diarized_json', known_speaker_names, known_speaker_references) are only supported with OpenAI diarization transcription models; model is "${model}".`,
      )
    }

    if (!isDiarizeTranscriptionModel) return

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

    if (prompt !== undefined || modelOptions?.prompt !== undefined) {
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

    if (
      (modelOptions?.known_speaker_names === undefined) !==
      (modelOptions?.known_speaker_references === undefined)
    ) {
      throw new Error(
        'OpenAI diarization known_speaker_names and known_speaker_references must both be provided together.',
      )
    }

    if (modelOptions?.known_speaker_names !== undefined) {
      const knownSpeakerCount = modelOptions.known_speaker_names.length
      if (knownSpeakerCount > 4) {
        throw new Error(
          'OpenAI diarization transcription models support at most 4 known speaker names.',
        )
      }
    }

    if (modelOptions?.known_speaker_references !== undefined) {
      const knownSpeakerReferenceCount =
        modelOptions.known_speaker_references.length
      if (knownSpeakerReferenceCount > 4) {
        throw new Error(
          'OpenAI diarization transcription models support at most 4 known speaker references.',
        )
      }
    }

    if (
      modelOptions?.known_speaker_names !== undefined &&
      modelOptions.known_speaker_references !== undefined &&
      modelOptions.known_speaker_names.length !==
        modelOptions.known_speaker_references.length
    ) {
      throw new Error(
        `OpenAI diarization known_speaker_names and known_speaker_references must have matching lengths; received ${modelOptions.known_speaker_names.length} names and ${modelOptions.known_speaker_references.length} references.`,
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
