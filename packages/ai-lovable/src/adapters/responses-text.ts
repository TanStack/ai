import OpenAI from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import { getLovableApiKeyFromEnv, withLovableDefaults } from '../utils/client'
import type { Modality } from '@tanstack/ai'
import type {
  LovableChatModelToolCapabilitiesByName,
  LovableModelId,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { LovableMessageMetadataByModality } from '../message-types'
import type { ExternalResponsesProviderOptions } from '../text/responses-provider-options'
import type { LovableClientConfig } from '../utils/client'

export interface LovableResponsesTextConfig extends LovableClientConfig {}

export type LovableResponsesTextProviderOptions =
  ExternalResponsesProviderOptions

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof LovableChatModelToolCapabilitiesByName
    ? NonNullable<LovableChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Lovable AI Gateway Responses text adapter.
 *
 * Talks to the OpenAI-compatible Responses API at
 * `https://ai.gateway.lovable.dev/v1`.
 */
export class LovableResponsesTextAdapter<
  TModel extends LovableModelId,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  LovableMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'lovable' as const

  constructor(config: LovableResponsesTextConfig, model: TModel) {
    super(model, 'lovable', new OpenAI(withLovableDefaults(config)))
  }
}

export function createLovableResponsesText<TModel extends LovableModelId>(
  model: TModel,
  apiKey: string,
  config?: Omit<LovableResponsesTextConfig, 'apiKey'>,
): LovableResponsesTextAdapter<TModel> {
  return new LovableResponsesTextAdapter({ apiKey, ...config }, model)
}

export function lovableResponsesText<TModel extends LovableModelId>(
  model: TModel,
  config?: Omit<LovableResponsesTextConfig, 'apiKey'>,
): LovableResponsesTextAdapter<TModel> {
  return createLovableResponsesText(model, getLovableApiKeyFromEnv(), config)
}
