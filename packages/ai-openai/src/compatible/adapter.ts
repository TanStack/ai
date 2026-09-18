import {
  OpenAIBaseChatCompletionsTextAdapter,
  OpenAIBaseResponsesTextAdapter,
} from '@tanstack/openai-base'
import type OpenAI from 'openai'
import type { Modality } from '@tanstack/ai'
import type { OpenAIMessageMetadataByModality } from '../message-types'

/**
 * Generic OpenAI-compatible adapter over the Chat Completions API
 * (`{baseURL}/chat/completions`). Capability type-args are supplied by the
 * `openaiCompatible` factory from the user's `models` tuple.
 */
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

  /**
   * OpenAI-compatible reasoning providers stream their thinking outside the
   * OpenAI wire format, on `delta.reasoning_content` (DeepSeek, Qwen, GLM,
   * Kimi, most vLLM/SGLang deployments) or `delta.reasoning` (a smaller set of
   * gateways). The base adapter has no reasoning hook by default because plain
   * Chat Completions carries none, so without this the thinking was dropped
   * silently and the only way to see it was to monkey-patch the prototype.
   *
   * Same shape as the dedicated adapters that already do this
   * (`@tanstack/ai-cloudflare`, `@tanstack/ai-byteplus`, `@tanstack/ai-groq`).
   * Providers that send neither field are unaffected.
   */
  protected override extractReasoning(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  ): { text: string } | undefined {
    const delta = chunk.choices[0]?.delta as
      | { reasoning?: unknown; reasoning_content?: unknown }
      | undefined
    const raw = delta?.reasoning_content ?? delta?.reasoning
    return typeof raw === 'string' && raw.length > 0 ? { text: raw } : undefined
  }
}

/**
 * Generic OpenAI-compatible adapter over the Responses API
 * (`{baseURL}/responses`). For the rare compatible provider that implements
 * Responses (e.g. Azure OpenAI).
 */
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
