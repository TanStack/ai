import { GoogleGenAI } from '@google/genai'
import { getGeminiApiKeyFromEnv } from '../utils'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type { GeminiRealtimeTokenOptions } from './types'

/**
 * Creates a Google Gemini realtime token adapter.
 *
 * This adapter generates ephemeral tokens for client-side WebSocket connections.
 *
 * @param options - Configuration options for the realtime session
 * @returns A RealtimeTokenAdapter for use with realtimeToken()
 *
 * @example
 * ```typescript
 * import { realtimeToken } from '@tanstack/ai'
 * import { geminiRealtimeToken } from '@tanstack/ai-gemini'
 *
 * const token = await realtimeToken({
 *   adapter: geminiRealtimeToken({
 *     // Optional: constraint model config by token
 *     liveConnectConstraints: {
 *       model: 'gemini-live-2.5-flash-native-audio',
 *     },
 *   }),
 * })
 * ```
 */
export function geminiRealtimeToken(
  options: GeminiRealtimeTokenOptions = {},
): RealtimeTokenAdapter {
  const apiKey = getGeminiApiKeyFromEnv()

  const client = new GoogleGenAI({
    apiKey,
  })

  // Defaults to 30 minutes
  const expireTime = options.expiresAt ?? Date.now() + 30 * 60 * 1000

  return {
    provider: 'gemini',
    async generateToken(): Promise<RealtimeToken> {
      const token = await client.authTokens.create({
        config: {
          uses: 1, // The default
          expireTime: new Date(expireTime).toISOString(),
          liveConnectConstraints: options.liveConnectConstraints,
          httpOptions: {
            apiVersion: 'v1alpha',
          },
        },
      })

      if (!token.name) {
        throw new Error('Gemini realtime token creation failed')
      }

      return {
        provider: 'gemini',
        token: token.name,
        expiresAt: expireTime,
        config: {
          model: options.liveConnectConstraints?.model,
        },
      }
    },
  }
}
