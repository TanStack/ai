import {
  createElevenLabsClient,
  getElevenLabsAgentIdFromEnv,
} from '../utils/client'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type { ElevenLabsRealtimeTokenOptions } from './types'

/**
 * Creates an ElevenLabs realtime token adapter.
 *
 * Uses the official `@elevenlabs/elevenlabs-js` SDK to request a signed URL
 * for client-side conversation connections. The signed URL is valid for
 * 30 minutes.
 *
 * @param options - Configuration. `agentId` falls back to
 *   `ELEVENLABS_AGENT_ID` in the environment when omitted.
 * @returns A RealtimeTokenAdapter for use with realtimeToken()
 *
 * @example
 * ```typescript
 * import { realtimeToken } from '@tanstack/ai'
 * import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'
 *
 * // Reads ELEVENLABS_AGENT_ID from env:
 * const token = await realtimeToken({ adapter: elevenlabsRealtimeToken() })
 *
 * // Or pass explicitly:
 * const token = await realtimeToken({
 *   adapter: elevenlabsRealtimeToken({ agentId: 'your-agent-id' }),
 * })
 * ```
 */
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

      // Conditionally spread optional fields — the vendor target type
      // (`RealtimeSessionConfig` in `@tanstack/ai`) uses strict
      // `field?: T` semantics under `exactOptionalPropertyTypes`, so we
      // omit keys entirely when the override is absent rather than
      // setting them to `undefined`.
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
