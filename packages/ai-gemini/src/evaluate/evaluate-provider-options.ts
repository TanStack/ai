/**
 * Gemini evaluate model metadata and provider options.
 *
 * Gemini exposes decision models through `POST /v1beta/decisions`. That
 * endpoint is not `generateContent`: it answers typed questions about an
 * `input` and returns probabilities, not chat text.
 * @see https://aistudio.google.com/docs/decisions-api
 */

/**
 * A non-exhaustive list of known Gemini decision model ids, surfaced for
 * editor autocomplete. Any other decision model the Decisions API offers also
 * works — see {@link GeminiEvaluateModel}.
 */
export const GEMINI_EVALUATE_MODELS = ['gemini-decision-1'] as const

/** A Gemini decision model id known to the Decisions API (for autocomplete). */
export type KnownGeminiEvaluateModel = (typeof GEMINI_EVALUATE_MODELS)[number]

/**
 * Any Gemini decision model. Known ids autocomplete; any other decision model
 * the Decisions API offers is also accepted.
 */
export type GeminiEvaluateModel = KnownGeminiEvaluateModel | (string & {})

/**
 * Provider-specific options for a Gemini evaluate request, forwarded on the
 * `modelOptions` field of `decide()`. The Decisions API has no extra fields
 * today.
 */
export interface GeminiEvaluateProviderOptions {}
