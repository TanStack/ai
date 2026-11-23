import {
  OpenAIBaseChatCompletionsTextAdapter,
  OpenAIBaseResponsesTextAdapter,
} from '@tanstack/openai-base'
import type OpenAI from 'openai'
import type { ClientOptions } from 'openai'
import type {
  Modality,
  ModelReasoning,
  ReasoningCapability,
} from '@tanstack/ai'
import type { OpenAIMessageMetadataByModality } from '../message-types'
import type {
  OpenAIBaseTextAdapterOptions,
  OpenAIClientLike,
} from '@tanstack/openai-base'

/**
 * Constructor options of the OpenAI-compatible adapters. `reasoning` is typed
 * from the `TReasoning` type parameter: it is required when `TReasoning` is
 * set, its levels must be the same levels, and it is not allowed without it.
 * So the levels that `chat()` accepts are always the levels that go out.
 */
export type OpenAICompatibleAdapterOptions<
  TReasoning extends ReasoningCapability = never,
> = OpenAIBaseTextAdapterOptions &
  Pick<ClientOptions, 'fetch'> &
  ([TReasoning] extends [never]
    ? { reasoning?: never }
    : {
        /** The provider value to send for each level of `chat({ reasoning })`. */
        reasoning: {
          levels: Record<TReasoning['levels'], string>
          budget: TReasoning['budget']
        }
      })

/** The options argument: optional without `TReasoning`, required with it. */
export type OptionsArg<TReasoning extends ReasoningCapability> = [
  TReasoning,
] extends [never]
  ? [options?: OpenAICompatibleAdapterOptions]
  : [options: OpenAICompatibleAdapterOptions<TReasoning>]

type UntypedOptions = OpenAIBaseTextAdapterOptions &
  Pick<ClientOptions, 'fetch'> & { reasoning?: ModelReasoning }

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
  TReasoning extends ReasoningCapability = never,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities,
  TReasoning
> {
  override readonly kind = 'text' as const
  readonly maxTokensKey = 'max_tokens'
  private readonly reasoning: ModelReasoning | undefined

  constructor(
    client: OpenAIClientLike,
    model: TModel,
    name: string,
    ...[options]: OptionsArg<TReasoning>
  ) {
    const { reasoning, ...rest }: UntypedOptions = options ?? {}
    super(model, name, client, rest)
    this.reasoning = reasoning
  }

  /** `chat({ reasoning })` goes out as `reasoning_effort`. */
  protected override modelReasoning(_model: string) {
    return this.reasoning
  }

  /**
   * OpenAI-compatible reasoning providers stream their thinking outside the
   * OpenAI wire format, on `delta.reasoning_content` (DeepSeek, Qwen, GLM,
   * Kimi, most vLLM/SGLang deployments), `delta.reasoning` (a smaller set of
   * gateways), or `delta.reasoning_text` (GitHub Copilot). The base adapter has no reasoning hook by default because plain
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
    const delta = chunk.choices?.[0]?.delta as
      | {
          reasoning?: unknown
          reasoning_content?: unknown
          reasoning_text?: unknown
        }
      | undefined
    const raw =
      delta?.reasoning_content ?? delta?.reasoning ?? delta?.reasoning_text
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
  TReasoning extends ReasoningCapability = never,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities,
  TReasoning
> {
  override readonly kind = 'text' as const
  readonly maxTokensKey = 'max_output_tokens'
  private readonly reasoning: ModelReasoning | undefined

  constructor(
    client: OpenAIClientLike,
    model: TModel,
    name: string,
    ...[options]: OptionsArg<TReasoning>
  ) {
    const { reasoning, ...rest }: UntypedOptions = options ?? {}
    super(model, name, client, rest)
    this.reasoning = reasoning
  }

  /** `chat({ reasoning })` goes out as `reasoning: { effort, summary }`. */
  protected override modelReasoning(_model: string) {
    return this.reasoning
  }
}
