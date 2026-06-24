import OpenAI from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import { getGrokApiKeyFromEnv, withGrokDefaults } from '../utils/client'
import { convertToolsToProviderFormat } from '../tools'
import type {
  GROK_CHAT_MODELS,
  GrokChatModelToolCapabilitiesByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { Modality, TextOptions } from '@tanstack/ai'
import type { GrokMessageMetadataByModality } from '../message-types'
import type { GrokClientConfig } from '../utils'
import type { ResponseCreateParams } from 'openai/resources/responses/responses'

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
 * Uses xAI's OpenAI-compatible Responses API.
 *
 * Delegates implementation to {@link OpenAIBaseResponsesTextAdapter}
 * from `@tanstack/openai-base` and threads Grok-specific tool-capability
 * typing through the 5th generic of the base class.
 */
export class GrokTextAdapter<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, unknown> =
    ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GrokMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'grok' as const

  constructor(config: GrokTextConfig, model: TModel) {
    super(model, 'grok', new OpenAI(withGrokDefaults(config)))
  }

  protected override mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const { tools: _baseTools, ...request } = super.mapOptionsToRequest({
      ...options,
      tools: undefined,
    })
    void _baseTools

    if (this.model === 'grok-build-0.1' && request.reasoning !== undefined) {
      throw new Error(
        'grok-build-0.1 does not support reasoning modelOptions; omit reasoning for this model.',
      )
    }

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    return {
      ...request,
      // xAI recommends encrypted reasoning for reasoning-capable Responses
      // requests; callers can still override either field in modelOptions.
      store: request.store ?? false,
      include: request.include ?? ['reasoning.encrypted_content'],
      ...(tools &&
        tools.length > 0 && { tools: tools as ResponseCreateParams['tools'] }),
    }
  }
}

/**
 * Creates a Grok text adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'grok-build-0.1')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok text adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGrokText('grok-build-0.1', "xai-...");
 * // adapter has type-safe providerOptions for grok-build-0.1
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
 * @param model - The model name (e.g., 'grok-build-0.1')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok text adapter instance with resolved types
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokText('grok-build-0.1');
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
