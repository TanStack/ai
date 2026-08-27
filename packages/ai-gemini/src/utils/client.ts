import { GoogleGenAI } from '@google/genai'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { GoogleGenAIOptions } from '@google/genai'

export type GeminiClientConfig = GoogleGenAIOptions

/**
 * Creates a Google Generative AI client instance.
 *
 * AI Studio mode needs `apiKey`. Vertex / Enterprise mode (`vertexai` or
 * `enterprise`) uses project, location, and Google Cloud credentials instead.
 */
export function createGeminiClient(config: GeminiClientConfig): GoogleGenAI {
  const vertexMode = config.vertexai === true || config.enterprise === true
  const needsApiKey =
    !vertexMode && (config.apiKey === undefined || config.apiKey.length === 0)
  if (needsApiKey) {
    throw new Error(
      'A Gemini API key is required when vertexai and enterprise are not set. Pass apiKey, or set GOOGLE_API_KEY or GEMINI_API_KEY.',
    )
  }
  return new GoogleGenAI(config)
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
