import OpenAI from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import {
  getVercelGatewayApiKeyFromEnv,
  withVercelGatewayDefaults,
} from '../utils/client'
import { mapGatewayModelOptions } from '../utils/map-gateway-options'
import type { Modality, TextOptions } from '@tanstack/ai'
import type { ResponseCreateParams } from 'openai/resources/responses/responses'
import type {
  VERCEL_GATEWAY_CHAT_MODELS,
  VercelGatewayChatModelToolCapabilitiesByName,
  ResolveInputModalities,
} from '../model-meta'
import type { VercelGatewayMessageMetadataByModality } from '../message-types'
import type { ExternalResponsesProviderOptions } from '../text/responses-provider-options'
import type { VercelGatewayClientConfig } from '../utils/client'

export interface VercelGatewayResponsesTextConfig
  extends VercelGatewayClientConfig {}

export type VercelGatewayResponsesTextProviderOptions =
  ExternalResponsesProviderOptions

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof VercelGatewayChatModelToolCapabilitiesByName
    ? NonNullable<VercelGatewayChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Vercel AI Gateway Responses text adapter.
 *
 * Talks to the public OpenAI-compatible Responses API at
 * `https://ai-gateway.vercel.sh/v1`.
 */
export class VercelGatewayResponsesTextAdapter<
  TModel extends (typeof VERCEL_GATEWAY_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> =
    VercelGatewayResponsesTextProviderOptions,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  VercelGatewayMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'vercel-gateway' as const

  constructor(config: VercelGatewayResponsesTextConfig, model: TModel) {
    super(
      model,
      'vercel-gateway',
      new OpenAI(withVercelGatewayDefaults(config)),
    )
  }

  protected override mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const request = super.mapOptionsToRequest({
      ...options,
      modelOptions: mapGatewayModelOptions(
        options.modelOptions as Record<string, unknown> | undefined,
      ) as TProviderOptions,
    })
    const { gateway: _gateway, ...rest } = request as typeof request & {
      gateway?: unknown
    }
    void _gateway
    return rest
  }
}

export function createVercelGatewayResponsesText<
  TModel extends (typeof VERCEL_GATEWAY_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<VercelGatewayResponsesTextConfig, 'apiKey'>,
): VercelGatewayResponsesTextAdapter<TModel> {
  return new VercelGatewayResponsesTextAdapter({ apiKey, ...config }, model)
}

export function vercelGatewayResponsesText<
  TModel extends (typeof VERCEL_GATEWAY_CHAT_MODELS)[number],
>(
  model: TModel,
  config?: Omit<VercelGatewayResponsesTextConfig, 'apiKey'>,
): VercelGatewayResponsesTextAdapter<TModel> {
  return createVercelGatewayResponsesText(
    model,
    getVercelGatewayApiKeyFromEnv(),
    config,
  )
}
