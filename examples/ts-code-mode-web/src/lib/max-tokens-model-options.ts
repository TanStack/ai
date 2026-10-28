import type { AnyTextAdapter } from '@tanstack/ai'

/**
 * Sampling options moved off the root of `chat()` into provider-native
 * `modelOptions` (the generic root `maxTokens` was removed). These examples
 * resolve the adapter dynamically, so the provider-native token-cap key isn't
 * known until runtime — map a generic token cap to the right wire key from the
 * adapter's `name`. Ollama nests sampling under `options`.
 *
 * Spread the result into the `modelOptions` of a `chat()` / `generate()` call:
 *
 * ```ts
 * chat({ adapter, messages, modelOptions: { ...maxTokensModelOptions(adapter, maxTokens) } })
 * ```
 */
export function maxTokensModelOptions(
  adapter: AnyTextAdapter,
  maxTokens: number | undefined,
): Record<string, unknown> {
  if (maxTokens === undefined) return {}
  switch (adapter.name) {
    case 'ollama':
      return { options: { num_predict: maxTokens } }
    case 'openai':
      return { max_output_tokens: maxTokens }
    case 'anthropic':
    case 'grok':
      return { max_tokens: maxTokens }
    case 'gemini':
      return { maxOutputTokens: maxTokens }
    case 'groq':
      return { max_completion_tokens: maxTokens }
    case 'openrouter':
      return { maxCompletionTokens: maxTokens }
    case 'openrouter-responses':
      return { maxOutputTokens: maxTokens }
    // Note: the OpenAI Chat Completions adapter ('openai-chat') is intentionally
    // omitted — its token key depends on the model (`max_tokens` vs
    // `max_completion_tokens` for reasoning models), so it can't be resolved
    // from the adapter name alone. These examples only resolve Responses-API
    // OpenAI adapters. Unknown names drop the cap rather than risk a wrong key.
    default:
      return {}
  }
}
