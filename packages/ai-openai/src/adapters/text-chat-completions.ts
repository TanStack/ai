import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  OPENAI_MODEL_INPUT_MODALITIES,
  OPENAI_MODEL_REASONING,
} from '../model-meta'
import type {
  OPENAI_CHAT_MODELS,
  OpenAIChatModel,
  OpenAIChatModelProviderOptionsByName,
  OpenAIChatModelToolCapabilitiesByName,
  OpenAIModelInputModalitiesByName,
  OpenAIModelReasoningByName,
} from '../model-meta'
import type { Modality, ReasoningCapability } from '@tanstack/ai'
import type { OpenAIMessageMetadataByModality } from '../message-types'
import type { OpenAIClientConfig } from '../utils/client'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'

/**
 * Configuration for the OpenAI Chat Completions adapter.
 *
 * Distinct from `OpenAITextConfig` (the Responses-API adapter) only in name —
 * both wrap the same `OpenAIClientConfig`. Kept separate so a future
 * chat-completions-only knob (e.g. legacy `function_call`) has a place to land
 * without leaking into the Responses adapter's surface.
 */
export interface OpenAIChatCompletionsConfig
  extends OpenAIClientConfig, OpenAIBaseTextAdapterOptions {}

export type OpenAIChatCompletionsProviderOptions = ExternalTextProviderOptions

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OpenAIChatModelProviderOptionsByName
    ? OpenAIChatModelProviderOptionsByName[TModel]
    : OpenAIChatCompletionsProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenAIModelInputModalitiesByName
    ? OpenAIModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio']

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof OpenAIChatModelToolCapabilitiesByName
    ? NonNullable<OpenAIChatModelToolCapabilitiesByName[TModel]>
    : readonly []

type ResolveReasoning<TModel extends string> =
  TModel extends keyof OpenAIModelReasoningByName
    ? OpenAIModelReasoningByName[TModel]
    : never

/**
 * OpenAI Text adapter targeting the **Chat Completions** API
 * (`/v1/chat/completions`).
 *
 * Sibling of `OpenAITextAdapter`, which targets the Responses API. Use this
 * one when you want the older, more broadly compatible wire format (e.g. to
 * compare streaming behaviour across providers that don't speak Responses yet).
 */
export class OpenAIChatCompletionsTextAdapter<
  TModel extends OpenAIChatModel,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
  TReasoning extends ReasoningCapability = ResolveReasoning<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities,
  TReasoning
> {
  override readonly kind = 'text' as const
  override readonly inputModalities = OPENAI_MODEL_INPUT_MODALITIES[this.model]

  constructor(config: OpenAIChatCompletionsConfig, model: TModel) {
    super(model, 'openai-chat', new OpenAI(config), config)
  }

  /** `chat({ reasoning })` goes out as `reasoning_effort`. */
  protected override modelReasoning(model: string) {
    return OPENAI_MODEL_REASONING[model]
  }
}

export function createOpenaiChatCompletions<
  TModel extends (typeof OPENAI_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIChatCompletionsConfig, 'apiKey'>,
): OpenAIChatCompletionsTextAdapter<TModel> {
  return new OpenAIChatCompletionsTextAdapter({ apiKey, ...config }, model)
}

export function openaiChatCompletions<
  TModel extends (typeof OPENAI_CHAT_MODELS)[number],
>(
  model: TModel,
  config?: Omit<OpenAIChatCompletionsConfig, 'apiKey'>,
): OpenAIChatCompletionsTextAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiChatCompletions(model, apiKey, config)
}
