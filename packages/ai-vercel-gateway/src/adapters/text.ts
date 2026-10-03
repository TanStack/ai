import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { withVercelGatewayDefaults } from '../utils/client'
import { mapGatewayModelOptions } from '../utils/map-gateway-options'
import { VERCEL_GATEWAY_MODEL_REASONING } from '../model-reasoning'
import { resolveReasoning } from '@tanstack/ai/adapter-internals'
import type { ResolvedReasoning } from '@tanstack/ai/adapter-internals'
import type { VercelGatewayModelReasoningByName } from '../model-reasoning'
import type { Modality, TextOptions } from '@tanstack/ai'
import type {
  VERCEL_GATEWAY_CHAT_MODELS,
  VercelGatewayChatModelToolCapabilitiesByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { VercelGatewayMessageMetadataByModality } from '../message-types'
import type { VercelGatewayClientConfig } from '../utils/client'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'

/** The reasoning levels of a model, for `chat({ reasoning })`. `never`: none. */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof VercelGatewayModelReasoningByName
    ? VercelGatewayModelReasoningByName[TModel]
    : never

/**
 * AI Gateway's `reasoning` object for Chat Completions: `enabled: false` for
 * `off`, a `max_tokens` budget when the request sets one (it cannot go with
 * `effort`), or the effort. `exclude` hides the thinking text.
 */
function gatewayReasoning(resolved: ResolvedReasoning) {
  if (resolved.level === 'off') return { enabled: false }
  const exclude = resolved.summary ? {} : { exclude: true }
  if (resolved.budgetTokens !== undefined) {
    return { enabled: true, max_tokens: resolved.budgetTokens, ...exclude }
  }
  return { effort: resolved.value ?? resolved.level, ...exclude }
}

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof VercelGatewayChatModelToolCapabilitiesByName
    ? NonNullable<VercelGatewayChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export interface VercelGatewayTextConfig
  extends VercelGatewayClientConfig, OpenAIBaseTextAdapterOptions {}

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
  TToolCapabilities,
  ResolveReasoning<TModel>
> {
  override readonly kind = 'text' as const
  override readonly name = 'vercel-gateway' as const

  constructor(config: VercelGatewayTextConfig, model: TModel) {
    super(
      model,
      'vercel-gateway',
      new OpenAI(withVercelGatewayDefaults(config)),
      config,
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
    // `chat({ reasoning })`. The `reasoning` object is an AI Gateway field
    // that the OpenAI SDK type does not list, so it goes on with
    // Object.assign.
    const resolved = resolveReasoning(
      options.reasoning,
      VERCEL_GATEWAY_MODEL_REASONING[options.model],
    )
    if (resolved) Object.assign(rest, { reasoning: gatewayReasoning(resolved) })
    return rest
  }
}
