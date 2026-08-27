import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getLLMGatewayApiKeyFromEnv } from '../utils/client'
import { LLMGatewayTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { LLMGatewayModelId } from '../model-meta'
import type { LLMGatewayClientConfig } from '../utils/client'

export interface LLMGatewaySummarizeConfig extends LLMGatewayClientConfig {}

/** Model type for LLM Gateway summarization */
export type LLMGatewaySummarizeModel = LLMGatewayModelId

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

export function llmGatewaySummarize<TModel extends LLMGatewaySummarizeModel>(
  model: TModel,
  config?: Omit<LLMGatewaySummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<LLMGatewayTextAdapter<TModel>>
> {
  return createLLMGatewaySummarize(model, getLLMGatewayApiKeyFromEnv(), config)
}
