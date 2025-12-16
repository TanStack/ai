/**
 * Transcription Activity
 *
 * Transcribes audio to text using speech-to-text models.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import type { TranscriptionAdapter } from './adapter'
import type { TranscriptionResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'transcription' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract model types from a TranscriptionAdapter */
export type TranscriptionModels<TAdapter> =
  TAdapter extends TranscriptionAdapter<infer M, any> ? M[number] : string

/**
 * Extract provider options from a TranscriptionAdapter.
 */
export type TranscriptionProviderOptions<TAdapter> =
  TAdapter extends TranscriptionAdapter<any, infer TProviderOptions>
    ? TProviderOptions
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the transcription activity.
 *
 * @template TAdapter - The transcription adapter type
 * @template TModel - The model name type (inferred from adapter)
 */
export interface TranscriptionActivityOptions<
  TAdapter extends TranscriptionAdapter<ReadonlyArray<string>, object>,
  TModel extends TranscriptionModels<TAdapter>,
> {
  /** The transcription adapter to use */
  adapter: TAdapter & { kind: typeof kind }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** The audio data to transcribe - can be base64 string, File, Blob, or Buffer */
  audio: string | File | Blob | ArrayBuffer
  /** The language of the audio in ISO-639-1 format (e.g., 'en') */
  language?: string
  /** An optional prompt to guide the transcription */
  prompt?: string
  /** The format of the transcription output */
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  /** Provider-specific options for transcription */
  modelOptions?: TranscriptionProviderOptions<TAdapter>
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the transcription activity */
export type TranscriptionActivityResult = Promise<TranscriptionResult>

// ===========================
// Activity Implementation
// ===========================

/**
 * Transcription activity - converts audio to text.
 *
 * Uses AI speech-to-text models to transcribe audio content.
 *
 * @example Transcribe an audio file
 * ```ts
 * import { ai } from '@tanstack/ai'
 * import { openaiTranscription } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiTranscription(),
 *   model: 'whisper-1',
 *   audio: audioFile, // File, Blob, or base64 string
 *   language: 'en'
 * })
 *
 * console.log(result.text)
 * ```
 *
 * @example With verbose output for timestamps
 * ```ts
 * const result = await ai({
 *   adapter: openaiTranscription(),
 *   model: 'whisper-1',
 *   audio: audioFile,
 *   responseFormat: 'verbose_json'
 * })
 *
 * result.segments?.forEach(segment => {
 *   console.log(`[${segment.start}s - ${segment.end}s]: ${segment.text}`)
 * })
 * ```
 */
export async function generateTranscription<
  TAdapter extends TranscriptionAdapter<ReadonlyArray<string>, object>,
  TModel extends TranscriptionModels<TAdapter>,
>(
  options: TranscriptionActivityOptions<TAdapter, TModel>,
): TranscriptionActivityResult {
  const { adapter, ...rest } = options

  return adapter.transcribe(rest)
}

// Re-export adapter types
export type {
  TranscriptionAdapter,
  TranscriptionAdapterConfig,
} from './adapter'
export { BaseTranscriptionAdapter } from './adapter'
