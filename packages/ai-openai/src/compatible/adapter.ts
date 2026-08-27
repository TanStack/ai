import {
  OpenAIBaseChatCompletionsTextAdapter,
  OpenAIBaseResponsesTextAdapter,
} from '@tanstack/openai-base'
import type OpenAI from 'openai'
import type { Modality } from '@tanstack/ai'
import type { OpenAIMessageMetadataByModality } from '../message-types'

export class OpenAICompatibleChatAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any> = Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const

  constructor(client: OpenAI, model: TModel, name: string) {
    super(model, name, client)
  }
}

export class OpenAICompatibleResponsesAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any> = Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const

  constructor(client: OpenAI, model: TModel, name: string) {
    super(model, name, client)
  }
}
