/**
 * Audio Generation Activity
 *
 * Generates audio (music, sound effects, etc.) from text prompts.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import type { AudioAdapter } from './adapter'
import type { AudioGenerationResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'audio' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from an AudioAdapter via ~types.
 */
export type AudioProviderOptions<TAdapter> =
  TAdapter extends AudioAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the audio generation activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The audio adapter type
 */
export interface AudioActivityOptions<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
> {
  /** The audio adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Text description of the desired audio */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Provider-specific options for audio generation */
  modelOptions?: AudioProviderOptions<TAdapter>
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the audio generation activity */
export type AudioActivityResult = Promise<AudioGenerationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Audio generation activity - generates audio from text prompts.
 *
 * Uses AI models to create music, sound effects, and other audio content.
 *
 * @example Generate music from a prompt
 * ```ts
 * import { generateAudio } from '@tanstack/ai'
 * import { falAudio } from '@tanstack/ai-fal'
 *
 * const result = await generateAudio({
 *   adapter: falAudio('fal-ai/diffrhythm'),
 *   prompt: 'An upbeat electronic track with synths',
 *   duration: 10
 * })
 *
 * console.log(result.audio.url) // URL to generated audio
 * ```
 */
export async function generateAudio<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
>(options: AudioActivityOptions<TAdapter>): AudioActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.model
  const requestId = createId('audio')
  const startTime = Date.now()

  aiEventClient.emit('audio:request:started', {
    requestId,
    provider: adapter.name,
    model,
    prompt: rest.prompt,
    duration: rest.duration,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  const result = await adapter.generateAudio({ ...rest, model })
  const elapsedMs = Date.now() - startTime

  aiEventClient.emit('audio:request:completed', {
    requestId,
    provider: adapter.name,
    model,
    audio: result.audio,
    duration: elapsedMs,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: Date.now(),
  })

  return result
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateAudio() function without executing.
 */
export function createAudioOptions<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
>(options: AudioActivityOptions<TAdapter>): AudioActivityOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type {
  AudioAdapter,
  AudioAdapterConfig,
  AnyAudioAdapter,
} from './adapter'
export { BaseAudioAdapter } from './adapter'
