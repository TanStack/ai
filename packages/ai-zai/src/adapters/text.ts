import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import {
  ZAI_MODEL_INPUT_MODALITIES,
  ZAI_MODEL_REASONING,
} from '../model-meta'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import { getZAIApiKeyFromEnv, withZaiDefaults } from '../utils/client'
import type {
  ZAI_CHAT_MODELS,
  ZAIChatModelToolCapabilitiesByName,
  ZAIModelReasoningByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { ContentPart, Modality, ModelReasoning, TextOptions } from '@tanstack/ai'
import type { ZAIMessageMetadataByModality } from '../message-types'
import type { ZAIClientConfig } from '../utils/client'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'
import type {
  ChatCompletionContentPart,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions/completions'

/** The reasoning levels of a model, for `chat({ reasoning })`. `never`: none. */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof ZAIModelReasoningByName
    ? ZAIModelReasoningByName[TModel]
    : never

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof ZAIChatModelToolCapabilitiesByName
    ? NonNullable<ZAIChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Configuration for the Z.AI text adapter.
 */
export interface ZAITextConfig
  extends ZAIClientConfig, OpenAIBaseTextAdapterOptions {}

/**
 * Re-export of the public provider options type.
 */
export type { ExternalTextProviderOptions as ZAITextProviderOptions } from '../text/text-provider-options'

/**
 * Z.AI Text (Chat) Adapter
 *
 * Z.AI exposes an OpenAI-compatible Chat Completions API, so the adapter
 * drives it with the OpenAI SDK via a `baseURL` override and delegates the
 * AG-UI lifecycle to {@link OpenAIBaseChatCompletionsTextAdapter}.
 *
 * Z.AI quirks handled here:
 * - `response_format` rejects `json_schema`, so every model reports
 *   `json_object` mode. The base then sends the schema as a system prompt
 *   plus `response_format: { type: 'json_object' }`.
 * - `tool_choice` accepts only `"auto"` — a named or required choice would
 *   fail the request, so the adapter always sends `auto`.
 * - Vision models accept `video_url` content parts, which the OpenAI SDK's
 *   content-part union does not model.
 */
export class ZAITextAdapter<
  TModel extends (typeof ZAI_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  ZAIMessageMetadataByModality,
  TToolCapabilities,
  ResolveReasoning<TModel>
> {
  override readonly kind = 'text' as const
  override readonly name = 'zai' as const
  override readonly inputModalities = ZAI_MODEL_INPUT_MODALITIES[this.model]
  readonly maxTokensKey = 'max_tokens'

  constructor(config: ZAITextConfig, model: TModel) {
    super(model, 'zai', new OpenAI(withZaiDefaults(config)), config)
  }

  protected override modelReasoning(model: string): ModelReasoning | undefined {
    return ZAI_MODEL_REASONING[model]
  }

  /** Z.AI accepts `json_object` only; never advertise native `json_schema`. */
  protected override modelPrefersJsonObject(): boolean {
    return true
  }

  protected override mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): ChatCompletionCreateParamsStreaming {
    const { tools: _baseTools, ...request } = super.mapOptionsToRequest({
      ...options,
      tools: undefined,
    })
    void _baseTools

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    return {
      ...request,
      ...(tools &&
        tools.length > 0 && {
          tools: tools as ChatCompletionCreateParamsStreaming['tools'],
          // Z.AI only accepts `auto`; `none`/`required`/named choices 400.
          tool_choice: 'auto' as const,
        }),
    }
  }

  protected override convertContentPart(
    part: ContentPart,
  ): ChatCompletionContentPart | null {
    if (part.type === 'video') {
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- Z.AI's video_url part is absent from the OpenAI SDK's content-part union
      return {
        type: 'video_url',
        video_url: { url: part.source.value },
      } as unknown as ChatCompletionContentPart
    }
    return super.convertContentPart(part)
  }

  /**
   * Z.AI streams thinking as `delta.reasoning_content`.
   */
  protected override extractReasoning(
    chunk: unknown,
  ): { text: string } | undefined {
    const delta = (
      chunk as {
        choices?: ReadonlyArray<{
          delta?: { reasoning_content?: unknown }
        }>
      }
    ).choices?.[0]?.delta
    const raw = delta?.reasoning_content
    return typeof raw === 'string' && raw.length > 0
      ? { text: raw }
      : undefined
  }
}

/**
 * Creates a Z.AI text adapter with an explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createZAIText('glm-5.2', 'your-zai-api-key')
 * ```
 */
export function createZAIText<
  TModel extends (typeof ZAI_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<ZAITextConfig, 'apiKey'>,
): ZAITextAdapter<TModel> {
  return new ZAITextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Z.AI text adapter with the API key from `ZAI_API_KEY`.
 *
 * @example
 * ```typescript
 * const adapter = zaiText('glm-5.2')
 * ```
 */
export function zaiText<TModel extends (typeof ZAI_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<ZAITextConfig, 'apiKey'>,
): ZAITextAdapter<TModel> {
  return createZAIText(model, getZAIApiKeyFromEnv(), config)
}
