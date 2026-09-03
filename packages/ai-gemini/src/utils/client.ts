import { GoogleGenAI } from '@google/genai'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { GoogleGenAIOptions } from '@google/genai'

export interface GeminiClientConfig extends GoogleGenAIOptions {
  /**
   * Base URL for every request. Maps onto `httpOptions.baseUrl` and wins
   * over it when both are set. Same option name as the other adapters, so a
   * gateway config can be spread into any of them.
   */
  baseURL?: string
  /**
   * Headers sent with every request. Merged on top of `httpOptions.headers`.
   * Same option name as the other adapters.
   */
  defaultHeaders?: Record<string, string>
}

/**
 * Creates a Google Generative AI client instance.
 *
 * AI Studio mode needs `apiKey`. Vertex / Enterprise mode (`vertexai` or
 * `enterprise`) uses project, location, and Google Cloud credentials instead.
 */
export function createGeminiClient(config: GeminiClientConfig): GoogleGenAI {
  const vertexMode = config.vertexai === true || config.enterprise === true
  if (
    !vertexMode &&
    (config.apiKey === undefined || config.apiKey.length === 0)
  ) {
    throw new Error(
      'A Gemini API key is required when vertexai and enterprise are not set. Pass apiKey, or set GOOGLE_API_KEY or GEMINI_API_KEY.',
    )
  }
  const { baseURL, defaultHeaders, ...options } = config
  if (baseURL !== undefined || defaultHeaders !== undefined) {
    options.httpOptions = {
      ...options.httpOptions,
      ...(baseURL !== undefined ? { baseUrl: baseURL } : {}),
      ...(defaultHeaders !== undefined
        ? { headers: { ...options.httpOptions?.headers, ...defaultHeaders } }
        : {}),
    }
  }
  return new GoogleGenAI(options)
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
