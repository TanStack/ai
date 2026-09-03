import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
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
import type { CloudflareConfig, CloudflareRestConfig } from '../utils/config'
import type { CloudflareTextModel } from '../utils/models'
import type { ModelMessage } from '@tanstack/ai'

/**
 * Chat Completions parameters forwarded verbatim to Workers AI. Reasoning
 * models (GLM, Kimi, gpt-oss, QwQ) read `reasoning_effort` and
 * `chat_template_kwargs`; `null` for `reasoning_effort` turns reasoning off.
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
  reasoning_effort?: 'low' | 'medium' | 'high' | null
  chat_template_kwargs?: {
    enable_thinking?: boolean
    clear_thinking?: boolean
  }
}

export type CloudflareTextConfig = CloudflareConfig

function createClient(config: CloudflareConfig): OpenAI {
  if (isBindingConfig(config)) {
    return new OpenAI({
      // The binding authenticates by itself; the SDK only requires a value.
      apiKey: 'cloudflare-binding',
      fetch: createBindingFetch(config.binding, config.gateway),
    })
  }
  const { accountId: _accountId, gateway, ...clientOptions } = config
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
> extends OpenAIBaseChatCompletionsTextAdapter<TModel, TProviderOptions> {
  override readonly kind = 'text' as const
  override readonly name = 'cloudflare' as const

  constructor(config: CloudflareTextConfig, model: TModel) {
    super(model, 'cloudflare', createClient(config))
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

  /** Workers AI reasoning models stream thinking as `reasoning_content`. */
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
export function createCloudflareText<TModel extends CloudflareTextModel>(
  model: TModel,
  config: CloudflareTextConfig,
): CloudflareTextAdapter<TModel> {
  return new CloudflareTextAdapter(config, model)
}

/**
 * Creates a Cloudflare text adapter, reading `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_API_TOKEN` from the environment unless a binding is passed.
 */
export function cloudflareText<TModel extends CloudflareTextModel>(
  model: TModel,
  config?: CloudflareConfig | Partial<CloudflareRestConfig>,
): CloudflareTextAdapter<TModel> {
  return new CloudflareTextAdapter(resolveConfigFromEnv(config), model)
}
