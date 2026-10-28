/**
 * Provider options for Mistral embedding models.
 *
 * `dimensions` is deliberately absent: it's a first-class top-level option on
 * `embed()` and is mapped to Mistral's `outputDimension` request field by the
 * adapter (codestral-embed only — mistral-embed has a fixed 1024-dim output).
 */

/**
 * Provider options for `mistral-embed`.
 *
 * mistral-embed accepts no provider-specific options: its output is a fixed
 * 1024-dimension float vector.
 */
export type MistralEmbedProviderOptions = Record<string, never>

/**
 * Provider options for `codestral-embed`.
 */
export interface CodestralEmbedProviderOptions {
  /**
   * The data type of the output embedding values. Mirrors the Mistral SDK's
   * `EmbeddingDtype` enum. Defaults to `float`.
   */
  outputDtype?: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary'
}

/**
 * Widest provider options shape accepted by the Mistral embedding adapter.
 * Per-model narrowing happens via `MistralEmbeddingModelProviderOptionsByName`.
 */
export type MistralEmbeddingProviderOptions = CodestralEmbedProviderOptions
