import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

/**
 * OpenAI client configuration. Pass through to `new OpenAI(...)`. `apiKey`
 * is required so the openai-compatible adapters don't need to handle a
 * missing-key case at construction time.
 */
export interface OpenAIClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

/**
 * Gets OpenAI API key from environment variables
 * @throws Error if OPENAI_API_KEY is not found
 */
export function getOpenAIApiKeyFromEnv(): string {
  return getApiKeyFromEnv('OPENAI_API_KEY')
}
