import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { OpenAICompatibleClientConfig } from '@tanstack/ai-openai-compatible'

export interface GroqClientConfig extends OpenAICompatibleClientConfig {}

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
 * verbatim, so the base adapter can drive it without a separate SDK.
 */
export function withGroqDefaults(
  config: GroqClientConfig,
): OpenAICompatibleClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.groq.com/openai/v1',
  }
}
