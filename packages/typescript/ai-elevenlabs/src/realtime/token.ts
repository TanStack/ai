import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type { ElevenLabsRealtimeTokenOptions } from './types'

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1'

/**
 * Get ElevenLabs API key from environment
 */
function getElevenLabsApiKey(): string {
  return getApiKeyFromEnv('ELEVENLABS_API_KEY')
}

/**
 * Creates an ElevenLabs realtime token adapter.
 *
 * This adapter generates signed URLs for client-side connections.
 * The signed URL is valid for 30 minutes.
 *
 * @param options - Configuration options including agentId
 * @returns A RealtimeTokenAdapter for use with realtimeToken()
 *
 * @example
 * ```typescript
 * import { realtimeToken } from '@tanstack/ai'
 * import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'
 *
 * const token = await realtimeToken({
 *   adapter: elevenlabsRealtimeToken({
 *     agentId: 'your-agent-id',
 *   }),
 * })
 * ```
 */
export function elevenlabsRealtimeToken(
  options: ElevenLabsRealtimeTokenOptions,
): RealtimeTokenAdapter {
  const apiKey = getElevenLabsApiKey()

  return {
    provider: 'elevenlabs',

    async generateToken(): Promise<RealtimeToken> {
      const { agentId, overrides } = options

      // Get signed URL from ElevenLabs
      const response = await fetch(
        `${ELEVENLABS_API_URL}/convai/conversation/get_signed_url?agent_id=${agentId}`,
        {
          method: 'GET',
          headers: {
            'xi-api-key': apiKey,
          },
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `ElevenLabs signed URL request failed: ${response.status} ${errorText}`,
        )
      }

      const data = await response.json()
      const signedUrl = data.signed_url as string

      // Signed URLs are valid for 30 minutes
      const expiresAt = Date.now() + 30 * 60 * 1000

      return {
        provider: 'elevenlabs',
        token: signedUrl,
        expiresAt,
        config: {
          voice: overrides?.voiceId,
          instructions: overrides?.systemPrompt,
          providerOptions: {
            agentId,
            firstMessage: overrides?.firstMessage,
            language: overrides?.language,
          },
        },
      }
    },
  }
}
