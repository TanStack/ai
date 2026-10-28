import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface GroqClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

/**
 * Gets Groq API key from environment variables
 * @throws Error if GROQ_API_KEY is not found
 */
export function getGroqApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('GROQ_API_KEY')
  } catch {
    throw new Error(
      'GROQ_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

/**
 * Returns a Groq client config with Groq's OpenAI-compatible base URL
 * applied when not already set. The Groq endpoint accepts the OpenAI SDK
 * verbatim, so the adapter drives it via the OpenAI SDK with this baseURL.
 */
export function withGroqDefaults(config: GroqClientConfig): GroqClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.groq.com/openai/v1',
  }
}
