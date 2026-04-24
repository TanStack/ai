import type { RealtimeToken, RealtimeTokenOptions } from './types'

// Re-export all types
export * from './types'

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
 * // Server function (TanStack Start example)
 * export const getRealtimeToken = createServerFn()
 *   .handler(async () => {
 *     return realtimeToken({
 *       adapter: openaiRealtimeToken({
 *         model: 'gpt-4o-realtime-preview',
 *         voice: 'alloy',
 *         instructions: 'You are a helpful assistant...',
 *       }),
 *     })
 *   })
 * ```
 */
export async function realtimeToken(
  options: RealtimeTokenOptions,
): Promise<RealtimeToken> {
  const { adapter } = options
  return adapter.generateToken()
}
