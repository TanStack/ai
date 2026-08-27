import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface GroqClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

export function getGroqApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('GROQ_API_KEY')
  } catch {
    throw new Error(
      'GROQ_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

export function withGroqDefaults(config: GroqClientConfig): GroqClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.groq.com/openai/v1',
  }
}
