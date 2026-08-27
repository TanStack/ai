import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import {
  createElevenLabsClient,
  dataUrlToBlob,
  generateId,
} from '../utils/client'
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
  TranscriptionWord,
} from '@tanstack/ai'
import type { ElevenLabsClientConfig } from '../utils/client'
import type { ElevenLabsTranscriptionModel } from '../model-meta'

export interface ElevenLabsTranscriptionProviderOptions {
  /** Annotate non-speech events like (laughter), (footsteps), …. */
  tagAudioEvents?: boolean
  /** Maximum number of speakers in the audio (1..32). */
  numSpeakers?: number
  /** Timestamp granularity for words. */
  timestampsGranularity?: 'word' | 'character' | 'none'
  /** Enable speaker diarization. */
  diarize?: boolean
  /** Diarization threshold (requires `diarize=true` and no `numSpeakers`). */
  diarizationThreshold?: number
  /** Detect speaker roles (agent/customer). Requires diarize=true. */
  detectSpeakerRoles?: boolean
  /** Bias the model towards these keyterms (max 1000). */
  keyterms?: Array<string>
  entityDetection?: string
  /** Redact entities from the transcript text. Must be a subset of `entityDetection`. */
  entityRedaction?: string
  /** How redacted entities are formatted. */
  entityRedactionMode?: string
  /** Whether to skip filler words / non-speech sounds (scribe_v2 only). */
  noVerbatim?: boolean
  /** Sampling temperature (0..2). */
  temperature?: number
  /** Deterministic sampling seed (0..2147483647). */
  seed?: number
  /** Use `false` for zero-retention mode (enterprise only). */
  enableLogging?: boolean
  /** Multi-channel audio with one speaker per channel. Max 5 channels. */
  useMultiChannel?: boolean
  fileFormat?: 'pcm_s16le_16' | 'other'
}

export class ElevenLabsTranscriptionAdapter<
  TModel extends ElevenLabsTranscriptionModel,
> extends BaseTranscriptionAdapter<
  TModel,
  ElevenLabsTranscriptionProviderOptions
> {
  readonly name = 'elevenlabs' as const

  private readonly client: ElevenLabsClient

  constructor(model: TModel, config?: ElevenLabsClientConfig) {
    super(model, config ?? {})
    this.client = createElevenLabsClient(config)
  }

  async transcribe(
    options: TranscriptionOptions<ElevenLabsTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const { logger } = options
    logger.request(
      `activity=generateTranscription provider=elevenlabs model=${this.model}`,
      { provider: 'elevenlabs', model: this.model },
    )
    try {
      const response = await this.client.speechToText.convert(
        toSpeechToTextConvertParams(this.model, options),
      )

      return this.transformResponse(response)
    } catch (error) {
      logger.errors('elevenlabs.generateTranscription fatal', {
        error,
        source: 'elevenlabs.generateTranscription',
      })
      throw error
    }
  }

  private transformResponse(
    response: Awaited<ReturnType<ElevenLabsClient['speechToText']['convert']>>,
  ): TranscriptionResult {
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- bridges SpeechToTextConvertResponse union (incl. webhook variant with no text/words/transcripts) to a flattened duck-typed shape we discriminate at runtime
    const data = response as unknown as {
      text?: string
      languageCode?: string
      languageProbability?: number
      words?: Array<{
        text: string
        start?: number
        end?: number
        type: string
        speakerId?: string
      }>
      audioDurationSecs?: number
      transcripts?: Array<{
        text?: string
        languageCode?: string
        words?: Array<{
          text: string
          start?: number
          end?: number
          type: string
          speakerId?: string
        }>
        audioDurationSecs?: number
      }>
    }

    if (data.transcripts) {
      const joinedText = data.transcripts
        .map((t) => t.text ?? '')
        .filter(Boolean)
        .join('\n')
      const joinedWords = data.transcripts.flatMap((t) => t.words ?? [])
      const duration = data.transcripts.reduce(
        (max, t) => Math.max(max, t.audioDurationSecs ?? 0),
        0,
      )
      const firstLang = data.transcripts.find(
        (t) => t.languageCode,
      )?.languageCode
      return {
        id: generateId(this.name),
        model: this.model,
        text: joinedText,
        ...(firstLang ? { language: firstLang } : {}),
        ...(duration ? { duration } : {}),
        ...buildWordsAndSegments(joinedWords),
      }
    }

    return {
      id: generateId(this.name),
      model: this.model,
      text: data.text ?? '',
      ...(data.languageCode ? { language: data.languageCode } : {}),
      ...(data.audioDurationSecs ? { duration: data.audioDurationSecs } : {}),
      ...buildWordsAndSegments(data.words ?? []),
    }
  }

  protected override generateId(): string {
    return generateId(this.name)
  }
}

type NormalizedAudio =
  | { kind: 'file'; value: Blob }
  | { kind: 'url'; value: string }

