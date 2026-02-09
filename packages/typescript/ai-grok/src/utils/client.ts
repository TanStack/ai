import OpenAI_SDK from 'openai'
import type { ClientOptions } from 'openai'

export interface GrokClientConfig extends ClientOptions {
  apiKey: string
}

/**
 * Creates a Grok SDK client instance using OpenAI SDK with xAI's base URL
 */
export function createGrokClient(config: GrokClientConfig): OpenAI_SDK {
  return new OpenAI_SDK({
    ...config,
    apiKey: config.apiKey,
    baseURL: config.baseURL || 'https://api.x.ai/v1',
  })
}

/**
 * Gets Grok API key from environment variables
 * @throws Error if XAI_API_KEY is not found
 */
export function getGrokApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.XAI_API_KEY

  if (!key) {
    throw new Error(
      'XAI_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
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
