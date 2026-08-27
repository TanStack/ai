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
