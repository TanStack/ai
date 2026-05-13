import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getGeminiApiKeyFromEnv } from '../utils'
import { GeminiTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { GEMINI_MODELS } from '../model-meta'
import type { GeminiClientConfig } from '../utils'

export interface GeminiSummarizeConfig extends GeminiClientConfig {}

export type GeminiSummarizeModel = (typeof GEMINI_MODELS)[number]

/**
 * Creates a Gemini summarize adapter with explicit API key and model.
 *
 * Note: keeps the historical (apiKey, model, config) argument order to
 * avoid breaking existing callers.
 *
 * @example
 * ```typescript
 * const adapter = createGeminiSummarize('AIza...', 'gemini-2.0-flash');
 * ```
 */
export function createGeminiSummarize<TModel extends GeminiSummarizeModel>(
  apiKey: string,
  model: TModel,
  config?: Omit<GeminiSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GeminiTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new GeminiTextAdapter({ ...config, apiKey }, model),
    model,
    'gemini',
  )
}

/**
 * Creates a Gemini summarize adapter with API key from `GOOGLE_API_KEY` /
 * `GEMINI_API_KEY` environment variables.
 *
 * @example
 * ```typescript
 * const adapter = geminiSummarize('gemini-2.0-flash');
 * await summarize({ adapter, text: 'Long article text...' });
 * ```
 */
export function geminiSummarize<TModel extends GeminiSummarizeModel>(
  model: TModel,
  config?: Omit<GeminiSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GeminiTextAdapter<TModel>>
> {
  return createGeminiSummarize(getGeminiApiKeyFromEnv(), model, config)
}
