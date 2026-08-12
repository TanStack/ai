import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import {
  getVercelGatewayApiKeyFromEnv,
  withVercelGatewayDefaults,
} from '../utils/client'
import { mapGatewayModelOptions } from '../utils/map-gateway-options'
import type { Modality, TextOptions } from '@tanstack/ai'
import type {
  VERCEL_GATEWAY_CHAT_MODELS,
  VercelGatewayChatModelToolCapabilitiesByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { VercelGatewayMessageMetadataByModality } from '../message-types'
import type { VercelGatewayClientConfig } from '../utils/client'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof VercelGatewayChatModelToolCapabilitiesByName
    ? NonNullable<VercelGatewayChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export interface VercelGatewayTextConfig extends VercelGatewayClientConfig {}

export type { ExternalTextProviderOptions as VercelGatewayTextProviderOptions } from '../text/text-provider-options'

/**
 * Vercel AI Gateway text adapter.
 *
 * Talks to the public OpenAI-compatible Chat Completions API at
 * `https://ai-gateway.vercel.sh/v1`.
 */
export class VercelGatewayTextAdapter<
  TModel extends (typeof VERCEL_GATEWAY_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  VercelGatewayMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'vercel-gateway' as const

  constructor(config: VercelGatewayTextConfig, model: TModel) {
    super(
      model,
      'vercel-gateway',
      new OpenAI(withVercelGatewayDefaults(config)),
    )
  }

  protected override mapOptionsToRequest(options: TextOptions) {
    const request = super.mapOptionsToRequest({
      ...options,
      modelOptions: mapGatewayModelOptions(
        options.modelOptions as Record<string, unknown> | undefined,
      ) as TextOptions['modelOptions'],
    })
    const { gateway: _gateway, ...rest } = request as typeof request & {
      gateway?: unknown
    }
    void _gateway
    return rest
  }
}

export function createVercelGatewayText<
  TModel extends (typeof VERCEL_GATEWAY_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<VercelGatewayTextConfig, 'apiKey'>,
): VercelGatewayTextAdapter<TModel> {
  return new VercelGatewayTextAdapter({ apiKey, ...config }, model)
}

export function vercelGatewayText<
  TModel extends (typeof VERCEL_GATEWAY_CHAT_MODELS)[number],
>(
  model: TModel,
  config?: Omit<VercelGatewayTextConfig, 'apiKey'>,
): VercelGatewayTextAdapter<TModel> {
  return createVercelGatewayText(
    model,
    getVercelGatewayApiKeyFromEnv(),
    config,
  )
}
