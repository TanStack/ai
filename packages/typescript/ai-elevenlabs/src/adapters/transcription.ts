import { BaseTranscriptionAdapter } from '@tanstack/ai/adapters'
import {
  buildHeaders,
  generateId,
  getElevenLabsApiKeyFromEnv,
  postForJson,
  resolveBaseUrl,
} from '../utils'
import type { ElevenLabsClientConfig } from '../utils'
import type {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
  TranscriptionWord,
} from '@tanstack/ai'
import type { ElevenLabsTranscriptionModel } from '../model-meta'

/**
 * Provider-specific options for ElevenLabs speech-to-text.
 * @see https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 */
export interface ElevenLabsTranscriptionProviderOptions {
  /** Timestamp granularity. Defaults to 'word'. */
  timestampsGranularity?: 'none' | 'word' | 'character'
  /** Tag non-speech audio events (laughter, footsteps etc.). Defaults to true. */
  tagAudioEvents?: boolean
  /** Identify speaker changes. Defaults to false. */
  diarize?: boolean
  /** Diarization sensitivity 0.0–1.0 */
  diarizationThreshold?: number
  /** Number of expected speakers (1–32). null for auto. */
  numSpeakers?: number | null
  /** File format hint: 'pcm_s16le_16' for raw PCM, 'other' otherwise. */
  fileFormat?: 'pcm_s16le_16' | 'other'
  /** Remove filler words ("um", "uh"). scribe_v2 only. */
  noVerbatim?: boolean
  /** Label agent vs. customer */
  detectSpeakerRoles?: boolean
  /** 0–2.0 */
  temperature?: number
  /** Deterministic seed */
  seed?: number
  /** Process a multi-channel file */
  useMultiChannel?: boolean
  /** Detect and redact PII/PHI/PCI */
  entityDetection?: boolean
  /** Redact detected entities inline */
  entityRedaction?: boolean
  entityRedactionMode?: 'redacted' | 'entity_type' | 'enumerated_entity_type'
  /** Key terms to bias recognition (up to 1000) */
  keyterms?: Array<string>
  /** Additional export formats (docx, html, pdf, srt, txt, segmented_json) */
  additionalFormats?: Array<Record<string, unknown>>
  /** HTTPS URL hosting the audio (max 2GB) — alternative to local file */
  cloudStorageUrl?: string
  /** Source URL (YouTube, TikTok, direct media URL) */
  sourceUrl?: string
  /** Disable logging / enable zero-retention mode */
  enableLogging?: boolean
}

export interface ElevenLabsTranscriptionConfig extends ElevenLabsClientConfig {}

/**
 * ElevenLabs speech-to-text (Scribe) adapter.
 *
 * @example
 * ```typescript
 * const adapter = elevenlabsTranscription('scribe_v2')
 * const result = await generateTranscription({
 *   adapter,
 *   audio: audioFile,
 *   language: 'en',
 *   modelOptions: { diarize: true },
 * })
 * ```
 *
 * @see https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 */
export class ElevenLabsTranscriptionAdapter<
  TModel extends ElevenLabsTranscriptionModel,
> extends BaseTranscriptionAdapter<
  TModel,
  ElevenLabsTranscriptionProviderOptions
> {
  readonly name = 'elevenlabs' as const

  constructor(config: ElevenLabsTranscriptionConfig, model: TModel) {
    super(config, model)
  }

  async transcribe(
    options: TranscriptionOptions<ElevenLabsTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const config = this.config as ElevenLabsTranscriptionConfig
    const url = `${resolveBaseUrl(config)}/v1/speech-to-text`

    const form = new FormData()
    form.append('model_id', this.model)

    const audioProvided = appendAudio(form, options.audio)
    if (!audioProvided) {
      if (options.modelOptions?.cloudStorageUrl) {
        form.append('cloud_storage_url', options.modelOptions.cloudStorageUrl)
      } else if (options.modelOptions?.sourceUrl) {
        form.append('source_url', options.modelOptions.sourceUrl)
      } else {
        throw new Error(
          'ElevenLabs transcription requires audio data, a cloudStorageUrl, or a sourceUrl.',
        )
      }
    }

    if (options.language) form.append('language_code', options.language)
    appendProviderOptions(form, options.modelOptions)

    const body = await postForJson<ElevenLabsTranscriptionResponse>(
      url,
      {
        ...buildHeaders(config),
      },
      {
        body: form,
      },
    )

    return transformResponse(body, this.model, (prefix) => generateId(prefix))
  }
}

interface ElevenLabsWord {
  text: string
  start: number
  end: number
  type: 'word' | 'spacing' | 'audio_event'
  speaker_id: string | null
  logprob?: number
}

interface ElevenLabsTranscriptionResponse {
  language_code?: string
  language_probability?: number
  text?: string
  words?: Array<ElevenLabsWord>
  transcription_id?: string
  audio_duration_secs?: number
  transcripts?: Array<ElevenLabsTranscriptionResponse>
}

