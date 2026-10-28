import type { ProviderPreferences } from '@openrouter/sdk/models'

/**
 * OpenRouter rerank model metadata and provider options.
 *
 * OpenRouter exposes rerank models through its unified `/v1/rerank` endpoint.
 * The endpoint is model-agnostic — any rerank model OpenRouter offers works by
 * passing its slug as the model, so the model type is open (a known-model
 * union for autocomplete, widened with `string`).
 */

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
