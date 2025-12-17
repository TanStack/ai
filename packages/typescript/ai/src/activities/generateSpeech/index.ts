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
  TAdapter extends TTSAdapter<infer M, any, any> ? M[number] : string

/**
 * Extract provider options from a TTSAdapter.
 */
export type TTSProviderOptions<TAdapter> =
  TAdapter extends TTSAdapter<any, infer TProviderOptions, any>
  ? TProviderOptions
  : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the TTS activity.
 * The model is extracted from the adapter's selectedModel property.
 *
 * @template TAdapter - The TTS adapter type (must have a selectedModel)
 */
export interface TTSActivityOptions<
  TAdapter extends TTSAdapter<ReadonlyArray<string>, object, string>,
> {
  /** The TTS adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
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
 * import { generateSpeech } from '@tanstack/ai'
 * import { openaiTTS } from '@tanstack/ai-openai'
 *
 * const result = await generateSpeech({
 *   adapter: openaiTTS('tts-1-hd'),
 *   text: 'Hello, welcome to TanStack AI!',
 *   voice: 'nova'
 * })
 *
 * console.log(result.audio) // base64-encoded audio
 * ```
 *
 * @example With format and speed options
 * ```ts
 * const result = await generateSpeech({
 *   adapter: openaiTTS('tts-1'),
 *   text: 'This is slower speech.',
 *   voice: 'alloy',
 *   format: 'wav',
 *   speed: 0.8
 * })
 * ```
 */
export async function generateSpeech<
  TAdapter extends TTSAdapter<ReadonlyArray<string>, object, string>,
>(options: TTSActivityOptions<TAdapter>): TTSActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.selectedModel

  return adapter.generateSpeech({ ...rest, model })
}

// Re-export adapter types
export type { TTSAdapter, TTSAdapterConfig } from './adapter'
export { BaseTTSAdapter } from './adapter'
