import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { OpenAICompatibleClientConfig } from '@tanstack/openai-base'

export interface OpenAIClientConfig extends OpenAICompatibleClientConfig {}

/**
 * Gets OpenAI API key from environment variables
 * @throws Error if OPENAI_API_KEY is not found
 */
export function getOpenAIApiKeyFromEnv(): string {
  return getApiKeyFromEnv('OPENAI_API_KEY')
}
