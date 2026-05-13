import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type {
  OPENAI_CHAT_MODELS,
  OpenAIChatModel,
  OpenAIChatModelProviderOptionsByName,
  OpenAIChatModelToolCapabilitiesByName,
  OpenAIModelInputModalitiesByName,
} from '../model-meta'
import type { Modality } from '@tanstack/ai'
import type { OpenAIMessageMetadataByModality } from '../message-types'
import type { OpenAIClientConfig } from '../utils/client'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'

/**
 * Configuration for the OpenAI Chat Completions adapter.
 *
 * Distinct from `OpenAITextConfig` (the Responses-API adapter) only in name —
 * both wrap the same `OpenAIClientConfig`. Kept separate so a future
 * chat-completions-only knob (e.g. legacy `function_call`) has a place to land
 * without leaking into the Responses adapter's surface.
 */
export interface OpenAIChatCompletionsConfig extends OpenAIClientConfig {}

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
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const

  constructor(config: OpenAIChatCompletionsConfig, model: TModel) {
    super(model, 'openai-chat', new OpenAI(config))
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
