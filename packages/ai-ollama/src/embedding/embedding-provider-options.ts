import type { Options } from 'ollama'

/**
 * Provider options for Ollama embedding models.
 *
 * `dimensions` is deliberately absent: Ollama does not support requesting
 * embedding dimensions, so the adapter rejects the top-level `dimensions`
 * option at runtime.
 */
export interface OllamaEmbeddingProviderOptions {
  /**
   * Truncates the end of each input to fit within the model's context length.
   * When `false`, the request errors if an input exceeds the context length.
   * Sent as `truncate` on the wire.
   */
  truncate?: boolean
  /**
   * How long to keep the model loaded in memory after the request
   * (e.g. `'5m'`, or a number of seconds). Sent as snake_case `keep_alive`
   * on the wire, matching the Ollama SDK's `EmbedRequest`.
   */
  keepAlive?: string | number
  /**
   * Ollama runner/sampling options (num_gpu, num_thread, use_mmap, ...)
   * forwarded as `EmbedRequest.options`.
   */
  options?: Partial<Options>
}
