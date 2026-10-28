import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { LOVABLE_MODEL_REASONING } from '../model-meta'
import { withLovableDefaults } from '../utils/client'
import type { Modality } from '@tanstack/ai'
import type {
  LovableChatModelToolCapabilitiesByName,
  LovableModelId,
  LovableModelReasoningByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { LovableMessageMetadataByModality } from '../message-types'
import type { LovableClientConfig } from '../utils/client'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'

/**
 * The reasoning levels of a model, for `chat({ reasoning })`. This API has
 * no token budget field, so no model takes `budgetTokens` here. `never`:
 * the model does not reason.
 */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof LovableModelReasoningByName
    ? { levels: LovableModelReasoningByName[TModel]['levels']; budget: false }
    : never

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof LovableChatModelToolCapabilitiesByName
    ? NonNullable<LovableChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export interface LovableTextConfig
  extends LovableClientConfig, OpenAIBaseTextAdapterOptions {}

export type { ExternalTextProviderOptions as LovableTextProviderOptions } from '../text/text-provider-options'

/**
 * Lovable AI Gateway text adapter.
 *
 * Talks to the OpenAI-compatible Chat Completions API at
 * `https://ai.gateway.lovable.dev/v1`.
 */
export class LovableTextAdapter<
  TModel extends LovableModelId,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  LovableMessageMetadataByModality,
  TToolCapabilities,
  ResolveReasoning<TModel>
> {
  override readonly kind = 'text' as const
  override readonly name = 'lovable' as const

  constructor(config: LovableTextConfig, model: TModel) {
    super(model, 'lovable', new OpenAI(withLovableDefaults(config)), config)
  }

  protected override modelReasoning(model: string) {
    return LOVABLE_MODEL_REASONING[model]
  }
}
