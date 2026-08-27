import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GROK_DEFAULT_REALTIME_MODEL } from '../model-meta'
import { getGrokApiKeyFromEnv } from '../utils'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type { GrokRealtimeModel } from '../model-meta'
import type {
  GrokRealtimeSessionResponse,
  GrokRealtimeTokenOptions,
} from './types'

const GROK_REALTIME_CLIENT_SECRETS_URL =
  'https://api.x.ai/v1/realtime/client_secrets'

const DEFAULT_TOKEN_FETCH_TIMEOUT_MS = 15_000

export function grokRealtimeToken(
  options: GrokRealtimeTokenOptions = {},
): RealtimeTokenAdapter {
  const apiKey = getGrokApiKeyFromEnv()
  const logger = resolveDebugOption(options.debug)

  return {
    provider: 'grok',

    async generateToken(): Promise<RealtimeToken> {
      const model: GrokRealtimeModel =
        options.model ?? GROK_DEFAULT_REALTIME_MODEL

      logger.request(`activity=realtimeToken provider=grok model=${model}`, {
        provider: 'grok',
        model,
      })

      const requestBody: Record<string, unknown> = {
        session: { model },
      }

      // Abort the fetch if xAI never responds. Without this the whole
      // realtime connect flow hangs forever on a dead endpoint.
      const controller = new AbortController()
      const timeout = setTimeout(
        () =>
          controller.abort(new Error('Grok realtime token request timed out')),
        DEFAULT_TOKEN_FETCH_TIMEOUT_MS,
      )

      try {
        const response = await fetch(GROK_REALTIME_CLIENT_SECRETS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Grok realtime session creation failed: ${response.status} ${errorText}`,
          )
        }

        const sessionData = (await response.json()) as
          | Partial<GrokRealtimeSessionResponse>
          | undefined

        // Validate shape before dereferencing — xAI could return an error
        // envelope with 200 status, or a partial response under protocol drift.
        const clientSecret = sessionData?.client_secret
        const malformedSecret =
          'Grok realtime session response missing or malformed `client_secret`'
        if (!clientSecret) {
          throw new Error(malformedSecret)
        }
        if (typeof clientSecret.value !== 'string') {
          throw new Error(malformedSecret)
        }
        if (typeof clientSecret.expires_at !== 'number') {
          throw new Error(malformedSecret)
        }
        if (!Number.isFinite(clientSecret.expires_at)) {
          throw new Error(malformedSecret)
        }
        const sessionModel = sessionData.model ?? model

        const raw = clientSecret.expires_at
        const expiresAt = raw > 1e12 ? raw : raw * 1000

        return {
          provider: 'grok',
          token: clientSecret.value,
          expiresAt,
          config: {
            model: sessionModel,
          },
        }
      } catch (error) {
        logger.errors('grok.realtimeToken fatal', {
          error,
          source: 'grok.realtimeToken',
        })
        throw error
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
