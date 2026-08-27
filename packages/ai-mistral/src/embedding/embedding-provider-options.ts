export type MistralEmbedProviderOptions = Record<string, never>

export interface CodestralEmbedProviderOptions {
  outputDtype?: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary'
}

export type MistralEmbeddingProviderOptions = CodestralEmbedProviderOptions
