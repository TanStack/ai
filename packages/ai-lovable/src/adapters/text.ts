import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { withLovableDefaults } from '../utils/client'
import type { Modality } from '@tanstack/ai'
import type {
  LovableChatModelToolCapabilitiesByName,
  LovableModelId,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { LovableMessageMetadataByModality } from '../message-types'
import type { LovableClientConfig } from '../utils/client'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof LovableChatModelToolCapabilitiesByName
    ? NonNullable<LovableChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export interface LovableTextConfig extends LovableClientConfig {}

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
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'lovable' as const

  constructor(config: LovableTextConfig, model: TModel) {
    super(model, 'lovable', new OpenAI(withLovableDefaults(config)))
  }
}
