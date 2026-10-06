import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { resolveReasoning } from '@tanstack/ai/adapter-internals'
import { CLOUDFLARE_MODEL_REASONING } from '../model-reasoning'
import {
  gatewayHeaders,
  isBindingConfig,
  resolveConfigFromEnv,
  restChatBaseURL,
} from '../utils/config'
import { createBindingFetch, createRestFetch } from '../utils/fetch'
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'
import type {
  CloudflareConfigInput,
  CloudflareTextConfig,
  CloudflareTextReasoningConfig,
  CloudflareTextRestConfig,
} from '../utils/config'
import type { CloudflareTextModel } from '../utils/models'
import type {
  ConfigReasoning,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  ModelReasoning,
  ReasoningCapability,
  TextOptions,
} from '@tanstack/ai'
import type { CloudflareModelReasoningByName } from '../model-reasoning'

/** The reasoning levels of a model, for `chat({ reasoning })`. `never`: none. */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof CloudflareModelReasoningByName
    ? CloudflareModelReasoningByName[TModel]
    : never

/**
 * Chat Completions parameters forwarded verbatim to Workers AI. Reasoning
 * effort is set with `chat({ reasoning })`; reasoning models (GLM, Kimi,
 * gpt-oss, QwQ) also read `chat_template_kwargs`.
 */
export interface CloudflareTextProviderOptions {
  temperature?: number
  max_tokens?: number
  top_p?: number
  top_k?: number
  seed?: number
  repetition_penalty?: number
  frequency_penalty?: number
  presence_penalty?: number
  chat_template_kwargs?: {
    enable_thinking?: boolean
    clear_thinking?: boolean
  }
}

function createClient(config: CloudflareTextConfig): OpenAI {
  if (isBindingConfig(config)) {
    return new OpenAI({
      // The binding authenticates by itself; the SDK only requires a value.
      apiKey: 'cloudflare-binding',
      fetch: createBindingFetch(config.binding, config.gateway),
    })
  }
  const {
    accountId: _accountId,
    binding: _binding,
    gateway,
    reasoning: _reasoning,
    ...clientOptions
  } = config
  return new OpenAI({
    ...clientOptions,
    baseURL: restChatBaseURL(config),
    defaultHeaders: {
      ...gatewayHeaders(gateway),
      ...clientOptions.defaultHeaders,
    },
    fetch: createRestFetch(clientOptions.fetch),
  })
}

/**
 * Cloudflare text (chat) adapter.
 *
 * Drives Workers AI's OpenAI-compatible Chat Completions surface with the
 * OpenAI SDK. Inside a Worker pass `{ binding: env.AI }`; anywhere else pass
 * `{ accountId, apiKey }`. Add `gateway` to route through AI Gateway. Any
 * catalog model works, including third-party `provider/model` ids billed
 * through AI Gateway.
 */
export class CloudflareTextAdapter<
  TModel extends CloudflareTextModel,
  TProviderOptions extends Record<string, any> = CloudflareTextProviderOptions,
  TReasoning extends ReasoningCapability = ResolveReasoning<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  TReasoning
> {
  override readonly kind = 'text' as const
  override readonly name = 'cloudflare' as const
  /** `config.reasoning`, which wins over `CLOUDFLARE_MODEL_REASONING`. */
  private readonly configReasoning: ModelReasoning | undefined

  constructor(config: CloudflareTextConfig, model: TModel) {
    super(model, 'cloudflare', createClient(config), config)
    this.configReasoning = config.reasoning
  }

  /**
   * `chat({ reasoning })` as `reasoning_effort`. Workers AI turns reasoning
   * off with `null`, so `off` sends `null`, not the model's off value.
   */
  protected override mapOptionsToRequest(options: TextOptions) {
    const request = super.mapOptionsToRequest(options)
    const resolved = resolveReasoning(
      options.reasoning,
      this.configReasoning ?? CLOUDFLARE_MODEL_REASONING[options.model],
    )
    if (resolved) {
      Object.assign(request, {
        reasoning_effort:
          resolved.level === 'off' ? null : (resolved.value ?? resolved.level),
      })
    }
    return request
  }

  /**
   * Workers AI validates `messages[].content` as a string, so a tool-call-only
   * assistant turn (which OpenAI accepts as `content: null`) is sent as `''`.
   */
  protected override convertMessage(
    message: ModelMessage,
  ): ChatCompletionMessageParam {
    const converted = super.convertMessage(message)
    if (converted.role === 'assistant' && converted.content == null) {
      return { ...converted, content: '' }
    }
    return converted
  }

  /**
   * Workers AI accepts `response_format` next to `tools` but its models answer
   * the tool follow-up turn in prose, so structured output with tools runs as
   * a separate finalization request instead.
   */
  override supportsCombinedToolsAndSchema(): boolean {
    return false
  }

  /** Workers AI reasoning models stream thinking as `reasoning_content` (some as `reasoning`). */
  protected override extractReasoning(
    chunk: ChatCompletionChunk,
  ): { text: string } | undefined {
    const delta = chunk.choices[0]?.delta as
      | { reasoning?: unknown; reasoning_content?: unknown }
      | undefined
    const raw = delta?.reasoning_content ?? delta?.reasoning
    return typeof raw === 'string' && raw.length > 0 ? { text: raw } : undefined
  }
}

/**
 * Creates a Cloudflare text adapter with explicit configuration.
 *
 * @example
 * ```typescript
 * // Inside a Worker
 * const adapter = createCloudflareText('@cf/zai-org/glm-5.3-flash', { binding: env.AI })
 * // Anywhere, over REST
 * const adapter = createCloudflareText('@cf/zai-org/glm-5.3-flash', { accountId, apiKey })
 * ```
 */
export function createCloudflareText<
  TModel extends CloudflareTextModel,
  TConfig extends CloudflareTextConfig = CloudflareTextConfig,
>(
  model: TModel,
  config: TConfig,
): CloudflareTextAdapter<
  TModel,
  CloudflareTextProviderOptions,
  ConfigReasoning<TConfig, ResolveReasoning<TModel>>
> {
  return new CloudflareTextAdapter(config, model)
}

/**
 * Creates a Cloudflare text adapter, reading `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_API_TOKEN` from the environment unless a binding is passed.
 */
export function cloudflareText<
  TModel extends CloudflareTextModel,
  TConfig extends CloudflareConfigInput<CloudflareTextRestConfig> &
    CloudflareTextReasoningConfig =
    CloudflareConfigInput<CloudflareTextRestConfig>,
>(
  model: TModel,
  config?: TConfig,
): CloudflareTextAdapter<
  TModel,
  CloudflareTextProviderOptions,
  ConfigReasoning<TConfig, ResolveReasoning<TModel>>
> {
  return new CloudflareTextAdapter(resolveConfigFromEnv(config), model)
}
