/**
 * Realtime Activity
 *
 * Creates connection with Realtime models.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import type {
  RealtimeAdapter,
} from './adapter'
import type { RealtimeResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'realtime' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a RealtimeAdapter via ~types.
 */
export type RealtimeProviderOptions<TAdapter> =
  TAdapter extends RealtimeAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the Realtime activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The Realtime adapter type
 */
export interface RealtimeActivityOptions<
  TAdapter extends RealtimeAdapter<string, object>,
> {
  /** The Live API adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** Provider-specific options for Live API connection */
  modelOptions?: RealtimeProviderOptions<TAdapter>
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the Live API activity */
export type RealtimeActivityResult = Promise<RealtimeResult>

// ===========================
// Activity Implementation
// ===========================

/**
 * Live API activity - connects to Live API
 *
 * Uses AI Live API models functionalities for speech-to-speech real-time conversations.
 *
 */
export async function connectRealtime<
  TAdapter extends RealtimeAdapter<string, object>,
>(options: RealtimeActivityOptions<TAdapter>): RealtimeActivityResult {
  const { adapter, ...rest } = options;
  const model = adapter.model;

  return adapter.connectRealtime({ ...rest, model });
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the connectLive() function without executing.
 */
export function createRealtimeOptions<
  TAdapter extends RealtimeAdapter<string, object>,
>(options: RealtimeActivityOptions<TAdapter>): RealtimeActivityOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type { RealtimeAdapter, RealtimeAdapterConfig, AnyRealtimeAdapter } from './adapter';
export { BaseRealtimeAdapter } from './adapter'
