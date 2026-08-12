import type { VercelGatewayEmbeddingProviderOptions } from './embedding/embedding-provider-options'
import type { VercelGatewayImageProviderOptions } from './image/image-provider-options'
import type { VercelGatewayTextProviderOptions } from './text/text-provider-options'

/**
 * Seed catalog of Vercel AI Gateway chat model identifiers.
 * Task 10 overwrites this file from GET /v1/models.
 */
export const VERCEL_GATEWAY_CHAT_MODELS = [
  'anthropic/claude-opus-5',
  'openai/gpt-5.5',
] as const

export type VercelGatewayChatModel = (typeof VERCEL_GATEWAY_CHAT_MODELS)[number]

export const VERCEL_GATEWAY_EMBEDDING_MODELS = [
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
] as const

export type VercelGatewayEmbeddingModel =
  (typeof VERCEL_GATEWAY_EMBEDDING_MODELS)[number]

export const VERCEL_GATEWAY_IMAGE_MODELS = ['openai/gpt-image-1'] as const

export type VercelGatewayImageModel =
  (typeof VERCEL_GATEWAY_IMAGE_MODELS)[number]

export type VercelGatewayChatModelProviderOptionsByName = {
  [K in VercelGatewayChatModel]: VercelGatewayTextProviderOptions
}

export type VercelGatewayModelInputModalitiesByName = {
  [K in VercelGatewayChatModel]: readonly ['text', 'image']
}

export type VercelGatewayChatModelToolCapabilitiesByName = {
  [K in VercelGatewayChatModel]: readonly []
}

export type VercelGatewayEmbeddingModelProviderOptionsByName = {
  [K in VercelGatewayEmbeddingModel]: VercelGatewayEmbeddingProviderOptions
}

export type VercelGatewayEmbeddingModelInputModalitiesByName = {
  [K in VercelGatewayEmbeddingModel]: readonly ['text']
}

export type VercelGatewayImageModelProviderOptionsByName = {
  [K in VercelGatewayImageModel]: VercelGatewayImageProviderOptions
}

export type VercelGatewayImageModelSizeByName = {
  [K in VercelGatewayImageModel]:
    | '1024x1024'
    | '1536x1024'
    | '1024x1536'
    | 'auto'
}

export type VercelGatewayImageModelInputModalitiesByName = {
  [K in VercelGatewayImageModel]: readonly []
}

export type ResolveProviderOptions<TModel extends string> =
  TModel extends VercelGatewayChatModel
    ? VercelGatewayTextProviderOptions
    : TModel extends VercelGatewayEmbeddingModel
      ? VercelGatewayEmbeddingProviderOptions
      : TModel extends VercelGatewayImageModel
        ? VercelGatewayImageProviderOptions
        : VercelGatewayTextProviderOptions

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof VercelGatewayModelInputModalitiesByName
    ? VercelGatewayModelInputModalitiesByName[TModel]
    : readonly ['text']
