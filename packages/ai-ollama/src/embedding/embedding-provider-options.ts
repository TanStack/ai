import type { Options } from 'ollama'

export interface OllamaEmbeddingProviderOptions {
  truncate?: boolean
  keepAlive?: string | number
  options?: Partial<Options>
}
