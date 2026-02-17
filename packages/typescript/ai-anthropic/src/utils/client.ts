import Anthropic_SDK from '@anthropic-ai/sdk'
import type { ClientOptions } from '@anthropic-ai/sdk'

export interface AnthropicClientConfig extends ClientOptions {
  apiKey: string
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
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.ANTHROPIC_API_KEY

  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }

  return key
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
