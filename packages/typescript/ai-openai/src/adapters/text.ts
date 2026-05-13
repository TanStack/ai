import OpenAI from 'openai'
import { OpenAICompatibleResponsesTextAdapter } from '@tanstack/ai-openai-compatible'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { convertToolsToProviderFormat } from '../tools'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type {
  OPENAI_CHAT_MODELS,
  OpenAIChatModel,
  OpenAIChatModelProviderOptionsByName,
  OpenAIChatModelToolCapabilitiesByName,
  OpenAIModelInputModalitiesByName,
} from '../model-meta'
import type {
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
  ResponsesResponse,
} from '@tanstack/ai-openai-compatible'
import type OpenAI_SDK from 'openai'
import type { Modality, TextOptions } from '@tanstack/ai'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type { OpenAIMessageMetadataByModality } from '../message-types'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI text adapter
 */
export interface OpenAITextConfig extends OpenAIClientConfig {}

/**
 * Alias for TextProviderOptions
 */
export type OpenAITextProviderOptions = ExternalTextProviderOptions

// ===========================
// Type Resolution Helpers
// ===========================

/**
 * Resolve provider options for a specific model.
 * If the model has explicit options in the map, use those; otherwise use base options.
 */
type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OpenAIChatModelProviderOptionsByName
    ? OpenAIChatModelProviderOptionsByName[TModel]
    : OpenAITextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use all modalities.
 */
type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenAIModelInputModalitiesByName
    ? OpenAIModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio']

/**
 * Resolve tool capabilities for a specific model.
 * If the model has explicit tools in the map, use those; otherwise use empty tuple.
 */
type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof OpenAIChatModelToolCapabilitiesByName
    ? NonNullable<OpenAIChatModelToolCapabilitiesByName[TModel]>
    : readonly []

// ===========================
// Adapter Implementation
// ===========================

/**
 * OpenAI Text (Chat) Adapter
 *
 * Tree-shakeable adapter for OpenAI chat/text completion functionality.
 * Delegates implementation to {@link OpenAICompatibleResponsesTextAdapter} from
 * `@tanstack/ai-openai-compatible` and threads OpenAI-specific tool-capability typing
 * through the 5th generic of the base class.
 */
export class OpenAITextAdapter<
  TModel extends OpenAIChatModel,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAICompatibleResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name = 'openai' as const

  protected client: OpenAI

  constructor(config: OpenAITextConfig, model: TModel) {
    super(model, 'openai')
    this.client = new OpenAI(config)
  }

  // The override signatures use the local protocol types from
  // `@tanstack/ai-openai-compatible` so we stay variance-compatible with the
  // base. Inside the body we still call the openai SDK; casting at the SDK
  // boundary (where we already own the runtime contract) is the cleanest
  // place to land the two-type-name reality.

  protected async callResponse(
    params: ResponseCreateParamsNonStreaming,
    requestOptions: { signal?: AbortSignal | null; headers?: HeadersInit },
  ): Promise<ResponsesResponse> {
    const response = await this.client.responses.create(
      params as unknown as OpenAI_SDK.Responses.ResponseCreateParamsNonStreaming,
      requestOptions,
    )
    return response as unknown as ResponsesResponse
  }

  protected async callResponseStream(
    params: ResponseCreateParamsStreaming,
    requestOptions: { signal?: AbortSignal | null; headers?: HeadersInit },
  ): Promise<AsyncIterable<ResponseStreamEvent>> {
    const stream = await this.client.responses.create(
      params as unknown as OpenAI_SDK.Responses.ResponseCreateParamsStreaming,
      requestOptions,
    )
    return stream as unknown as AsyncIterable<ResponseStreamEvent>
  }

  /**
   * Maps common options to OpenAI-specific format.
   * Overrides the base class to use OpenAI's full tool converter
   * (supporting special tool types like file_search, web_search, etc.)
   * and to apply OpenAI-specific provider option validation.
   */
  protected override mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
    // The structural type the validator expects is broader than what
    // `TProviderOptions` is bound to per-model, so narrow via the internal
    // shape rather than re-exposing it on the public override signature.
    const modelOptions = options.modelOptions as
      | InternalTextProviderOptions
      | undefined
    const input = this.convertMessagesToInput(options.messages)
    if (modelOptions) {
      validateTextProviderOptions({
        ...modelOptions,
        input,
        model: options.model,
      })
    }

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    // Mirror the base adapter's precedence: spread `modelOptions` first, then
    // conditionally add explicit top-level options only when defined. The
    // previous override spread `...modelOptions` LAST and wrote
    // `temperature: options.temperature` unconditionally — re-introducing the
    // exact regression the base class's nullish-aware merge fixes.
    const requestParams: Omit<ResponseCreateParams, 'stream'> = {
      ...modelOptions,
      model: options.model,
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.maxTokens !== undefined && {
        max_output_tokens: options.maxTokens,
      }),
      ...(options.topP !== undefined && { top_p: options.topP }),
      ...(options.metadata !== undefined && { metadata: options.metadata }),
      ...(options.systemPrompts &&
        options.systemPrompts.length > 0 && {
          instructions: options.systemPrompts.join('\n'),
        }),
      input,
      ...(tools && tools.length > 0 && { tools }),
    }

    return requestParams
  }
}

/**
 * Creates an OpenAI chat adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'gpt-4o', 'gpt-4-turbo')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI chat adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiChat('gpt-4o', "sk-...");
 * // adapter has type-safe modelOptions for gpt-4o
 * ```
 */
export function createOpenaiChat<
  TModel extends (typeof OPENAI_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITextConfig, 'apiKey'>,
): OpenAITextAdapter<TModel> {
  return new OpenAITextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI text adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'gpt-4o', 'gpt-4-turbo')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI text adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiText('gpt-4o');
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function openaiText<TModel extends (typeof OPENAI_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<OpenAITextConfig, 'apiKey'>,
): OpenAITextAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiChat(model, apiKey, config)
}
