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

/**
 * The minimal Anthropic client surface used by the text adapter.
 *
 * The callable is intentionally type-erased because alternative Anthropic
 * clients can depend on a different 0.x release of the Anthropic SDK. Their
 * request and response declarations may drift even when the runtime Messages
 * protocol remains compatible.
 */
export interface AnthropicMessagesClient {
  readonly beta: {
    readonly messages: {
      readonly create: AnyAnthropicMessagesCreate
    }
  }
}

/**
 * Creates an Anthropic SDK client instance
 */
export function createAnthropicClient(
  config: AnthropicClientConfig,
): Anthropic_SDK {
  return new Anthropic_SDK({
    ...config,
    apiKey: config.apiKey,
  })
}

/**
 * Gets Anthropic API key from environment variables
 * @throws Error if ANTHROPIC_API_KEY is not found
 */
export function getAnthropicApiKeyFromEnv(): string {
  return getApiKeyFromEnv('ANTHROPIC_API_KEY')
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return _generateId(prefix)
}
