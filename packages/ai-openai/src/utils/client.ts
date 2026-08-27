import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export interface OpenAIClientConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

export function getOpenAIApiKeyFromEnv(): string {
  return getApiKeyFromEnv('OPENAI_API_KEY')
}
