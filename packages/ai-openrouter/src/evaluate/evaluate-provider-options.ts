/**
 * OpenRouter evaluate model metadata and provider options.
 *
 * OpenRouter exposes TypeSafe Jev through `POST /api/alpha/decisions`.
 * That endpoint is not chat completions. Known slugs autocomplete; any other
 * Jev slug OpenRouter offers also works.
 */

/**
 * A non-exhaustive list of known OpenRouter Jev model slugs, surfaced for
 * editor autocomplete. Any other Jev model OpenRouter offers also works —
 * see {@link OpenRouterEvaluateModel}.
 */
export const OPENROUTER_EVALUATE_MODELS = [
  '~typesafe/jev-latest',
  'typesafe/jev-1.13',
  'typesafe/jev-1.13.0',
] as const

/** A Jev model slug known to OpenRouter (for autocomplete). */
export type KnownOpenRouterEvaluateModel =
  (typeof OPENROUTER_EVALUATE_MODELS)[number]

/**
 * Any OpenRouter Jev model. Known slugs autocomplete; any other Jev model
 * OpenRouter offers is also accepted.
 */
export type OpenRouterEvaluateModel =
  | KnownOpenRouterEvaluateModel
  | (string & {})

/**
 * Provider-specific options for an OpenRouter evaluate request, forwarded on
 * the `modelOptions` field of `decide()`. The Decisions API has no extra
 * fields today.
 */
export interface OpenRouterEvaluateProviderOptions {}
