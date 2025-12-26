/**
 * Live API Activity
 *
 * Creates connection with Live API models.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import type {
  LiveAPIAdapter,
} from './adapter'
import type { LiveAPIResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'liveAPI' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a LiveAPIAdapter via ~types.
 */
export type LiveAPIProviderOptions<TAdapter> =
  TAdapter extends LiveAPIAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the Live API activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The Live API adapter type
 */
export interface LiveAPIActivityOptions<
  TAdapter extends LiveAPIAdapter<string, object>,
> {
  /** The Live API adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** Provider-specific options for Live API connection */
  modelOptions?: LiveAPIProviderOptions<TAdapter>
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the Live API activity */
export type LiveAPIActivityResult = Promise<LiveAPIResult>

// ===========================
// Activity Implementation
// ===========================

/**
 * Live API activity - connects to Live API
 *
 * Uses AI Live API models functionalities for speech-to-speech real-time conversations.
 *
 */
export async function connectLive<
  TAdapter extends LiveAPIAdapter<string, object>,
>(options: LiveAPIActivityOptions<TAdapter>): LiveAPIActivityResult {
  const { adapter, ...rest } = options;
  const model = adapter.model;

  return adapter.connectLive({ ...rest, model });
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the connectLive() function without executing.
 */
export function createLiveAPIOptions<
  TAdapter extends LiveAPIAdapter<string, object>,
>(options: LiveAPIActivityOptions<TAdapter>): LiveAPIActivityOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type { LiveAPIAdapter, LiveAPIAdapterConfig, AnyLiveAPIAdapter } from './adapter';
export { BaseLiveAPIAdapter } from './adapter'
