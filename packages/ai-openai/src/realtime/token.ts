import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type {
  OpenAIRealtimeModel,
  OpenAIRealtimeSessionResponse,
  OpenAIRealtimeTokenOptions,
} from './types'

const OPENAI_REALTIME_SESSIONS_URL =
  'https://api.openai.com/v1/realtime/sessions'

/**
 * Creates an OpenAI realtime token adapter.
 *
 * This adapter generates ephemeral tokens for client-side WebRTC connections.
 * The token is valid for 10 minutes.
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
 *   adapter: openaiRealtimeToken({
 *     model: 'gpt-4o-realtime-preview',
 *     voice: 'alloy',
 *     instructions: 'You are a helpful assistant.',
 *     turnDetection: {
 *       type: 'semantic_vad',
 *       eagerness: 'medium',
 *     },
 *   }),
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
      const model: OpenAIRealtimeModel =
        options.model ?? 'gpt-4o-realtime-preview'

      // Call OpenAI API to create session and get ephemeral token.
      // Only the model is sent server-side; all other session config
      // (instructions, voice, tools, VAD) is applied client-side via session.update.
      const response = await fetch(OPENAI_REALTIME_SESSIONS_URL, {
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
          `OpenAI realtime session creation failed: ${response.status} ${errorText}`,
        )
      }

      const sessionData: OpenAIRealtimeSessionResponse = await response.json()

      return {
        provider: 'openai',
        token: sessionData.client_secret.value,
        expiresAt: sessionData.client_secret.expires_at * 1000,
        config: {
          model: sessionData.model,
        },
      }
    },
  }
}
