import type { ProviderPreferences } from '@openrouter/sdk/models'

/**
 * A non-exhaustive list of known OpenRouter rerank model slugs, surfaced for
 * editor autocomplete. Any other rerank model OpenRouter offers also works —
 * see {@link OpenRouterRerankModel}.
 */
export const OPENROUTER_RERANK_MODELS = [
  'cohere/rerank-v3.5',
  'cohere/rerank-4-fast',
  'cohere/rerank-4-pro',
  'nvidia/llama-nemotron-rerank-vl-1b-v2',
] as const

/** A rerank model slug known to OpenRouter (for autocomplete). */
export type KnownOpenRouterRerankModel =
  (typeof OPENROUTER_RERANK_MODELS)[number]

/**
 * Any OpenRouter rerank model. Known slugs autocomplete; any other rerank
 * model OpenRouter offers is also accepted.
 */
export type OpenRouterRerankModel = KnownOpenRouterRerankModel | (string & {})

/**
 * Provider-specific options for an OpenRouter rerank request, forwarded on the
 * `modelOptions` field of `rerank()`.
 */
export interface OpenRouterRerankProviderOptions {
  /**
   * OpenRouter provider routing preferences — pin, order, or allow fallback
   * across the providers that serve the chosen rerank model.
   */
  provider?: ProviderPreferences
}
