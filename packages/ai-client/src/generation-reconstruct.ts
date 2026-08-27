import type {
  AudioGenerationResult,
  ImageGenerationResult,
  PersistedArtifactRef,
  SummarizationResult,
  TranscriptionResult,
  TTSResult,
} from '@tanstack/ai'
import type { GenerationRestoredResult } from './generation-types'

/** Output artifact refs of a given media type that carry a durable serve URL. */
function mediaUrls(
  restored: GenerationRestoredResult,
  mediaType: PersistedArtifactRef['source']['mediaType'],
): Array<string> {
  return restored.artifacts
    .filter(
      (a) =>
        a.role === 'output' &&
        a.source.mediaType === mediaType &&
        a.url != null,
    )
    .map((a) => a.url as string)
}

/** image → `{ id, model, images: [{ url }], artifacts }`. */
export function reconstructImageResult(
  restored: GenerationRestoredResult,
): ImageGenerationResult | null {
  const urls = mediaUrls(restored, 'image')
  if (urls.length === 0) return null
  return {
    id: restored.id ?? '',
    model: restored.model ?? '',
    images: urls.map((url) => ({ url })),
    ...(restored.artifacts.length > 0 ? { artifacts: restored.artifacts } : {}),
  }
}

export function reconstructSpeechResult(
  restored: GenerationRestoredResult,
): TTSResult | null {
  const ref = restored.artifacts.find(
    (a) =>
      a.role === 'output' && a.source.mediaType === 'audio' && a.url != null,
  )
  if (!ref) return null
  const contentType = ref.mimeType || undefined
  return {
    id: restored.id ?? '',
    model: restored.model ?? '',
    // Bytes live in the blob store, served at `ref.url`; the base64 field can't
    // be rebuilt from the snapshot, so it stays empty on restore.
    audio: '',
    format: contentType?.split('/')[1] ?? '',
    ...(contentType ? { contentType } : {}),
    artifacts: restored.artifacts,
  }
}

/** audio → `{ id, model, audio: { url }, artifacts }`. */
export function reconstructAudioResult(
  restored: GenerationRestoredResult,
): AudioGenerationResult | null {
  const [url] = mediaUrls(restored, 'audio')
  if (!url) return null
  return {
    id: restored.id ?? '',
    model: restored.model ?? '',
    audio: { url },
    ...(restored.artifacts.length > 0 ? { artifacts: restored.artifacts } : {}),
  }
}

/** transcription → `{ id, model, text, artifacts }`. */
export function reconstructTranscriptionResult(
  restored: GenerationRestoredResult,
): TranscriptionResult | null {
  if (restored.text === undefined) return null
  return {
    id: restored.id ?? '',
    model: restored.model ?? '',
    text: restored.text,
    ...(restored.artifacts.length > 0 ? { artifacts: restored.artifacts } : {}),
  }
}

/** summarize → `{ id, model, summary, usage }` (needs persisted `usage`). */
export function reconstructSummarizeResult(
  restored: GenerationRestoredResult,
): SummarizationResult | null {
  const isTextIsUndefinedOrUsageIsUndefined =
    restored.text === undefined || restored.usage === undefined
  if (isTextIsUndefinedOrUsageIsUndefined) return null
  return {
    id: restored.id ?? '',
    model: restored.model ?? '',
    summary: restored.text,
    usage: restored.usage,
  }
}
