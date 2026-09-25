import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getLLMGatewayApiKeyFromEnv } from '../utils/client'
import { LLMGatewayTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { LLMGatewayModelId } from '../model-meta'
import type { LLMGatewayClientConfig } from '../utils/client'

/**
 * Configuration for LLM Gateway summarize adapter
 */
export interface LLMGatewaySummarizeConfig extends LLMGatewayClientConfig {}

/** Model type for LLM Gateway summarization */
export type LLMGatewaySummarizeModel = LLMGatewayModelId

/**
 * Creates an LLM Gateway summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model id (e.g., 'gpt-5.6-terra')
 * @param apiKey - Your LLM Gateway API key
 * @param config - Optional additional configuration
 * @returns Configured LLM Gateway summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createLLMGatewaySummarize('gpt-5.6-terra', "llmgtwy_...");
 * ```
 */
export function createLLMGatewaySummarize<
  TModel extends LLMGatewaySummarizeModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<LLMGatewaySummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<LLMGatewayTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new LLMGatewayTextAdapter({ apiKey, ...config }, model),
    model,
    'llmgateway',
  )
}

/**
 * Creates an LLM Gateway summarize adapter with automatic API key detection
 * from environment variables. Type resolution happens here at the call site.
 *
 * Looks for `LLM_GATEWAY_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model id (e.g., 'gpt-5.6-terra')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured LLM Gateway summarize adapter instance with resolved types
 * @throws Error if LLM_GATEWAY_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses LLM_GATEWAY_API_KEY from environment
 * const adapter = llmGatewaySummarize('gpt-5.6-terra');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function llmGatewaySummarize<TModel extends LLMGatewaySummarizeModel>(
  model: TModel,
  config?: Omit<LLMGatewaySummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<LLMGatewayTextAdapter<TModel>>
> {
  return createLLMGatewaySummarize(model, getLLMGatewayApiKeyFromEnv(), config)
}
