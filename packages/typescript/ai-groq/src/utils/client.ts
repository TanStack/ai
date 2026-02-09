import Groq_SDK from 'groq-sdk'
import type { ClientOptions } from 'groq-sdk'

export interface GroqClientConfig extends ClientOptions {
  apiKey: string
}

/**
 * Creates a Groq SDK client instance
 */
export function createGroqClient(config: GroqClientConfig): Groq_SDK {
  return new Groq_SDK(config)
}

/**
 * Gets Groq API key from environment variables
 * @throws Error if GROQ_API_KEY is not found
 */
export function getGroqApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.GROQ_API_KEY

  if (!key) {
    throw new Error(
      'GROQ_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
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
