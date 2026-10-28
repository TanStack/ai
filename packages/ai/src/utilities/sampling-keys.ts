/**
 * Single source of truth for the provider-native key spellings that cap output
 * tokens. Sampling options live in opaque, provider-native `modelOptions`, and
 * every provider spells the token cap differently. Two call sites must agree on
 * this set or they silently drift:
 *
 * - `activities/summarize/chat-stream-summarize.ts` — detects a caller-supplied
 *   token limit so the summarize default never overrides it.
 * - `middlewares/otel.ts` — picks the first numeric spelling to populate the
 *   `gen_ai.request.max_tokens` attribute across providers.
 *
 * Keep this list in lockstep with `MAX_TOKENS_KEY_BY_ADAPTER` (the adapter →
 * native-key map) in the summarize wrapper.
 */
export const MAX_TOKENS_KEYS = [
  'max_output_tokens', // OpenAI (Responses)
  'max_tokens', // Anthropic / Grok
  'max_completion_tokens', // Groq
  'maxOutputTokens', // Gemini
  'maxCompletionTokens', // OpenRouter
  'maxTokens', // generic / migration leftover (no adapter reads it)
] as const

/**
 * Ollama nests sampling under `options`; its token cap is `options.num_predict`
 * rather than a flat key.
 */
export const NESTED_MAX_TOKENS_KEY = 'num_predict' as const
