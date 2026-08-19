/**
 * @module @tanstack/ai-vercel-gateway
 *
 * Vercel AI Gateway adapter for TanStack AI.
 */

export { vercelGatewayByok } from './byok'

export {
  VercelGatewayTextAdapter,
  type VercelGatewayTextConfig,
  type VercelGatewayTextProviderOptions,
} from './adapters/text'

export {
  createVercelGatewayText,
  vercelGatewayText,
  type VercelGatewayTextApi,
  type VercelGatewayResponsesApiConfig,
  type VercelGatewayChatApiConfig,
} from './adapters/factory'

export {
  VercelGatewayResponsesTextAdapter,
  createVercelGatewayResponsesText,
  vercelGatewayResponsesText,
  type VercelGatewayResponsesTextConfig,
  type VercelGatewayResponsesTextProviderOptions,
} from './adapters/responses-text'

export {
  createVercelGatewaySummarize,
  vercelGatewaySummarize,
  type VercelGatewaySummarizeConfig,
  type VercelGatewaySummarizeModel,
} from './adapters/summarize'

export {
  VercelGatewayEmbeddingAdapter,
  createVercelGatewayEmbedding,
  vercelGatewayEmbedding,
  type VercelGatewayEmbeddingConfig,
} from './adapters/embedding'

export {
  VercelGatewayImageAdapter,
  createVercelGatewayImage,
  vercelGatewayImage,
  type VercelGatewayImageConfig,
} from './adapters/image'

export type { VercelGatewayEmbeddingProviderOptions } from './embedding/embedding-provider-options'
export type { VercelGatewayImageProviderOptions } from './image/image-provider-options'
export type {
  VercelGatewayBaseOptions,
  VercelGatewayCommonOptions,
  VercelGatewayRoutingOptions,
} from './text/text-provider-options'

export {
  VERCEL_GATEWAY_CHAT_MODELS,
  VERCEL_GATEWAY_EMBEDDING_MODELS,
  VERCEL_GATEWAY_IMAGE_MODELS,
  VERCEL_GATEWAY_MODEL_TAGS,
  VERCEL_GATEWAY_PROVIDERS,
} from './model-meta'
export type {
  VercelGatewayChatModel,
  VercelGatewayChatModelProviderOptionsByName,
  VercelGatewayEmbeddingModel,
  VercelGatewayImageModel,
  VercelGatewayModelInputModalitiesByName,
  VercelGatewayModelTag,
  VercelGatewayProvider,
} from './model-meta'

export {
  getVercelGatewayApiKeyFromEnv,
  type VercelGatewayClientConfig,
} from './utils/client'
