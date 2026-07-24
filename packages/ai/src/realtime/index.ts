import type { RealtimeToken, RealtimeTokenOptions } from './types'

export { createRealtimeEventEmitter } from './event-emitter'

// Re-export all types
export type * from './types'

/**
 * Generate a realtime token using the provided adapter.
 *
 * This function is used on the server to generate ephemeral tokens
 * that clients can use to establish realtime connections.
 *
 * @param options - Token generation options including the adapter
 * @returns Promise resolving to a RealtimeToken
 *
 * @example
 * ```typescript
 * import { realtimeToken } from '@tanstack/ai'
 * import { openaiRealtimeToken } from '@tanstack/ai-openai'
 *
 * // On the server (e.g. inside a server route or framework server
 * // function), mint an ephemeral token for the client:
 * const token = await realtimeToken({
 *   adapter: openaiRealtimeToken({ model: 'gpt-realtime' }),
 * })
 * ```
 */
export async function realtimeToken(
  options: RealtimeTokenOptions,
): Promise<RealtimeToken> {
  const { adapter } = options
  return adapter.generateToken()
}