function assignIfDefined<K extends string, V>(
  key: K,
  value: V | null | undefined,
): Partial<Record<K, V>> {
  if (value == null) return {}
  return { [key]: value } as Partial<Record<K, V>>
}

function toSpeechToTextConvertParams(
  modelId: string,
  options: TranscriptionOptions<ElevenLabsTranscriptionProviderOptions>,
): Parameters<ElevenLabsClient['speechToText']['convert']>[0] {
  const modelOpts = options.modelOptions ?? {}
  const audioInput = normalizeAudioInput(options.audio)
  return {
    modelId,
    ...(audioInput.kind === 'file'
      ? { file: audioInput.value }
      : { cloudStorageUrl: audioInput.value }),
    ...assignIfDefined('languageCode', options.language),
    ...assignIfDefined('tagAudioEvents', modelOpts.tagAudioEvents),
    ...assignIfDefined('numSpeakers', modelOpts.numSpeakers),
    ...assignIfDefined(
      'timestampsGranularity',
      modelOpts.timestampsGranularity,
    ),
    ...assignIfDefined('diarize', modelOpts.diarize),
    ...assignIfDefined('diarizationThreshold', modelOpts.diarizationThreshold),
    ...assignIfDefined('detectSpeakerRoles', modelOpts.detectSpeakerRoles),
    ...assignIfDefined('keyterms', modelOpts.keyterms),
    ...assignIfDefined('entityDetection', modelOpts.entityDetection),
    ...assignIfDefined('entityRedaction', modelOpts.entityRedaction),
    ...assignIfDefined('entityRedactionMode', modelOpts.entityRedactionMode),
    ...assignIfDefined('noVerbatim', modelOpts.noVerbatim),
    ...assignIfDefined('temperature', modelOpts.temperature),
    ...assignIfDefined('seed', modelOpts.seed),
    ...assignIfDefined('enableLogging', modelOpts.enableLogging),
    ...assignIfDefined('useMultiChannel', modelOpts.useMultiChannel),
    ...assignIfDefined('fileFormat', modelOpts.fileFormat),
  } as Parameters<ElevenLabsClient['speechToText']['convert']>[0]
}

function normalizeAudioInput(
  audio: TranscriptionOptions['audio'],
): NormalizedAudio {
  if (audio instanceof ArrayBuffer) {
    return { kind: 'file', value: new Blob([audio]) }
  }
  if (typeof audio === 'string') {
    const blob = dataUrlToBlob(audio)
    if (blob) return { kind: 'file', value: blob }
    return { kind: 'url', value: audio }
  }
  // Blob or File both fit the SDK's `Uploadable` contract.
  return { kind: 'file', value: audio }
}

function buildWordsAndSegments(
  words: Array<{
    text: string
    start?: number
    end?: number
    type: string
    speakerId?: string
  }>,
): {
  words?: Array<TranscriptionWord>
  segments?: Array<TranscriptionSegment>
} {
  const timedWords = words.filter(
    (w): w is typeof w & { start: number; end: number } =>
      typeof w.start === 'number' &&
      typeof w.end === 'number' &&
      w.type !== 'spacing',
  )
  if (timedWords.length === 0) return {}

  const outWords: Array<TranscriptionWord> = timedWords.map((w) => ({
    word: w.text,
    start: w.start,
    end: w.end,
  }))

  // Group contiguous words that share a speaker into segments. If no speaker
  // is ever set, we still emit one segment per sentence-ish grouping.
  const segments: Array<TranscriptionSegment> = []
  let current: {
    start: number
    end: number
    text: string
    speaker?: string
  } | null = null

  for (const w of timedWords) {
    if (!current) {
      current = {
        start: w.start,
        end: w.end,
        text: w.text,
        ...(w.speakerId ? { speaker: w.speakerId } : {}),
      }
      continue
    }
    if (w.speakerId && current.speaker !== w.speakerId) {
      segments.push({ id: segments.length, ...current })
      current = {
        start: w.start,
        end: w.end,
        text: w.text,
        speaker: w.speakerId,
      }
      continue
    }
    current.end = w.end
    current.text = current.text ? `${current.text} ${w.text}` : w.text
  }
  if (current) segments.push({ id: segments.length, ...current })

  return { words: outWords, segments }
}

export function elevenlabsTranscription<
  TModel extends ElevenLabsTranscriptionModel,
>(
  model: TModel,
  config?: ElevenLabsClientConfig,
): ElevenLabsTranscriptionAdapter<TModel> {
  return new ElevenLabsTranscriptionAdapter(model, config)
}

export function createElevenLabsTranscription<
  TModel extends ElevenLabsTranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsClientConfig, 'apiKey'>,
): ElevenLabsTranscriptionAdapter<TModel> {
  return new ElevenLabsTranscriptionAdapter(model, { apiKey, ...config })
}
