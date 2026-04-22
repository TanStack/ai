/**
 * Audio Generation Activity
 *
 * Generates audio (music, sound effects, etc.) from text prompts.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { streamGenerationResult } from '../stream-generation-result.js'
import type { AudioAdapter } from './adapter'
import type { AudioGenerationResult, StreamChunk } from '../../types'

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
 * @template TStream - Whether to stream the output
 */
export interface AudioActivityOptions<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
  TStream extends boolean = false,
> {
  /** The audio adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Text description of the desired audio */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Provider-specific options for audio generation */
  modelOptions?: AudioProviderOptions<TAdapter>
  /**
   * Whether to stream the generation result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming transport.
   * When false or not provided, returns a Promise<AudioGenerationResult>.
   *
   * @default false
   */
  stream?: TStream
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the audio generation activity.
 * - If stream is true: AsyncIterable<StreamChunk>
 * - Otherwise: Promise<AudioGenerationResult>
 */
export type AudioActivityResult<TStream extends boolean = false> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<AudioGenerationResult>

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
export function generateAudio<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: AudioActivityOptions<TAdapter, TStream>,
): AudioActivityResult<TStream> {
  if (options.stream) {
    return streamGenerationResult(() =>
      runGenerateAudio(options),
    ) as AudioActivityResult<TStream>
  }
  return runGenerateAudio(options) as AudioActivityResult<TStream>
}

/**
 * Run the core audio generation logic (non-streaming).
 */
async function runGenerateAudio<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
>(
  options: AudioActivityOptions<TAdapter, boolean>,
): Promise<AudioGenerationResult> {
  const { adapter, stream: _stream, ...rest } = options
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
  TStream extends boolean = false,
>(
  options: AudioActivityOptions<TAdapter, TStream>,
): AudioActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  AudioAdapter,
  AudioAdapterConfig,
  AnyAudioAdapter,
} from './adapter'
export { BaseAudioAdapter } from './adapter'
