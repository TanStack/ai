import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getGroqApiKeyFromEnv } from '../utils'
import { GroqTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { GROQ_CHAT_MODELS } from '../model-meta'
import type { GroqClientConfig } from '../utils'

/**
 * Configuration for Groq summarize adapter
 */
export interface GroqSummarizeConfig extends GroqClientConfig {}

/** Model type for Groq summarization */
export type GroqSummarizeModel = (typeof GROQ_CHAT_MODELS)[number]

/**
 * Creates a Groq summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'llama-3.3-70b-versatile')
 * @param apiKey - Your Groq API key
 * @param config - Optional additional configuration
 * @returns Configured Groq summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGroqSummarize('llama-3.3-70b-versatile', "gsk_...");
 * ```
 */
export function createGroqSummarize<TModel extends GroqSummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GroqTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new GroqTextAdapter({ apiKey, ...config }, model),
    model,
    'groq',
  )
}

/**
 * Creates a Groq summarize adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `GROQ_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'llama-3.3-70b-versatile')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Groq summarize adapter instance with resolved types
 * @throws Error if GROQ_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GROQ_API_KEY from environment
 * const adapter = groqSummarize('llama-3.3-70b-versatile');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function groqSummarize<TModel extends GroqSummarizeModel>(
  model: TModel,
  config?: Omit<GroqSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GroqTextAdapter<TModel>>
> {
  return createGroqSummarize(model, getGroqApiKeyFromEnv(), config)
}
