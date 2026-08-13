import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import { OpenAITextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { OpenAIChatModel } from '../model-meta'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI summarize adapter
 */
export interface OpenAISummarizeConfig extends OpenAIClientConfig {}

/**
 * Creates an OpenAI summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'gpt-4o-mini', 'gpt-4o')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiSummarize('gpt-4o-mini', "sk-...");
 * ```
 */
export function createOpenaiSummarize<TModel extends OpenAIChatModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAISummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OpenAITextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new OpenAITextAdapter({ apiKey, ...config }, model),
    model,
    'openai',
  )
}

/**
 * Creates an OpenAI summarize adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'gpt-4o-mini', 'gpt-4o')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI summarize adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiSummarize('gpt-4o-mini');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function openaiSummarize<TModel extends OpenAIChatModel>(
  model: TModel,
  config?: Omit<OpenAISummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OpenAITextAdapter<TModel>>
> {
  return createOpenaiSummarize(model, getOpenAIApiKeyFromEnv(), config)
}
