/**
 * @module activity-options
 *
 * Identity functions for creating typed options for each activity.
 * These functions provide full type inference and autocomplete.
 */

import type { z } from 'zod'
import type {
  EmbeddingActivityOptions,
  ImageActivityOptions,
  SummarizeActivityOptions,
  TTSActivityOptions,
  TextActivityOptions,
  TranscriptionActivityOptions,
  VideoCreateOptions,
} from './activities'
import type { EmbeddingAdapter } from './activities/embedding/adapter'
import type { ImageAdapter } from './activities/generateImage/adapter'
import type { TranscriptionAdapter } from './activities/generateTranscription/adapter'
import type { TTSAdapter } from './activities/generateSpeech/adapter'
import type { VideoAdapter } from './activities/generateVideo/adapter'
import type { AnyTextAdapter } from './activities/chat/adapter'
import type { SummarizeAdapter } from './activities/summarize/adapter'

// ===========================
// Chat Options
// ===========================

/**
 * Create typed options for the chat() function without executing.
 * This is useful for pre-defining configurations with full type inference.
 *
 * @example
 * ```ts
 * const config = {
 *   'anthropic': () => createChatOptions({
 *     adapter: anthropicText('claude-sonnet-4-5'),
 *   }),
 *   'openai': () => createChatOptions({
 *     adapter: openaiText('gpt-4o'),
 *   }),
 * }
 *
 * const stream = chat({ ...config[provider](), messages })
 * ```
 */
export function createChatOptions<
  TAdapter extends AnyTextAdapter,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
>(options: TextActivityOptions<TAdapter, TSchema, TStream>): any {
  return options as any
}

// ===========================
// Embedding Options
// ===========================

/**
 * Create typed options for the embedding() function without executing.
 */
export function createEmbeddingOptions<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object, string>,
>(
  options: EmbeddingActivityOptions<TAdapter>,
): EmbeddingActivityOptions<TAdapter> {
  return options
}

// ===========================
// Summarize Options
// ===========================

/**
 * Create typed options for the summarize() function without executing.
 */
export function createSummarizeOptions<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object, string>,
  TStream extends boolean = false,
>(
  options: SummarizeActivityOptions<TAdapter, TStream>,
): SummarizeActivityOptions<TAdapter, TStream> {
  return options
}

// ===========================
// Image Options
// ===========================

/**
 * Create typed options for the generateImage() function without executing.
 */
export function createImageOptions<
  TAdapter extends ImageAdapter<
    ReadonlyArray<string>,
    object,
    any,
    any,
    string
  >,
>(options: ImageActivityOptions<TAdapter>): ImageActivityOptions<TAdapter> {
  return options
}

// ===========================
// Video Options
// ===========================

/**
 * Create typed options for the generateVideo() function without executing.
 */
export function createVideoOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
>(options: VideoCreateOptions<TAdapter>): VideoCreateOptions<TAdapter> {
  return options
}

// ===========================
// Speech Options
// ===========================

/**
 * Create typed options for the generateSpeech() function without executing.
 */
export function createSpeechOptions<
  TAdapter extends TTSAdapter<ReadonlyArray<string>, object, string>,
>(options: TTSActivityOptions<TAdapter>): TTSActivityOptions<TAdapter> {
  return options
}

// ===========================
// Transcription Options
// ===========================

/**
 * Create typed options for the generateTranscription() function without executing.
 */
export function createTranscriptionOptions<
  TAdapter extends TranscriptionAdapter<ReadonlyArray<string>, object, string>,
>(
  options: TranscriptionActivityOptions<TAdapter>,
): TranscriptionActivityOptions<TAdapter> {
  return options
}
