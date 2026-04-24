import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { OpenAICompatibleClientConfig } from '@tanstack/openai-base'
import type { ClientOptions } from 'openai'

export interface GrokClientConfig extends ClientOptions {
  apiKey: string
}

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
 * Converts a GrokClientConfig to OpenAICompatibleClientConfig.
 * Sets the default xAI base URL if not already set.
 */
export function toCompatibleConfig(
  config: GrokClientConfig,
): OpenAICompatibleClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.x.ai/v1',
  } as unknown as OpenAICompatibleClientConfig
}
