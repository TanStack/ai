import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface LLMGatewayClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

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

export function withLLMGatewayDefaults(
  config: LLMGatewayClientConfig,
): LLMGatewayClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.llmgateway.io/v1',
  }
}
