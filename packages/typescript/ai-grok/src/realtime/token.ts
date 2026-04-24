import { getGrokApiKeyFromEnv } from '../utils'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type {
  GrokRealtimeModel,
  GrokRealtimeSessionResponse,
  GrokRealtimeTokenOptions,
} from './types'

const GROK_REALTIME_CLIENT_SECRETS_URL =
  'https://api.x.ai/v1/realtime/client_secrets'

/**
 * Creates a Grok realtime token adapter.
 *
 * Generates ephemeral client secrets for browser-side WebRTC connections to
 * the xAI Voice Agent API.
 *
 * @param options - Configuration options for the realtime session.
 * @returns A RealtimeTokenAdapter for use with `realtimeToken()`.
 *
 * @example
 * ```typescript
 * import { realtimeToken } from '@tanstack/ai'
 * import { grokRealtimeToken } from '@tanstack/ai-grok'
 *
 * const token = await realtimeToken({
 *   adapter: grokRealtimeToken({ model: 'grok-voice-fast-1.0' }),
 * })
 * ```
 */
export function grokRealtimeToken(
  options: GrokRealtimeTokenOptions = {},
): RealtimeTokenAdapter {
  const apiKey = getGrokApiKeyFromEnv()

  return {
    provider: 'grok',

    async generateToken(): Promise<RealtimeToken> {
      const model: GrokRealtimeModel = options.model ?? 'grok-voice-fast-1.0'

      const response = await fetch(GROK_REALTIME_CLIENT_SECRETS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Grok realtime session creation failed: ${response.status} ${errorText}`,
        )
      }

      const sessionData: GrokRealtimeSessionResponse = await response.json()

      return {
        provider: 'grok',
        token: sessionData.client_secret.value,
        expiresAt: sessionData.client_secret.expires_at * 1000,
        config: {
          model: sessionData.model,
        },
      }
    },
  }
}
