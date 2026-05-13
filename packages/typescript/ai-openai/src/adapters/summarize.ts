import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import { OpenAITextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { OpenAIChatModel } from '../model-meta'
import type { OpenAIClientConfig } from '../utils/client'

export interface OpenAISummarizeConfig extends OpenAIClientConfig {}

/**
 * Creates an OpenAI summarize adapter with explicit API key.
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
 * Creates an OpenAI summarize adapter with API key from `OPENAI_API_KEY`.
 *
 * @example
 * ```typescript
 * const adapter = openaiSummarize('gpt-4o-mini');
 * await summarize({ adapter, text: "Long article text..." });
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
