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

/**
 * Configuration for LLM Gateway text adapter
 */
export interface LLMGatewayTextConfig extends LLMGatewayClientConfig {}

export type { ExternalTextProviderOptions as LLMGatewayTextProviderOptions } from '../text/text-provider-options'

/**
 * LLM Gateway Text (Chat) Adapter
 *
 * Tree-shakeable adapter for LLM Gateway chat/text completion. LLM Gateway
 * exposes one OpenAI-compatible Chat Completions endpoint that routes to
 * hundreds of models across many providers, so the adapter drives it with
 * the OpenAI SDK via a `baseURL` override (the same pattern as `ai-grok`
 * and `ai-groq`).
 *
 * Model ids are open-ended: curated ids get per-model type metadata, and
 * any other id from https://llmgateway.io/models works with text-only
 * defaults. A `provider/model` id (e.g. `openai/gpt-5.5`) pins routing to
 * that provider; a bare id lets the gateway pick.
 */
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

  /**
     * Surfaces reasoning deltas during streaming. LLM Gateway normalizes
     * upstream reasoning output to `delta.reasoning_content` on the OpenAI
     * Chat Completions wire format (the DeepSeek-style field most
     * OpenAI-compatible providers emit); some routed providers emit
     * `delta.reasoning` instead, so both are read.
     */
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

/**
 * Creates an LLM Gateway text adapter with explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createLLMGatewayText('gpt-5.6-terra', "llmgtwy_...");
 * ```
 */
export function createLLMGatewayText<TModel extends LLMGatewayModelId>(
  model: TModel,
  apiKey: string,
  config?: Omit<LLMGatewayTextConfig, 'apiKey'>,
): LLMGatewayTextAdapter<TModel> {
  return new LLMGatewayTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an LLM Gateway text adapter with API key from
 * `LLM_GATEWAY_API_KEY`.
 *
 * @example
 * ```typescript
 * const adapter = llmGatewayText('gpt-5.6-terra');
 * ```
 */
export function llmGatewayText<TModel extends LLMGatewayModelId>(
  model: TModel,
  config?: Omit<LLMGatewayTextConfig, 'apiKey'>,
): LLMGatewayTextAdapter<TModel> {
  const apiKey = getLLMGatewayApiKeyFromEnv()
  return createLLMGatewayText(model, apiKey, config)
}
