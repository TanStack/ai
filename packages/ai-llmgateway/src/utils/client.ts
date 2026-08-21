import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface LLMGatewayClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

/**
 * Gets the LLM Gateway API key from environment variables
 * @throws Error if LLM_GATEWAY_API_KEY is not found
 */
export function getLLMGatewayApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('LLM_GATEWAY_API_KEY')
  } catch (cause) {
    throw new Error(
      'LLM_GATEWAY_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
      { cause },
    )
  }
}

/**
 * Returns an LLM Gateway client config with the gateway's OpenAI-compatible
 * base URL applied when not already set. LLM Gateway accepts the OpenAI SDK
 * verbatim, so the adapter drives it via the OpenAI SDK with this baseURL.
 * Point `baseURL` at your own deployment when self-hosting.
 */
export function withLLMGatewayDefaults(
  config: LLMGatewayClientConfig,
): LLMGatewayClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.llmgateway.io/v1',
  }
}
