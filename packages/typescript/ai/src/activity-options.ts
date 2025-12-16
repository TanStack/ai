/**
 * @module activity-options
 *
 * Identity functions for creating typed options for each activity.
 * These functions provide full type inference and autocomplete.
 */

import type { z } from 'zod'
import type {
  EmbeddingActivityOptions,
  EmbeddingModels,
  ImageActivityOptions,
  ImageModels,
  SummarizeActivityOptions,
  SummarizeModels,
  TextActivityOptions,
  TextModels,
  TTSActivityOptions,
  TTSModels,
  TranscriptionActivityOptions,
  TranscriptionModels,
  VideoCreateOptions,
  VideoModels,
} from './activities'
import type { EmbeddingAdapter } from './activities/embedding/adapter'
import type { ImageAdapter } from './activities/generateImage/adapter'
import type { TranscriptionAdapter } from './activities/generateTranscription/adapter'
import type { TTSAdapter } from './activities/generateSpeech/adapter'
import type { VideoAdapter } from './activities/generateVideo/adapter'
import type { TextAdapter } from './activities/chat/adapter'
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
 *     adapter: anthropicChat('claude-sonnet-4-5'),
 *   }),
 *   'openai': () => createChatOptions({
 *     adapter: openaiChat('gpt-4o'),
 *   }),
 * }
 *
 * const stream = chat({ ...config[provider](), messages })
 * ```
 */
export function createChatOptions<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  const TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
>(
  options: TextActivityOptions<TAdapter, TModel, TSchema, TStream>,
): TextActivityOptions<TAdapter, TModel, TSchema, TStream> {
  return options
}

// ===========================
// Embedding Options
// ===========================

/**
 * Create typed options for the embedding() function without executing.
 */
export function createEmbeddingOptions<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>,
  const TModel extends EmbeddingModels<TAdapter>,
>(
  options: EmbeddingActivityOptions<TAdapter, TModel>,
): EmbeddingActivityOptions<TAdapter, TModel> {
  return options
}

// ===========================
// Summarize Options
// ===========================

/**
 * Create typed options for the summarize() function without executing.
 */
export function createSummarizeOptions<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>,
  const TModel extends SummarizeModels<TAdapter>,
  TStream extends boolean = false,
>(
  options: SummarizeActivityOptions<TAdapter, TModel, TStream>,
): SummarizeActivityOptions<TAdapter, TModel, TStream> {
  return options
}

// ===========================
// Image Options
// ===========================

/**
 * Create typed options for the generateImage() function without executing.
 */
export function createImageOptions<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  const TModel extends ImageModels<TAdapter>,
>(
  options: ImageActivityOptions<TAdapter, TModel>,
): ImageActivityOptions<TAdapter, TModel> {
  return options
}

// ===========================
// Video Options
// ===========================

/**
 * Create typed options for the generateVideo() function without executing.
 */
export function createVideoOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  const TModel extends VideoModels<TAdapter>,
>(
  options: VideoCreateOptions<TAdapter, TModel>,
): VideoCreateOptions<TAdapter, TModel> {
  return options
}

// ===========================
// Speech Options
// ===========================

/**
 * Create typed options for the generateSpeech() function without executing.
 */
export function createSpeechOptions<
  TAdapter extends TTSAdapter<ReadonlyArray<string>, object>,
  const TModel extends TTSModels<TAdapter>,
>(
  options: TTSActivityOptions<TAdapter, TModel>,
): TTSActivityOptions<TAdapter, TModel> {
  return options
}

// ===========================
// Transcription Options
// ===========================

/**
 * Create typed options for the generateTranscription() function without executing.
 */
export function createTranscriptionOptions<
  TAdapter extends TranscriptionAdapter<ReadonlyArray<string>, object>,
  const TModel extends TranscriptionModels<TAdapter>,
>(
  options: TranscriptionActivityOptions<TAdapter, TModel>,
): TranscriptionActivityOptions<TAdapter, TModel> {
  return options
}
