import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type {
  OpenAIRealtimeClientSecretResponse,
  OpenAIRealtimeModel,
  OpenAIRealtimeTokenOptions,
} from './types'

const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  'https://api.openai.com/v1/realtime/client_secrets'

export function buildClientSecretRequest(
  model: OpenAIRealtimeModel,
): Record<string, unknown> {
  return { session: { type: 'realtime', model } }
}

export function parseClientSecretResponse(
  data: Partial<OpenAIRealtimeClientSecretResponse> | undefined,
  fallbackModel: OpenAIRealtimeModel,
): RealtimeToken {
  // Validate shape before dereferencing — the API could return an error
  // envelope with 200 status, or a partial response under protocol drift.
  if (
    data &&
    typeof data.value === 'string' &&
    typeof data.expires_at === 'number' &&
    Number.isFinite(data.expires_at)
  ) {
    return {
      provider: 'openai',
      token: data.value,
      expiresAt: data.expires_at * 1000,
      config: {
        model: data.session?.model ?? fallbackModel,
      },
    }
  }

  throw new Error(
    'OpenAI realtime client secret response missing or malformed `value`/`expires_at`',
  )
}

export function openaiRealtimeToken(
  options: OpenAIRealtimeTokenOptions = {},
): RealtimeTokenAdapter {
  const apiKey = getOpenAIApiKeyFromEnv()

  return {
    provider: 'openai',

    async generateToken(): Promise<RealtimeToken> {
      const model: OpenAIRealtimeModel = options.model ?? 'gpt-realtime'

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
