import { Ollama } from 'ollama'

export interface OllamaClientConfig {
  host?: string
  headers?: Record<string, string>
}

/**
 * Creates an Ollama client instance
 */
export function createOllamaClient(config: OllamaClientConfig = {}): Ollama {
  return new Ollama({
    host: config.host || 'http://localhost:11434',
    headers: config.headers,
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
  return env?.OLLAMA_HOST || 'http://localhost:11434'
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string = 'msg'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

/**
 * Estimates token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4)
}
