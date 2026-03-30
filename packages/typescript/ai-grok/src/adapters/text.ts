import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { getGrokApiKeyFromEnv, toCompatibleConfig } from '../utils/client'
import type {
  GROK_CHAT_MODELS,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type {
  GrokMessageMetadataByModality,
} from '../message-types'
import type { GrokClientConfig } from '../utils'

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
 */
export class GrokTextAdapter<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
> extends OpenAICompatibleChatCompletionsTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  GrokMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'grok' as const

  constructor(config: GrokTextConfig, model: TModel) {
    super(toCompatibleConfig(config), model, 'grok')
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
