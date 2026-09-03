import { Ollama } from 'ollama'
import { generateId as _generateId } from '@tanstack/ai-utils'

export interface OllamaClientConfig {
  /**
   * Base URL for every request. Same option name as the other adapters, so a
   * gateway config can be spread into any of them. Wins over `host` when both
   * are set.
   */
  baseURL?: string
  /** Alias of `baseURL`. */
  host?: string
  /**
   * Headers sent with every request. Merged on top of `headers`. Same option
   * name as the other adapters.
   */
  defaultHeaders?: Record<string, string>
  /** Alias of `defaultHeaders`. */
  headers?: Record<string, string> | undefined
}

/**
 * Creates an Ollama client instance
 */
export function createOllamaClient(config: OllamaClientConfig = {}): Ollama {
  return new Ollama({
    host: config.baseURL || config.host || 'http://localhost:11434',
    headers:
      config.headers || config.defaultHeaders
        ? { ...config.headers, ...config.defaultHeaders }
        : undefined,
  })
}

/**
 * Gets Ollama host from environment variables
 * Falls back to default localhost
 */
export function getOllamaHostFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' &&
    (globalThis as Record<string, unknown>).window
      ? ((
          (globalThis as Record<string, unknown>).window as Record<
            string,
            unknown
          >
        ).env as Record<string, string> | undefined)
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  return env?.['OLLAMA_HOST'] || 'http://localhost:11434'
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string = 'msg'): string {
  return _generateId(prefix)
}

/**
 * Estimates token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4)
}
