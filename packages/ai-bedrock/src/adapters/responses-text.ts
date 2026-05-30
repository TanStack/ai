import OpenAI from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import { withBedrockDefaults } from '../utils/client'
import type { Modality } from '@tanstack/ai'
import type { BedrockClientConfig } from '../utils/client'
import type { BedrockMessageMetadataByModality } from '../message-types'
import type {
  BedrockChatModelToolCapabilitiesByName,
  BedrockResponsesModels,
  ResolveInputModalities,
} from '../model-meta'
import type { ExternalResponsesProviderOptions } from '../text/responses-provider-options'

export interface BedrockResponsesConfig extends BedrockClientConfig {}

export type { ExternalResponsesProviderOptions as BedrockResponsesProviderOptions } from '../text/responses-provider-options'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof BedrockChatModelToolCapabilitiesByName
    ? NonNullable<BedrockChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Bedrock Responses adapter. Drives mantle's OpenAI-compatible `/responses`
 * endpoint via the OpenAI SDK (`client.responses.create`) — the same base
 * class ai-openai's `openaiText` uses. Responses is mantle-only, so the
 * constructor forces the mantle baseURL.
 */
export class BedrockResponsesTextAdapter<
  TModel extends BedrockResponsesModels,
  // Constraint mirrors the chat adapter (and ai-groq / ai-openai): the base
  // parameterises `TProviderOptions extends Record<string, unknown>`, but our
  // default `ExternalResponsesProviderOptions` is an interface that (lacking
  // an implicit index signature) does not satisfy `Record<string, unknown>`.
  // `Record<string, any>` is the only constraint that both accepts that
  // interface default AND satisfies the base's constraint. This `any` is
  // confined to the generic constraint — no value/shape `as` cast is introduced.
  TProviderOptions extends Record<string, any> =
    ExternalResponsesProviderOptions,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  BedrockMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'bedrock-responses' as const

  constructor(config: BedrockResponsesConfig, model: TModel) {
    // Responses is mantle-only — force the mantle base URL (an explicit
    // config.baseURL still wins, e.g. E2E pointing at aimock).
    super(
      model,
      'bedrock-responses',
      new OpenAI(withBedrockDefaults(config, 'mantle')),
    )
  }
}

/** Responses adapter with an explicit API key (low-level; the public branching factory delegates here). */
export function createBedrockResponsesText<
  TModel extends BedrockResponsesModels,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<BedrockResponsesConfig, 'apiKey'>,
): BedrockResponsesTextAdapter<TModel> {
  return new BedrockResponsesTextAdapter({ apiKey, ...config }, model)
}
