import { OpenAICompatibleSummarizeAdapter } from '@tanstack/openai-compatible'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import { OpenAITextAdapter } from './text'
import type { OpenAIChatModel } from '../model-meta'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI summarize adapter
 */
export interface OpenAISummarizeConfig extends OpenAIClientConfig {}

/**
 * OpenAI-specific provider options for summarization
 */
export interface OpenAISummarizeProviderOptions {
  /** Temperature for response generation (0-2) */
  temperature?: number
  /** Maximum tokens in the response */
  maxTokens?: number
}

/**
 * OpenAI Summarize Adapter
 *
 * A thin wrapper around the text adapter that adds summarization-specific prompting.
 * Delegates all API calls to the OpenAITextAdapter.
 */
export class OpenAISummarizeAdapter<
  TModel extends OpenAIChatModel,
> extends OpenAICompatibleSummarizeAdapter<
  TModel,
  OpenAISummarizeProviderOptions
> {
  readonly kind = 'summarize' as const
  readonly name = 'openai' as const

  constructor(config: OpenAISummarizeConfig, model: TModel) {
    super(new OpenAITextAdapter(config, model), model, 'openai')
  }
}

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
): OpenAISummarizeAdapter<TModel> {
  return new OpenAISummarizeAdapter({ apiKey, ...config }, model)
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
): OpenAISummarizeAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiSummarize(model, apiKey, config)
}
