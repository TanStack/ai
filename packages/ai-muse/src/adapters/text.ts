import {
  OpenAIBaseChatCompletionsTextAdapter,
  createOpenAIClient,
} from '@tanstack/openai-base'
import {
  MUSE_MODEL_INPUT_MODALITIES,
  MUSE_MODEL_REASONING,
} from '../model-meta'
import { getMuseApiKeyFromEnv, withMuseDefaults } from '../utils/client'
import type { Modality, TextOptions } from '@tanstack/ai'
import type {
  MUSE_CHAT_MODELS,
  MuseChatModelToolCapabilitiesByName,
  MuseModelReasoningByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { MuseMessageMetadataByModality } from '../message-types'
import type { MuseClientConfig } from '../utils/client'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'
import type { MetaPostV1ChatCompletionsBody } from '../generated/client/types'

/** The reasoning levels of a model, for `chat({ reasoning })`. `never`: none. */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof MuseModelReasoningByName
    ? MuseModelReasoningByName[TModel]
    : never

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof MuseChatModelToolCapabilitiesByName
    ? NonNullable<MuseChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Configuration for the Muse text adapter.
 */
export interface MuseTextConfig
  extends MuseClientConfig, OpenAIBaseTextAdapterOptions {}

/**
 * Re-export of the public provider options type.
 */
export type { ExternalTextProviderOptions as MuseTextProviderOptions } from '../text/text-provider-options'

/**
 * Muse Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Muse chat/text completion. Muse exposes an
 * OpenAI-compatible Chat Completions endpoint, so we drive it with an
 * OpenAI-compatible client via a `baseURL` override. There are no Muse-only
 * wire quirks, so the OpenAI Chat Completions base handles streaming, tools,
 * reasoning, and structured output unchanged.
 */
export class MuseTextAdapter<
  TModel extends (typeof MUSE_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  MuseMessageMetadataByModality,
  TToolCapabilities,
  ResolveReasoning<TModel>
> {
  override readonly kind = 'text' as const
  override readonly name = 'muse' as const
  override readonly inputModalities = MUSE_MODEL_INPUT_MODALITIES[this.model]

  constructor(config: MuseTextConfig, model: TModel) {
    super(model, 'muse', createOpenAIClient(withMuseDefaults(config)), config)
  }

  protected override modelReasoning(model: string) {
    return MUSE_MODEL_REASONING[model]
  }

  /** The shared request, checked against Meta's own Chat Completions body. */
  protected override mapOptionsToRequest(options: TextOptions) {
    const params = super.mapOptionsToRequest(options)
    // @ts-expect-error public type mismatch: the OpenAI SDK params allow null top_logprobs, safety_identifier and prompt_cache_key, a 'fast' service_tier, and custom tool calls, which Meta's document does not
    return params satisfies MetaPostV1ChatCompletionsBody
  }
}

/**
 * Creates a Muse text adapter with an explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createMuseText('muse-ember-1.0', 'muse_...');
 * ```
 */
export function createMuseText<
  TModel extends (typeof MUSE_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<MuseTextConfig, 'apiKey'>,
): MuseTextAdapter<TModel> {
  return new MuseTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Muse text adapter with the API key from `MUSE_API_KEY`.
 *
 * @example
 * ```typescript
 * const adapter = museText('muse-ember-1.0');
 * ```
 */
export function museText<TModel extends (typeof MUSE_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<MuseTextConfig, 'apiKey'>,
): MuseTextAdapter<TModel> {
  const apiKey = getMuseApiKeyFromEnv()
  return createMuseText(model, apiKey, config)
}
