import OpenAI from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import { getGrokApiKeyFromEnv, withGrokDefaults } from '../utils/client'
import { convertToolsToProviderFormat } from '../tools'
import type {
  GROK_CHAT_MODELS,
  GrokChatModelToolCapabilitiesByName,
  GrokTextAdapterModel,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { Modality, TextOptions } from '@tanstack/ai'
import type { GrokMessageMetadataByModality } from '../message-types'
import type { GrokClientConfig } from '../utils/client'
import type { ResponseCreateParams } from 'openai/resources/responses/responses'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GrokChatModelToolCapabilitiesByName
    ? NonNullable<GrokChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export interface GrokTextConfig extends GrokClientConfig {}

export type { ExternalTextProviderOptions as GrokTextProviderOptions } from '../text/text-provider-options'

export class GrokTextAdapter<
  TModel extends GrokTextAdapterModel,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GrokMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'grok' as const

  constructor(config: GrokTextConfig, model: TModel) {
    super(model, 'grok', new OpenAI(withGrokDefaults(config)))
  }

  protected override mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const { tools: _baseTools, ...request } = super.mapOptionsToRequest({
      ...options,
      tools: undefined,
    })
    void _baseTools

    const rejectsReasoningOnBuild =
      this.model === 'grok-build-0.1' && request.reasoning !== undefined
    if (rejectsReasoningOnBuild) {
      throw new Error(
        'grok-build-0.1 does not support reasoning modelOptions; omit reasoning for this model.',
      )
    }

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    return {
      ...request,
      // xAI recommends encrypted reasoning for reasoning-capable Responses
      // requests; callers can still override either field in modelOptions.
      store: request.store ?? false,
      include: request.include ?? ['reasoning.encrypted_content'],
      ...(tools &&
        tools.length > 0 && { tools: tools as ResponseCreateParams['tools'] }),
    }
  }
}

export function createGrokText<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokTextConfig, 'apiKey'>,
): GrokTextAdapter<TModel> {
  return new GrokTextAdapter({ apiKey, ...config }, model)
}

export function grokText<TModel extends (typeof GROK_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<GrokTextConfig, 'apiKey'>,
): GrokTextAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokText(model, apiKey, config)
}
