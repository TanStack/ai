import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface GrokClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

export function getGrokApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('XAI_API_KEY')
  } catch {
    throw new Error(
      'XAI_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

export function withGrokDefaults(config: GrokClientConfig): GrokClientConfig {
  return {
    ...config,
    baseURL: config.baseURL || 'https://api.x.ai/v1',
  }
}
