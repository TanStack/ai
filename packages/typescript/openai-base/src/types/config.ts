import type { ClientOptions } from 'openai'

export interface OpenAICompatibleClientConfig extends ClientOptions {
  apiKey: string
}
