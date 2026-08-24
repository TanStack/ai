/**
 * Provider options for Lovable embedding models.
 *
 * `dimensions` is a top-level option on `embed()`. `encoding_format` is
 * pinned to `float` so vectors are always `number[]`.
 */
export interface LovableEmbeddingProviderOptions {
  user?: string
}
