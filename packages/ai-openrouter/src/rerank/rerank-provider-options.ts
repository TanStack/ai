import type { ProviderPreferences } from '@openrouter/sdk/models'

export const OPENROUTER_RERANK_MODELS = [
  'cohere/rerank-v3.5',
  'cohere/rerank-4-fast',
  'cohere/rerank-4-pro',
  'nvidia/llama-nemotron-rerank-vl-1b-v2',
] as const

/** A rerank model slug known to OpenRouter (for autocomplete). */
export type KnownOpenRouterRerankModel =
  (typeof OPENROUTER_RERANK_MODELS)[number]

export type OpenRouterRerankModel = KnownOpenRouterRerankModel | (string & {})

export interface OpenRouterRerankProviderOptions {
  provider?: ProviderPreferences
}
