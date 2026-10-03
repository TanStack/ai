import {
  OpenAIBaseChatCompletionsTextAdapter,
  OpenAIBaseResponsesTextAdapter,
} from '@tanstack/openai-base'
import {
  applyRequestQuirks,
  applyThinking,
  replayReasoning,
  sessionHeaders,
} from './quirks'
import {
  chatPromptCacheFields,
  responsesPromptCacheFields,
} from '../prompt-cache'
import { openAIModelUsesExplicitPromptCache } from '../model-meta'
import type OpenAI from 'openai'
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'
import type {
  Modality,
  ModelMessage,
  ModelReasoning,
  ReasoningCapability,
  ReasoningMap,
  TextOptions,
} from '@tanstack/ai'
import type { OpenAIMessageMetadataByModality } from '../message-types'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'
import type { OpenAICompatibleCompat } from './quirks'

/** One model's reasoning and request quirks, from its `models` entry and the provider. */
export interface CompatibleModelConfig {
  /** `false`: the model does not reason. `true`: no level map. Or its level map. */
  reasoning?: boolean | ReasoningMap
  compat?: OpenAICompatibleCompat
}

/** The runtime reasoning data of a `models` entry. `undefined`: not declared. */
function modelReasoning(
  reasoning: boolean | ReasoningMap | undefined,
): ModelReasoning | undefined {
  if (reasoning === undefined) return undefined
  if (reasoning === false) return false
  return reasoning === true
    ? { budget: false }
    : { map: reasoning, budget: false }
}

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
  private readonly compat: OpenAICompatibleCompat | undefined
  private readonly reasoning: ModelReasoning | undefined

  constructor(
    client: OpenAI,
    model: TModel,
    name: string,
    options?: OpenAIBaseTextAdapterOptions,
    config: CompatibleModelConfig = {},
  ) {
    super(model, name, client, options)
    this.compat = config.compat
    this.reasoning = modelReasoning(config.reasoning)
  }

  /**
   * The request with the `chat({ promptCache })` fields, then the provider's
   * quirks: the thinking fields for
   * `reasoning`, and (with `compat`) the instruction role, the token field,
   * `store`, strict tools, `tool_stream`, and cache markers.
   */
  protected override mapOptionsToRequest(
    options: TextOptions,
  ): ChatCompletionCreateParamsStreaming {
    // The cache fields go first, so a value the caller set in `modelOptions`
    // (already on the base request) wins.
    const params = {
      ...chatPromptCacheFields(options.promptCache, {
        baseURL: this.client.baseURL ?? '',
        longRetention: this.compat?.supportsLongCacheRetention !== false,
      }),
      ...super.mapOptionsToRequest(options),
    }
    if (!options.reasoning && !this.compat) return params
    // The quirks edit loose JSON. The OpenAI SDK type has no field for
    // `thinking` or `enable_thinking`, so the result goes back on `params`.
    const body: Record<string, unknown> = { ...params }
    if (options.reasoning)
      applyThinking(body, options.reasoning, this.reasoning, this.compat ?? {})
    if (this.compat)
      applyRequestQuirks(
        body,
        this.compat,
        this.reasoning !== undefined && this.reasoning !== false,
        options.promptCache,
      )
    for (const key of Object.keys(params))
      if (!(key in body)) Reflect.deleteProperty(params, key)
    return Object.assign(params, body)
  }

  /**
   * An assistant message carries its thinking back as `reasoning_content`
   * when the provider needs it (DeepSeek fails the second turn without it).
   */
  protected override convertMessage(
    message: ModelMessage,
  ): ChatCompletionMessageParam {
    const converted = super.convertMessage(message)
    const replay =
      message.role === 'assistant' &&
      this.compat?.requiresReasoningContentOnAssistantMessages === true &&
      this.reasoning !== false
    if (!replay) return converted
    return Object.assign(converted, {
      reasoning_content: replayReasoning(message.thinking),
    })
  }

  protected override includeUsageInStream(): boolean {
    return this.compat?.supportsUsageInStreaming !== false
  }

  protected override requestHeaders(
    options: TextOptions,
  ): Record<string, string> | undefined {
    return this.compat
      ? sessionHeaders(
          this.compat,
          options.promptCache?.key ??
            options.conversationId ??
            options.threadId,
        )
      : undefined
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
  readonly maxTokensKey = 'max_output_tokens'
  private readonly compat: OpenAICompatibleCompat | undefined

  constructor(
    client: OpenAI,
    model: TModel,
    name: string,
    options?: OpenAIBaseTextAdapterOptions,
    config: CompatibleModelConfig = {},
  ) {
    super(model, name, client, options)
    this.compat = config.compat
  }

  /** The request, plus the prompt cache fields for `chat({ promptCache })`. */
  protected override mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ) {
    // The cache fields go first, so a value the caller set in `modelOptions`
    // (already on the base request) wins.
    return {
      ...responsesPromptCacheFields(options.promptCache, {
        explicitMode:
          this.compat?.supportsExplicitPromptCacheMode ??
          openAIModelUsesExplicitPromptCache(options.model),
        longRetention: this.compat?.supportsLongCacheRetention !== false,
      }),
      ...super.mapOptionsToRequest(options),
    }
  }
}
