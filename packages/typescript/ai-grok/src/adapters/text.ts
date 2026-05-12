import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { getGrokApiKeyFromEnv, withGrokDefaults } from '../utils/client'
import type {
  GROK_CHAT_MODELS,
  GrokChatModelToolCapabilitiesByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { Modality } from '@tanstack/ai'
import type { ChatCompletionChunk } from '@tanstack/openai-base'
import type { GrokMessageMetadataByModality } from '../message-types'
import type { GrokClientConfig } from '../utils'

/**
 * Resolve tool capabilities for a specific Grok model.
 */
type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GrokChatModelToolCapabilitiesByName
    ? NonNullable<GrokChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Configuration for Grok text adapter
 */
export interface GrokTextConfig extends GrokClientConfig {}

/**
 * Alias for TextProviderOptions for external use
 */
export type { ExternalTextProviderOptions as GrokTextProviderOptions } from '../text/text-provider-options'

/**
 * Grok Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Grok chat/text completion functionality.
 * Uses OpenAI-compatible Chat Completions API (not Responses API).
 *
 * Delegates implementation to {@link OpenAIBaseChatCompletionsTextAdapter}
 * from `@tanstack/openai-base` and threads Grok-specific tool-capability
 * typing through the 5th generic of the base class.
 */
export class GrokTextAdapter<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GrokMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name = 'grok' as const

  constructor(config: GrokTextConfig, model: TModel) {
    super(model, 'grok', new OpenAI(withGrokDefaults(config)))
  }

  /**
   * Surfaces xAI reasoning deltas on Grok reasoning models. The DeepSeek-style
   * convention puts the chain-of-thought on `delta.reasoning_content`; some
   * Grok variants also populate `delta.reasoning`. Reading both keeps
   * reasoning flowing through the base's REASONING_* lifecycle for both
   * `chatStream` and `structuredOutputStream`.
   */
  protected override extractReasoning(
    chunk: ChatCompletionChunk,
  ): { text: string } | undefined {
    const delta = chunk.choices[0]?.delta as
      | { reasoning?: unknown; reasoning_content?: unknown }
      | undefined
    const raw = delta?.reasoning_content ?? delta?.reasoning
    if (typeof raw === 'string' && raw.length > 0) {
      return { text: raw }
    }
    return undefined
  }
}

/**
 * Creates a Grok text adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'grok-3', 'grok-4')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok text adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGrokText('grok-3', "xai-...");
 * // adapter has type-safe providerOptions for grok-3
 * ```
 */
export function createGrokText<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokTextConfig, 'apiKey'>,
): GrokTextAdapter<TModel> {
  return new GrokTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Grok text adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'grok-3', 'grok-4')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok text adapter instance with resolved types
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokText('grok-3');
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function grokText<TModel extends (typeof GROK_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<GrokTextConfig, 'apiKey'>,
): GrokTextAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokText(model, apiKey, config)
}
