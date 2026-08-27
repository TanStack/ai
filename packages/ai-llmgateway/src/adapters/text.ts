import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import {
  getLLMGatewayApiKeyFromEnv,
  withLLMGatewayDefaults,
} from '../utils/client'
import type { Modality } from '@tanstack/ai'
import type {
  LLMGatewayChatModelToolCapabilitiesByName,
  LLMGatewayModelId,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { LLMGatewayMessageMetadataByModality } from '../message-types'
import type { LLMGatewayClientConfig } from '../utils/client'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof LLMGatewayChatModelToolCapabilitiesByName
    ? NonNullable<LLMGatewayChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export interface LLMGatewayTextConfig extends LLMGatewayClientConfig {}

export type { ExternalTextProviderOptions as LLMGatewayTextProviderOptions } from '../text/text-provider-options'

export class LLMGatewayTextAdapter<
  TModel extends LLMGatewayModelId,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  LLMGatewayMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'llmgateway' as const

  constructor(config: LLMGatewayTextConfig, model: TModel) {
    super(model, 'llmgateway', new OpenAI(withLLMGatewayDefaults(config)))
  }

  protected override extractReasoning(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  ): { text: string } | undefined {
    const delta = chunk.choices[0]?.delta as
      | { reasoning?: unknown; reasoning_content?: unknown }
      | undefined
    const raw = delta?.reasoning_content ?? delta?.reasoning
    if (typeof raw === 'string' && raw.length > 0) {
      return { text: raw }
    }
    return undefined
  }
}

export function createLLMGatewayText<TModel extends LLMGatewayModelId>(
  model: TModel,
  apiKey: string,
  config?: Omit<LLMGatewayTextConfig, 'apiKey'>,
): LLMGatewayTextAdapter<TModel> {
  return new LLMGatewayTextAdapter({ apiKey, ...config }, model)
}

export function llmGatewayText<TModel extends LLMGatewayModelId>(
  model: TModel,
  config?: Omit<LLMGatewayTextConfig, 'apiKey'>,
): LLMGatewayTextAdapter<TModel> {
  const apiKey = getLLMGatewayApiKeyFromEnv()
  return createLLMGatewayText(model, apiKey, config)
}
