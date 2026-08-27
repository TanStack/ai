import { GoogleGenAI } from '@google/genai'
import { getGeminiApiKeyFromEnv } from '../utils'
import type { RealtimeToken, RealtimeTokenAdapter } from '@tanstack/ai'
import type { GeminiRealtimeTokenOptions } from './types'

export function geminiRealtimeToken(
  options: GeminiRealtimeTokenOptions = {},
): RealtimeTokenAdapter {
  const apiKey = getGeminiApiKeyFromEnv()

  const client = new GoogleGenAI({
    apiKey,
  })

  return {
    provider: 'gemini',
    async generateToken(): Promise<RealtimeToken> {
      // Computed per call so a reused adapter doesn't mint tokens with a
      // fixed (and eventually past) expiry. Defaults to 30 minutes.
      const expireTime = options.expiresAt ?? Date.now() + 30 * 60 * 1000

      const token = await client.authTokens.create({
        config: {
          uses: options.uses ?? 1,
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
