/**
 * Music Generation Activity
 *
 * Generates music from text prompts.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import type { MusicAdapter } from './adapter'
import type { MusicGenerationResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'music' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a MusicAdapter via ~types.
 */
export type MusicProviderOptions<TAdapter> =
  TAdapter extends MusicAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the music generation activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The music adapter type
 */
export interface MusicActivityOptions<
  TAdapter extends MusicAdapter<string, MusicProviderOptions<TAdapter>>,
> {
  /** The music adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Text description of the desired music */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Provider-specific options for music generation */
  modelOptions?: MusicProviderOptions<TAdapter>
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the music generation activity */
export type MusicActivityResult = Promise<MusicGenerationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Music generation activity - generates music from text prompts.
 *
 * @example Generate music from a prompt
 * ```ts
 * import { generateMusic } from '@tanstack/ai'
 * import { falMusic } from '@tanstack/ai-fal'
 *
 * const result = await generateMusic({
 *   adapter: falMusic('fal-ai/minimax-music/v2.6'),
 *   prompt: 'An upbeat electronic track with synths',
 *   duration: 10
 * })
 *
 * console.log(result.audio.url) // URL to generated audio
 * ```
 */
export async function generateMusic<
  TAdapter extends MusicAdapter<string, MusicProviderOptions<TAdapter>>,
>(options: MusicActivityOptions<TAdapter>): MusicActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.model
  const requestId = createId('music')
  const startTime = Date.now()

  aiEventClient.emit('music:request:started', {
    requestId,
    provider: adapter.name,
    model,
    prompt: rest.prompt,
    duration: rest.duration,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  const result = await adapter.generateMusic({ ...rest, model })
  const elapsedMs = Date.now() - startTime

  aiEventClient.emit('music:request:completed', {
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
 * Create typed options for the generateMusic() function without executing.
 */
export function createMusicOptions<
  TAdapter extends MusicAdapter<string, MusicProviderOptions<TAdapter>>,
>(options: MusicActivityOptions<TAdapter>): MusicActivityOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type {
  MusicAdapter,
  MusicAdapterConfig,
  AnyMusicAdapter,
} from './adapter'
export { BaseMusicAdapter } from './adapter'
