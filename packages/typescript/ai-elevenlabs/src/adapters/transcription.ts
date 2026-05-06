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

/**
 * Provider-specific options for ElevenLabs Scribe transcription. Fields map
 * 1:1 onto the SDK's `BodySpeechToTextV1SpeechToTextPost` — mirroring the
 * names so documentation stays useful.
 * @see https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 */
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
  /**
   * Entity detection: `'all'`, a category (`'pii'`, `'phi'`, `'pci'`,
   * `'other'`, `'offensive_language'`), or a specific entity type.
   */
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
  /**
   * Hint for audio format. Use `'pcm_s16le_16'` to skip encoding for 16-bit
   * PCM @ 16kHz mono little-endian inputs (lower latency).
   */
  fileFormat?: 'pcm_s16le_16' | 'other'
}

/**
 * ElevenLabs speech-to-text adapter built on the official SDK's Scribe family.
 *
 * @example
 * ```ts
 * const adapter = elevenlabsTranscription('scribe_v1')
 * const result = await generateTranscription({
 *   adapter,
 *   audio: fileInput,
 *   language: 'en',
 * })
 * ```
 */
export class ElevenLabsTranscriptionAdapter<
  TModel extends ElevenLabsTranscriptionModel,
> extends BaseTranscriptionAdapter<
  TModel,
  ElevenLabsTranscriptionProviderOptions
> {
  readonly name = 'elevenlabs' as const

  private client: ElevenLabsClient

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
      const modelOpts = options.modelOptions ?? {}
      const audioInput = normalizeAudioInput(options.audio)

      const response = await this.client.speechToText.convert({
        modelId: this.model,
        ...(audioInput.kind === 'file'
          ? { file: audioInput.value }
          : { cloudStorageUrl: audioInput.value }),
        ...(options.language ? { languageCode: options.language } : {}),
        ...(modelOpts.tagAudioEvents != null
          ? { tagAudioEvents: modelOpts.tagAudioEvents }
          : {}),
        ...(modelOpts.numSpeakers != null
          ? { numSpeakers: modelOpts.numSpeakers }
          : {}),
        ...(modelOpts.timestampsGranularity
          ? { timestampsGranularity: modelOpts.timestampsGranularity }
          : {}),
        ...(modelOpts.diarize != null ? { diarize: modelOpts.diarize } : {}),
        ...(modelOpts.diarizationThreshold != null
          ? { diarizationThreshold: modelOpts.diarizationThreshold }
          : {}),
        ...(modelOpts.detectSpeakerRoles != null
          ? { detectSpeakerRoles: modelOpts.detectSpeakerRoles }
          : {}),
        ...(modelOpts.keyterms ? { keyterms: modelOpts.keyterms } : {}),
        ...(modelOpts.entityDetection
          ? { entityDetection: modelOpts.entityDetection }
          : {}),
        ...(modelOpts.entityRedaction
          ? { entityRedaction: modelOpts.entityRedaction }
          : {}),
        ...(modelOpts.entityRedactionMode
          ? { entityRedactionMode: modelOpts.entityRedactionMode }
          : {}),
        ...(modelOpts.noVerbatim != null
          ? { noVerbatim: modelOpts.noVerbatim }
          : {}),
        ...(modelOpts.temperature != null
          ? { temperature: modelOpts.temperature }
          : {}),
        ...(modelOpts.seed != null ? { seed: modelOpts.seed } : {}),
        ...(modelOpts.enableLogging != null
          ? { enableLogging: modelOpts.enableLogging }
          : {}),
        ...(modelOpts.useMultiChannel != null
          ? { useMultiChannel: modelOpts.useMultiChannel }
          : {}),
        ...(modelOpts.fileFormat ? { fileFormat: modelOpts.fileFormat } : {}),
      } as Parameters<ElevenLabsClient['speechToText']['convert']>[0])

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
    // The SDK types this as a union of single- and multi-channel responses.
    // We treat multi-channel as "join the channel transcripts" — consumers
    // who care about per-channel detail can re-parse from `modelOptions`.
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
    (w) =>
      typeof w.start === 'number' &&
      typeof w.end === 'number' &&
      w.type !== 'spacing',
  )
  if (timedWords.length === 0) return {}

  const outWords: Array<TranscriptionWord> = timedWords.map((w) => ({
    word: w.text,
    start: w.start!,
    end: w.end!,
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
        start: w.start!,
        end: w.end!,
        text: w.text,
        ...(w.speakerId ? { speaker: w.speakerId } : {}),
      }
      continue
    }
    if (w.speakerId && current.speaker !== w.speakerId) {
      segments.push({ id: segments.length, ...current })
      current = {
        start: w.start!,
        end: w.end!,
        text: w.text,
        speaker: w.speakerId,
      }
      continue
    }
    current.end = w.end!
    current.text = current.text ? `${current.text} ${w.text}` : w.text
  }
  if (current) segments.push({ id: segments.length, ...current })

  return { words: outWords, segments }
}

/**
 * Create an ElevenLabs transcription adapter using `ELEVENLABS_API_KEY` from env.
 */
export function elevenlabsTranscription<
  TModel extends ElevenLabsTranscriptionModel,
>(
  model: TModel,
  config?: ElevenLabsClientConfig,
): ElevenLabsTranscriptionAdapter<TModel> {
  return new ElevenLabsTranscriptionAdapter(model, config)
}

/**
 * Create an ElevenLabs transcription adapter with an explicit API key.
 */
export function createElevenLabsTranscription<
  TModel extends ElevenLabsTranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsClientConfig, 'apiKey'>,
): ElevenLabsTranscriptionAdapter<TModel> {
  return new ElevenLabsTranscriptionAdapter(model, { apiKey, ...config })
}
