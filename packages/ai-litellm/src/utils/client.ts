import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface LiteLLMClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey?: string
}

const DEFAULT_LITELLM_BASE_URL = 'http://localhost:4000/v1'

/**
 * Gets LiteLLM API key from environment variables.
 * @throws Error if LITELLM_API_KEY is not found
 */
export function getLiteLLMApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('LITELLM_API_KEY')
  } catch {
    throw new Error(
      'LITELLM_API_KEY is required. Please set it in your environment variables or use createLitellmText() with an explicit API key.',
    )
  }
}

/**
 * Returns an OpenAI client config pointing at the LiteLLM proxy.
 * Defaults to http://localhost:4000/v1 when no baseURL is provided.
 */
export function withLiteLLMDefaults(
  config: LiteLLMClientConfig,
): LiteLLMClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || DEFAULT_LITELLM_BASE_URL,
  }
}
