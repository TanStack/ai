import { GoogleGenAI } from '@google/genai'
import type { GoogleGenAIOptions } from '@google/genai'

export interface GeminiClientConfig extends GoogleGenAIOptions {
  apiKey: string
}

/**
 * Creates a Google Generative AI client instance
 */
export function createGeminiClient(config: GeminiClientConfig): GoogleGenAI {
  return new GoogleGenAI({
    ...config,
    apiKey: config.apiKey,
  })
}

/**
 * Gets Google API key from environment variables
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found
 */
export function getGeminiApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.GOOGLE_API_KEY || env?.GEMINI_API_KEY

  if (!key) {
    throw new Error(
      'GOOGLE_API_KEY or GEMINI_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
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
