/**
 * Provider options for OpenAI embedding models.
 *
 * `dimensions` is deliberately absent: it's a first-class top-level option on
 * `embed()`. `encoding_format` is pinned to `float` by the adapter so vectors
 * are always `number[]`.
 */
export interface OpenAIEmbeddingProviderOptions {
  /**
   * A unique identifier representing your end-user, which can help OpenAI
   * monitor and detect abuse.
   */
  user?: string
}
