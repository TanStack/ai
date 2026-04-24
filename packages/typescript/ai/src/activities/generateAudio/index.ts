/**
 * Audio Generation Activity
 *
 * Generates audio (music, sound effects, etc.) from text prompts.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { streamGenerationResult } from '../stream-generation-result.js'
import { resolveDebugOption } from '../../logger/resolve'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
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
  /**
   * Enable debug logging. Pass `true` to enable all categories, `false` to
   * silence everything including errors, or a `DebugConfig` object for granular
   * control and/or a custom `Logger`.
   */
  debug?: DebugOption
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
  const { adapter, stream: _stream, debug: _debug, ...rest } = options
  const model = adapter.model
  const requestId = createId('audio')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  aiEventClient.emit('audio:request:started', {
    requestId,
    provider: adapter.name,
    model,
    prompt: rest.prompt,
    duration: rest.duration,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  logger.request(`activity=generateAudio provider=${providerName}`, {
    provider: providerName,
    model,
  })

  try {
    const result = await adapter.generateAudio({ ...rest, model, logger })
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

    logger.output(`activity=generateAudio provider=${providerName}`, {
      contentType: result.audio.contentType,
      audioDuration: result.audio.duration,
    })

    return result
  } catch (error) {
    const elapsedMs = Date.now() - startTime
    const err = error as Error
    aiEventClient.emit('audio:request:error', {
      requestId,
      provider: adapter.name,
      model,
      error: { message: err.message, name: err.name },
      duration: elapsedMs,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })
    logger.errors('generateAudio activity failed', {
      error,
      source: 'generateAudio',
    })
    throw error
  }
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
