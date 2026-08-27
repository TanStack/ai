import Anthropic_SDK from '@anthropic-ai/sdk'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from '@anthropic-ai/sdk'

export interface AnthropicClientConfig extends ClientOptions {
  apiKey: string
}

type AnyAnthropicMessagesCreate = (
  params: never,
  ...args: Array<never>
) => unknown

export interface AnthropicMessagesClient {
  readonly beta: {
    readonly messages: {
      readonly create: AnyAnthropicMessagesCreate
    }
  }
}

export function createAnthropicClient(
  config: AnthropicClientConfig,
): Anthropic_SDK {
  return new Anthropic_SDK({
    ...config,
    apiKey: config.apiKey,
  })
}

export function getAnthropicApiKeyFromEnv(): string {
  return getApiKeyFromEnv('ANTHROPIC_API_KEY')
}

export function generateId(prefix: string): string {
  return _generateId(prefix)
}
