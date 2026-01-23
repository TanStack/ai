/**
 * TTS Activity
 *
 * Generates speech audio from text using text-to-speech models.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '../../event-client.js'
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

/**
 * Extract provider options from a TTSAdapter via ~types.
 */
export type TTSProviderOptions<TAdapter> =
  TAdapter extends TTSAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the TTS activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The TTS adapter type
 */
export interface TTSActivityOptions<
  TAdapter extends TTSAdapter<string, object>,
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

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

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
  TAdapter extends TTSAdapter<string, object>,
>(options: TTSActivityOptions<TAdapter>): TTSActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.model
  const requestId = createId('speech')
  const startTime = Date.now()

  aiEventClient.emit('speech:request:started', {
    requestId,
    provider: adapter.name,
    model,
    text: rest.text,
    voice: rest.voice,
    format: rest.format,
    speed: rest.speed,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  return adapter.generateSpeech({ ...rest, model }).then((result) => {
    const duration = Date.now() - startTime

    aiEventClient.emit('speech:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      audio: result.audio,
      format: result.format,
      audioDuration: result.duration,
      contentType: result.contentType,
      duration,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })

    return result
  })
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateSpeech() function without executing.
 */
export function createSpeechOptions<
  TAdapter extends TTSAdapter<string, object>,
>(options: TTSActivityOptions<TAdapter>): TTSActivityOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type { TTSAdapter, TTSAdapterConfig, AnyTTSAdapter } from './adapter'
export { BaseTTSAdapter } from './adapter'
