import OpenAI from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { convertToolsToProviderFormat } from '../tools'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import { openAIModelRejectsSamplingParams } from '../model-meta'
import type {
  OPENAI_CHAT_MODELS,
  OpenAIChatModel,
  OpenAIChatModelProviderOptionsByName,
  OpenAIChatModelToolCapabilitiesByName,
  OpenAIModelInputModalitiesByName,
} from '../model-meta'
import type { ResponseCreateParams } from 'openai/resources/responses/responses'
import type { Modality, TextOptions } from '@tanstack/ai'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type { OpenAIMessageMetadataByModality } from '../message-types'
import type { OpenAIClientConfig } from '../utils/client'

export interface OpenAITextConfig extends OpenAIClientConfig {}

export type OpenAITextProviderOptions = ExternalTextProviderOptions

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OpenAIChatModelProviderOptionsByName
    ? OpenAIChatModelProviderOptionsByName[TModel]
    : OpenAITextProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenAIModelInputModalitiesByName
    ? OpenAIModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio']

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof OpenAIChatModelToolCapabilitiesByName
    ? NonNullable<OpenAIChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export class OpenAITextAdapter<
  TModel extends OpenAIChatModel,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'openai' as const

  constructor(config: OpenAITextConfig, model: TModel) {
    super(model, 'openai', new OpenAI(config))
  }

  protected override mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const modelOptions = options.modelOptions as
      | InternalTextProviderOptions
      | undefined
    if (modelOptions) {
      validateTextProviderOptions({
        ...modelOptions,
        input: this.convertMessagesToInput(options.messages),
        model: options.model,
      })
    }

    const { tools: _baseTools, ...baseRequest } = super.mapOptionsToRequest({
      ...options,
      tools: undefined,
    })

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const request: Omit<ResponseCreateParams, 'stream'> = {
      ...baseRequest,
      ...(tools && tools.length > 0 && { tools }),
    }

    if (openAIModelRejectsSamplingParams(options.model)) {
      delete request.temperature
      delete request.top_p
    }

    return request
  }
}

export function createOpenaiChat<
  TModel extends (typeof OPENAI_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITextConfig, 'apiKey'>,
): OpenAITextAdapter<TModel> {
  return new OpenAITextAdapter({ apiKey, ...config }, model)
}

export function openaiText<TModel extends (typeof OPENAI_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<OpenAITextConfig, 'apiKey'>,
): OpenAITextAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiChat(model, apiKey, config)
}
