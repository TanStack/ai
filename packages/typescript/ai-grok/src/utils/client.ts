import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { OpenAICompatibleClientConfig } from '@tanstack/ai-openai-compatible'

export interface GrokClientConfig extends OpenAICompatibleClientConfig {}

/**
 * Gets Grok API key from environment variables
 * @throws Error if XAI_API_KEY is not found
 */
export function getGrokApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('XAI_API_KEY')
  } catch {
    throw new Error(
      'XAI_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

/**
 * Returns a Grok client config with the default xAI base URL applied
 * when not already set.
 */
export function withGrokDefaults(
  config: GrokClientConfig,
): OpenAICompatibleClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.x.ai/v1',
  }
}
