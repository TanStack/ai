import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
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
  return getApiKeyFromEnv('GROQ_API_KEY')
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return _generateId(prefix)
}
