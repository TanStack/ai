/**
 * Sound Effects Generation Activity
 *
 * Generates sound effects from text prompts.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import type { SoundEffectsAdapter } from './adapter'
import type { SoundEffectsGenerationResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'sound-effects' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a SoundEffectsAdapter via ~types.
 */
export type SoundEffectsProviderOptions<TAdapter> =
  TAdapter extends SoundEffectsAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the sound-effects generation activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The sound-effects adapter type
 */
export interface SoundEffectsActivityOptions<
  TAdapter extends SoundEffectsAdapter<
    string,
    SoundEffectsProviderOptions<TAdapter>
  >,
> {
  /** The sound-effects adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Text description of the desired sound */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Provider-specific options for sound-effects generation */
  modelOptions?: SoundEffectsProviderOptions<TAdapter>
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the sound-effects generation activity */
export type SoundEffectsActivityResult = Promise<SoundEffectsGenerationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Sound-effects generation activity - generates sound effects from text prompts.
 *
 * @example Generate a sound effect from a prompt
 * ```ts
 * import { generateSoundEffects } from '@tanstack/ai'
 * import { falSoundEffects } from '@tanstack/ai-fal'
 *
 * const result = await generateSoundEffects({
 *   adapter: falSoundEffects('fal-ai/elevenlabs/sound-effects/v2'),
 *   prompt: 'Thunderclap followed by heavy rain',
 *   duration: 5
 * })
 *
 * console.log(result.audio.url) // URL to generated audio
 * ```
 */
export async function generateSoundEffects<
  TAdapter extends SoundEffectsAdapter<
    string,
    SoundEffectsProviderOptions<TAdapter>
  >,
>(options: SoundEffectsActivityOptions<TAdapter>): SoundEffectsActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.model
  const requestId = createId('sfx')
  const startTime = Date.now()

  aiEventClient.emit('soundEffects:request:started', {
    requestId,
    provider: adapter.name,
    model,
    prompt: rest.prompt,
    duration: rest.duration,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  const result = await adapter.generateSoundEffects({ ...rest, model })
  const elapsedMs = Date.now() - startTime

  aiEventClient.emit('soundEffects:request:completed', {
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
 * Create typed options for the generateSoundEffects() function without executing.
 */
export function createSoundEffectsOptions<
  TAdapter extends SoundEffectsAdapter<
    string,
    SoundEffectsProviderOptions<TAdapter>
  >,
>(
  options: SoundEffectsActivityOptions<TAdapter>,
): SoundEffectsActivityOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type {
  SoundEffectsAdapter,
  SoundEffectsAdapterConfig,
  AnySoundEffectsAdapter,
} from './adapter'
export { BaseSoundEffectsAdapter } from './adapter'
