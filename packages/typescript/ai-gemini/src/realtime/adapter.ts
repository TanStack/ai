import type {
  AnyClientTool,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeToken,
} from '@tanstack/ai'
import type { RealtimeAdapter, RealtimeConnection } from '@tanstack/ai-client'
import type { GeminiRealtimeOptions } from './types'

/**
 * Creates a Gemini realtime adapter for client-side use.
 *
 * @param options - Optional configuration
 * @returns A RealtimeAdapter for use with RealtimeClient
 *
 * @example
 * ```typescript
 * import { RealtimeClient } from '@tanstack/ai-client'
 * import { geminiRealtime } from '@tanstack/ai-gemini'
 *
 * const client = new RealtimeClient({
 *   getToken: () => fetch('/api/realtime-token').then(r => r.json()),
 *   adapter: geminiRealtime(),
 * })
 * ```
 */
export function geminiRealtime(
  options: GeminiRealtimeOptions = {},
): RealtimeAdapter {
  return {
    provider: 'gemini',

    connect(
      token: RealtimeToken,
      _clientTools?: ReadonlyArray<AnyClientTool>,
    ): Promise<RealtimeConnection> {
      return createWebSocketConnection(token)
    },
  }
}

/**
 * Creates a WebSocket connection to Gemini's realtime API
 */
function createWebSocketConnection(
  token: RealtimeToken,
): Promise<RealtimeConnection> {
  const model = token.config.model ?? 'gemini-live-2.5-flash-native-audio'
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()

  return new Promise((resolve, reject) => {})
}
