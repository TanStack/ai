import { Ollama } from 'ollama'
import { generateId as _generateId } from '@tanstack/ai-utils'

export interface OllamaClientConfig {
  host?: string
  headers?: Record<string, string> | undefined
}

export function createOllamaClient(config: OllamaClientConfig = {}): Ollama {
  return new Ollama({
    host: config.host || 'http://localhost:11434',
    headers: config.headers,
  })
}

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

export function generateId(prefix: string = 'msg'): string {
  return _generateId(prefix)
}

export function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4)
}
