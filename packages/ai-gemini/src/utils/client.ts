import { GoogleGenAI } from '@google/genai'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
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
  try {
    return getApiKeyFromEnv('GOOGLE_API_KEY')
  } catch {
    try {
      return getApiKeyFromEnv('GEMINI_API_KEY')
    } catch {
      throw new Error(
        'GOOGLE_API_KEY or GEMINI_API_KEY is not set. Please set one of these environment variables or pass the API key directly.',
      )
    }
  }
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return _generateId(prefix)
}
