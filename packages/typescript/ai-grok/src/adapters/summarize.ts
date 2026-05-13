import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getGrokApiKeyFromEnv } from '../utils'
import { GrokTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { GROK_CHAT_MODELS } from '../model-meta'
import type { GrokClientConfig } from '../utils'

export interface GrokSummarizeConfig extends GrokClientConfig {}

export type GrokSummarizeModel = (typeof GROK_CHAT_MODELS)[number]

/**
 * Creates a Grok summarize adapter with explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createGrokSummarize('grok-3', "xai-...");
 * ```
 */
export function createGrokSummarize<TModel extends GrokSummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GrokTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new GrokTextAdapter({ apiKey, ...config }, model),
    model,
    'grok',
  )
}

/**
 * Creates a Grok summarize adapter with API key from `XAI_API_KEY`.
 *
 * @example
 * ```typescript
 * const adapter = grokSummarize('grok-3');
 * await summarize({ adapter, text: "Long article text..." });
 * ```
 */
export function grokSummarize<TModel extends GrokSummarizeModel>(
  model: TModel,
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GrokTextAdapter<TModel>>
> {
  return createGrokSummarize(model, getGrokApiKeyFromEnv(), config)
}
