import { createElevenLabsClient } from '../utils/client'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type { ElevenLabsRealtimeTokenOptions } from './types'

/**
 * Creates an ElevenLabs realtime token adapter.
 *
 * Uses the official `@elevenlabs/elevenlabs-js` SDK to request a signed URL
 * for client-side conversation connections. The signed URL is valid for
 * 30 minutes.
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
  const client = createElevenLabsClient()

  return {
    provider: 'elevenlabs',

    async generateToken(): Promise<RealtimeToken> {
      const { agentId, overrides } = options

      const response = await client.conversationalAi.conversations.getSignedUrl(
        { agentId },
      )

      // Signed URLs are valid for 30 minutes
      const expiresAt = Date.now() + 30 * 60 * 1000

      return {
        provider: 'elevenlabs',
        token: response.signedUrl,
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
