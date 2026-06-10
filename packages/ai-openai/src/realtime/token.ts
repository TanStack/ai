import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type {
  OpenAIRealtimeClientSecretResponse,
  OpenAIRealtimeModel,
  OpenAIRealtimeTokenOptions,
} from './types'

const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  'https://api.openai.com/v1/realtime/client_secrets'

/**
 * Builds the GA `/v1/realtime/client_secrets` request body.
 *
 * The session config (including its required `type`) is nested under the
 * `session` key. The model is bound to the resulting ephemeral key, so the
 * client never sends it during the WebRTC SDP exchange.
 */
export function buildClientSecretRequest(
  model: OpenAIRealtimeModel,
): Record<string, unknown> {
  return { session: { type: 'realtime', model } }
}

/**
 * Parses the GA client secret response into a {@link RealtimeToken}.
 *
 * GA returns the ephemeral key at the top level (`value` / `expires_at`),
 * not nested under `client_secret` like the retired Beta
 * `/v1/realtime/sessions` response did.
 */
export function parseClientSecretResponse(
  data: Partial<OpenAIRealtimeClientSecretResponse> | undefined,
  fallbackModel: OpenAIRealtimeModel,
): RealtimeToken {
  // Validate shape before dereferencing — the API could return an error
  // envelope with 200 status, or a partial response under protocol drift.
  if (
    !data ||
    typeof data.value !== 'string' ||
    typeof data.expires_at !== 'number' ||
    !Number.isFinite(data.expires_at)
  ) {
    throw new Error(
      'OpenAI realtime client secret response missing or malformed `value`/`expires_at`',
    )
  }

  return {
    provider: 'openai',
    token: data.value,
    expiresAt: data.expires_at * 1000,
    config: {
      model: data.session?.model ?? fallbackModel,
    },
  }
}

/**
 * Creates an OpenAI realtime token adapter.
 *
 * This adapter generates ephemeral keys for client-side WebRTC connections
 * via the GA `/v1/realtime/client_secrets` endpoint. The key is valid for
 * 10 minutes by default.
 *
 * @param options - Configuration options for the realtime session
 * @returns A RealtimeTokenAdapter for use with realtimeToken()
 *
 * @example
 * ```typescript
 * import { realtimeToken } from '@tanstack/ai'
 * import { openaiRealtimeToken } from '@tanstack/ai-openai'
 *
 * const token = await realtimeToken({
 *   adapter: openaiRealtimeToken({ model: 'gpt-realtime' }),
 * })
 * ```
 */
export function openaiRealtimeToken(
  options: OpenAIRealtimeTokenOptions = {},
): RealtimeTokenAdapter {
  const apiKey = getOpenAIApiKeyFromEnv()

  return {
    provider: 'openai',

    async generateToken(): Promise<RealtimeToken> {
      const model: OpenAIRealtimeModel = options.model ?? 'gpt-realtime'

      // Only the model is sent server-side; all other session config
      // (instructions, voice, tools, VAD) is applied client-side via
      // session.update.
      const response = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildClientSecretRequest(model)),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `OpenAI realtime client secret creation failed: ${response.status} ${errorText}`,
        )
      }

      const data = (await response.json()) as
        | Partial<OpenAIRealtimeClientSecretResponse>
        | undefined

      return parseClientSecretResponse(data, model)
    },
  }
}