function appendAudio(
  form: FormData,
  audio: TranscriptionOptions['audio'] | undefined,
): boolean {
  if (!audio) return false

  if (typeof audio === 'string') {
    // Treat as URL if it starts with http(s); otherwise assume base64.
    if (/^https?:\/\//i.test(audio)) {
      form.append('cloud_storage_url', audio)
      return true
    }
    form.append('file', base64ToBlob(audio), 'audio.bin')
    return true
  }

  if (audio instanceof ArrayBuffer) {
    form.append('file', new Blob([audio]), 'audio.bin')
    return true
  }

  // File or Blob
  const name =
    typeof (audio as File).name === 'string'
      ? (audio as File).name
      : 'audio.bin'
  form.append('file', audio, name)
  return true
}

function base64ToBlob(base64: string): Blob {
  if (typeof Buffer !== 'undefined') {
    return new Blob([Buffer.from(base64, 'base64')])
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes])
}

function appendProviderOptions(
  form: FormData,
  options: ElevenLabsTranscriptionProviderOptions | undefined,
): void {
  if (!options) return

  const map: Record<string, unknown> = {
    timestamps_granularity: options.timestampsGranularity,
    tag_audio_events: options.tagAudioEvents,
    diarize: options.diarize,
    diarization_threshold: options.diarizationThreshold,
    num_speakers: options.numSpeakers,
    file_format: options.fileFormat,
    no_verbatim: options.noVerbatim,
    detect_speaker_roles: options.detectSpeakerRoles,
    temperature: options.temperature,
    seed: options.seed,
    use_multi_channel: options.useMultiChannel,
    entity_detection: options.entityDetection,
    entity_redaction: options.entityRedaction,
    entity_redaction_mode: options.entityRedactionMode,
    enable_logging: options.enableLogging,
  }
  for (const [key, value] of Object.entries(map)) {
    if (value == null) continue
    form.append(key, String(value))
  }

  if (options.keyterms?.length) {
    form.append('keyterms', JSON.stringify(options.keyterms))
  }
  if (options.additionalFormats?.length) {
    form.append('additional_formats', JSON.stringify(options.additionalFormats))
  }
}

function transformResponse(
  body: ElevenLabsTranscriptionResponse,
  model: string,
  makeId: (prefix: string) => string,
): TranscriptionResult {
  // For multi-channel responses, collapse to the first track's text plus
  // segment list; callers that need per-channel data can set useMultiChannel
  // and read the raw response via a future escape hatch.
  const primary = body.transcripts?.[0] ?? body

  const { segments, words } = buildTimeline(primary.words)

  return {
    id: body.transcription_id ?? makeId('elevenlabs'),
    model,
    text: primary.text ?? '',
    language: primary.language_code,
    duration: body.audio_duration_secs,
    segments: segments.length ? segments : undefined,
    words: words.length ? words : undefined,
  }
}

function buildTimeline(words: Array<ElevenLabsWord> | undefined): {
  segments: Array<TranscriptionSegment>
  words: Array<TranscriptionWord>
} {
  if (!words?.length) return { segments: [], words: [] }

  const outSegments: Array<TranscriptionSegment> = []
  const outWords: Array<TranscriptionWord> = []

  let currentSpeaker: string | null | undefined = undefined
  let pending: {
    start: number
    end: number
    text: string
    speaker?: string
  } | null = null

  for (const w of words) {
    if (w.type === 'word') {
      outWords.push({ word: w.text, start: w.start, end: w.end })
    }
    if (w.speaker_id !== currentSpeaker && pending) {
      outSegments.push({
        id: outSegments.length,
        start: pending.start,
        end: pending.end,
        text: pending.text.trim(),
        ...(pending.speaker ? { speaker: pending.speaker } : {}),
      })
      pending = null
    }
    currentSpeaker = w.speaker_id
    if (!pending) {
      pending = {
        start: w.start,
        end: w.end,
        text: w.text,
        ...(w.speaker_id ? { speaker: w.speaker_id } : {}),
      }
    } else {
      pending.end = w.end
      pending.text += w.text
    }
  }

  if (pending) {
    outSegments.push({
      id: outSegments.length,
      start: pending.start,
      end: pending.end,
      text: pending.text.trim(),
      ...(pending.speaker ? { speaker: pending.speaker } : {}),
    })
  }

  return { segments: outSegments, words: outWords }
}

/**
 * Create an ElevenLabs transcription adapter with an explicit API key.
 */
export function createElevenLabsTranscription<
  TModel extends ElevenLabsTranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<ElevenLabsTranscriptionConfig, 'apiKey'>,
): ElevenLabsTranscriptionAdapter<TModel> {
  return new ElevenLabsTranscriptionAdapter({ apiKey, ...config }, model)
}

/**
 * Create an ElevenLabs transcription adapter using the API key from the environment.
 */
export function elevenlabsTranscription<
  TModel extends ElevenLabsTranscriptionModel,
>(
  model: TModel,
  config?: Omit<ElevenLabsTranscriptionConfig, 'apiKey'>,
): ElevenLabsTranscriptionAdapter<TModel> {
  const apiKey = getElevenLabsApiKeyFromEnv()
  return createElevenLabsTranscription(model, apiKey, config)
}
