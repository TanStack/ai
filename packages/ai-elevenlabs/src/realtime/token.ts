import {
  createElevenLabsClient,
  getElevenLabsAgentIdFromEnv,
} from '../utils/client'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type { ElevenLabsRealtimeTokenOptions } from './types'

export function elevenlabsRealtimeToken(
  options: ElevenLabsRealtimeTokenOptions = {},
): RealtimeTokenAdapter {
  const client = createElevenLabsClient()

  return {
    provider: 'elevenlabs',

    async generateToken(): Promise<RealtimeToken> {
      const { overrides } = options
      const agentId = options.agentId ?? getElevenLabsAgentIdFromEnv()

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
          ...(overrides?.voiceId !== undefined && { voice: overrides.voiceId }),
          ...(overrides?.systemPrompt !== undefined && {
            instructions: overrides.systemPrompt,
          }),
          providerOptions: {
            agentId,
            ...(overrides?.firstMessage !== undefined && {
              firstMessage: overrides.firstMessage,
            }),
            ...(overrides?.language !== undefined && {
              language: overrides.language,
            }),
          },
        },
      }
    },
  }
}
