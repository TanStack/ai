import type { RealtimeToken, RealtimeTokenOptions } from './types'

export { createRealtimeEventEmitter } from './event-emitter'

// Re-export all types
export type * from './types'

export async function realtimeToken(
  options: RealtimeTokenOptions,
): Promise<RealtimeToken> {
  const { adapter } = options
  return adapter.generateToken()
}
