import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import {
  getOrcaRouterApiKeyFromEnv,
  withOrcaRouterDefaults,
} from '../utils/client'
import type { Modality } from '@tanstack/ai'
import type {
  OrcaRouterChatModelToolCapabilitiesByName,
  OrcaRouterModelId,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { OrcaRouterMessageMetadataByModality } from '../message-types'
import type { OrcaRouterClientConfig } from '../utils/client'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof OrcaRouterChatModelToolCapabilitiesByName
    ? NonNullable<OrcaRouterChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Configuration for the OrcaRouter text adapter
 */
export interface OrcaRouterTextConfig extends OrcaRouterClientConfig {}

/**
 * Re-export of the public provider options type
 */
export type { ExternalTextProviderOptions as OrcaRouterTextProviderOptions } from '../text/text-provider-options'

/**
 * OrcaRouter Text (Chat) Adapter
 *
 * Tree-shakeable adapter for OrcaRouter chat/text completion. OrcaRouter
 * exposes one OpenAI-compatible Chat Completions endpoint that routes to
 * many models across providers — with adaptive routing, automatic
 * failover, observability, guardrails, and agent-tool governance applied
 * gateway-side — so the adapter drives it with the OpenAI SDK via a
 * `baseURL` override (the same pattern as `ai-groq`, `ai-grok`, and
 * `ai-llmgateway`).
 *
 * Model ids are open-ended: curated ids get per-model type metadata, and
 * any other id from https://www.orcarouter.ai works with text-only
 * defaults. A `provider/model` id (e.g. `openai/gpt-5.5`) pins routing to
 * that provider; a bare id lets the gateway route adaptively.
 */
export class OrcaRouterTextAdapter<
  TModel extends OrcaRouterModelId,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OrcaRouterMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'orcarouter' as const

  constructor(config: OrcaRouterTextConfig, model: TModel) {
    super(model, 'orcarouter', new OpenAI(withOrcaRouterDefaults(config)))
  }

  /**
   * Surfaces reasoning deltas during streaming. OrcaRouter normalizes
   * upstream reasoning output to `delta.reasoning_content` on the OpenAI
   * Chat Completions wire format (the field most OpenAI-compatible
   * providers emit); some routed providers emit `delta.reasoning` instead,
   * so both are read.
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
 * Creates an OrcaRouter text adapter with explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createOrcaRouterText('openai/gpt-5.5', "sk-orca-...");
 * ```
 */
export function createOrcaRouterText<TModel extends OrcaRouterModelId>(
  model: TModel,
  apiKey: string,
  config?: Omit<OrcaRouterTextConfig, 'apiKey'>,
): OrcaRouterTextAdapter<TModel> {
  return new OrcaRouterTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OrcaRouter text adapter with API key from
 * `ORCAROUTER_API_KEY`.
 *
 * @example
 * ```typescript
 * const adapter = orcaRouterText('openai/gpt-5.5');
 * ```
 */
export function orcaRouterText<TModel extends OrcaRouterModelId>(
  model: TModel,
  config?: Omit<OrcaRouterTextConfig, 'apiKey'>,
): OrcaRouterTextAdapter<TModel> {
  const apiKey = getOrcaRouterApiKeyFromEnv()
  return createOrcaRouterText(model, apiKey, config)
}
