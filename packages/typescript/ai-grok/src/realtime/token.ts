import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { getGrokApiKeyFromEnv } from '../utils'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type { GrokRealtimeModel } from '../model-meta'
import type {
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
  const logger = resolveDebugOption(options.debug)

  return {
    provider: 'grok',

    async generateToken(): Promise<RealtimeToken> {
      const model: GrokRealtimeModel = options.model ?? 'grok-voice-fast-1.0'

      logger.request(`activity=realtimeToken provider=grok model=${model}`, {
        provider: 'grok',
        model,
      })

      try {
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

        // xAI docs describe `expires_at` as a unix timestamp in seconds, but
        // in practice different deployments have returned milliseconds. Treat
        // any value that already looks like ms (>1e12 ≈ Sep 2001 in ms) as ms.
        const raw = sessionData.client_secret.expires_at
        const expiresAt = raw > 1e12 ? raw : raw * 1000

        return {
          provider: 'grok',
          token: sessionData.client_secret.value,
          expiresAt,
          config: {
            model: sessionData.model,
          },
        }
      } catch (error) {
        logger.errors('grok.realtimeToken fatal', {
          error,
          source: 'grok.realtimeToken',
        })
        throw error
      }
    },
  }
}
