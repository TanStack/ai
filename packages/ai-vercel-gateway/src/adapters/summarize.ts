import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getVercelGatewayApiKeyFromEnv } from '../utils/client'
import { VercelGatewayTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { VERCEL_GATEWAY_CHAT_MODELS } from '../model-meta'
import type { VercelGatewayClientConfig } from '../utils/client'

export interface VercelGatewaySummarizeConfig
  extends VercelGatewayClientConfig {}

export type VercelGatewaySummarizeModel =
  (typeof VERCEL_GATEWAY_CHAT_MODELS)[number]

export function createVercelGatewaySummarize<
  TModel extends VercelGatewaySummarizeModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<VercelGatewaySummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<VercelGatewayTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new VercelGatewayTextAdapter({ apiKey, ...config }, model),
    model,
    'vercel-gateway',
  )
}

export function vercelGatewaySummarize<
  TModel extends VercelGatewaySummarizeModel,
>(
  model: TModel,
  config?: Omit<VercelGatewaySummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<VercelGatewayTextAdapter<TModel>>
> {
  return createVercelGatewaySummarize(
    model,
    getVercelGatewayApiKeyFromEnv(),
    config,
  )
}
