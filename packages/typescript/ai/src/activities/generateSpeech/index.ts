/**
 * TTS Activity
 *
 * Generates speech audio from text using text-to-speech models.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import type { TTSAdapter } from './adapter'
import type { TTSResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'tts' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract model types from a TTSAdapter */
export type TTSModels<TAdapter> =
  TAdapter extends TTSAdapter<infer M, any> ? M[number] : string

/**
 * Extract provider options from a TTSAdapter.
 */
export type TTSProviderOptions<TAdapter> =
  TAdapter extends TTSAdapter<any, infer TProviderOptions>
    ? TProviderOptions
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the TTS activity.
 *
 * @template TAdapter - The TTS adapter type
 * @template TModel - The model name type (inferred from adapter)
 */
export interface TTSActivityOptions<
  TAdapter extends TTSAdapter<ReadonlyArray<string>, object>,
  TModel extends TTSModels<TAdapter>,
> {
  /** The TTS adapter to use */
  adapter: TAdapter & { kind: typeof kind }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** The text to convert to speech */
  text: string
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** The speed of the generated audio (0.25 to 4.0) */
  speed?: number
  /** Provider-specific options for TTS generation */
  modelOptions?: TTSProviderOptions<TAdapter>
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the TTS activity */
export type TTSActivityResult = Promise<TTSResult>

// ===========================
// Activity Implementation
// ===========================

/**
 * TTS activity - generates speech from text.
 *
 * Uses AI text-to-speech models to create audio from natural language text.
 *
 * @example Generate speech from text
 * ```ts
 * import { ai } from '@tanstack/ai'
 * import { openaiTTS } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiTTS(),
 *   model: 'tts-1-hd',
 *   text: 'Hello, welcome to TanStack AI!',
 *   voice: 'nova'
 * })
 *
 * console.log(result.audio) // base64-encoded audio
 * ```
 *
 * @example With format and speed options
 * ```ts
 * const result = await ai({
 *   adapter: openaiTTS(),
 *   model: 'tts-1',
 *   text: 'This is slower speech.',
 *   voice: 'alloy',
 *   format: 'wav',
 *   speed: 0.8
 * })
 * ```
 */
export async function generateSpeech<
  TAdapter extends TTSAdapter<ReadonlyArray<string>, object>,
  TModel extends TTSModels<TAdapter>,
>(options: TTSActivityOptions<TAdapter, TModel>): TTSActivityResult {
  const { adapter, ...rest } = options

  return adapter.generateSpeech(rest)
}

// Re-export adapter types
export type { TTSAdapter, TTSAdapterConfig } from './adapter'
export { BaseTTSAdapter } from './adapter'
