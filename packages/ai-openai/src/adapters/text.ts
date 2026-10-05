import OpenAI from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import { OPENAI_MODEL_REASONING } from '../model-reasoning'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { convertToolsToProviderFormat } from '../tools'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  OPENAI_MODEL_INPUT_MODALITIES,
  OPENAI_MODEL_MID_CONVERSATION_CHANNELS,
  openAIModelRejectsSamplingParams,
  openAIModelUsesExplicitPromptCache,
} from '../model-meta'
import { responsesPromptCacheFields } from '../prompt-cache'
import type {
  OPENAI_CHAT_MODELS,
  OpenAIChatModel,
  OpenAIChatModelProviderOptionsByName,
  OpenAIChatModelToolCapabilitiesByName,
  OpenAIModelInputModalitiesByName,
} from '../model-meta'
import type {
  ResponseCreateParams,
  Tool as ResponsesTool,
} from 'openai/resources/responses/responses'
import type {
  AnyTool,
  MidConversationChannels,
  Modality,
  TextOptions,
} from '@tanstack/ai'
import type { OpenAIModelReasoningByName } from '../model-reasoning'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type { OpenAIMessageMetadataByModality } from '../message-types'
import type { OpenAIClientConfig } from '../utils/client'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'

/**
 * Configuration for OpenAI text adapter
 */
export interface OpenAITextConfig
  extends OpenAIClientConfig, OpenAIBaseTextAdapterOptions {
  /**
   * The mid-conversation channels (`additional_tools` and a mid-conversation
   * `developer` message) of the models in
   * `OPENAI_MODEL_MID_CONVERSATION_CHANNELS`. When absent, they are on only
   * for OpenAI's own API: a `baseURL`, a `fetch`, or the SDK's
   * `OPENAI_BASE_URL` env var turns the default off.
   * `true` turns them on anyway, for a gateway that passes the changes.
   * `false` turns them off, so every request is built as before.
   */
  midConversationChannels?: boolean
}

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
/** The reasoning levels of a model, for `chat({ reasoning })`. `never`: none. */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof OpenAIModelReasoningByName
    ? OpenAIModelReasoningByName[TModel]
    : never

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
 * Delegates implementation to {@link OpenAIBaseResponsesTextAdapter} from
 * `@tanstack/openai-base`. The base calls `openai.responses.create`
 * directly; this subclass hands it a configured client, overrides
 * `convertTools` to use OpenAI's full tool converter (supporting
 * file_search, web_search, etc.), and overrides `mapOptionsToRequest` to
 * apply provider option validation.
 */
export class OpenAITextAdapter<
  TModel extends OpenAIChatModel,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  OpenAIMessageMetadataByModality,
  TToolCapabilities,
  ResolveReasoning<TModel>
> {
  override readonly kind = 'text' as const
  override readonly name = 'openai' as const
  // OpenAI's Responses endpoint consumes `file_id` references issued by its
  // Files API (`openaiFiles()`). The default is undefined (unsupported) so
  // compatible subclasses of the openai-base adapter (Grok, Bedrock, custom)
  // — which have no such surface — fail closed in preflight.
  override readonly supportsFileSources = true
  override readonly inputModalities = OPENAI_MODEL_INPUT_MODALITIES[this.model]
  /** Set from `OPENAI_MODEL_MID_CONVERSATION_CHANNELS` in the constructor. */
  override readonly midConversationChannels:
    | MidConversationChannels
    | undefined = undefined

  constructor(config: OpenAITextConfig, model: TModel) {
    super(model, 'openai', new OpenAI(config), config)
    // On by default only on OpenAI's own API: a proxy or a gateway (a
    // `baseURL`, a `fetch`, or the SDK's OPENAI_BASE_URL env var) may not
    // pass the changes. The option wins.
    const envBaseURL =
      typeof process !== 'undefined' && Boolean(process.env.OPENAI_BASE_URL)
    if (
      config.midConversationChannels ??
      !(config.baseURL || config.fetch || envBaseURL)
    ) {
      this.midConversationChannels =
        OPENAI_MODEL_MID_CONVERSATION_CHANNELS[model]
    }
  }

  protected override modelReasoning(model: string) {
    return OPENAI_MODEL_REASONING[model]
  }

  /** OpenAI's full tool converter (file_search, web_search, etc.). */
  protected override convertTools(tools: Array<AnyTool>): Array<ResponsesTool> {
    return convertToolsToProviderFormat(tools)
  }

  /**
   * Maps common options to OpenAI-specific format.
   * Overrides the base class to apply OpenAI-specific provider option
   * validation and request fields. The tools go through `convertTools`.
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
    if (modelOptions) {
      validateTextProviderOptions({
        ...modelOptions,
        input: this.convertMessagesToInput(options.messages),
        model: options.model,
      })
    }

    // Delegate to the base for input mapping, system prompts, tools,
    // modelOptions precedence, and native combined-mode `text.format` wiring
    // (#605). The base converts the tools with `convertTools` (OpenAI's full
    // converter), so a mid-conversation change sends the start set and its
    // `additional_tools` items in this format too. The base also gives the
    // strict-fallback warning.
    const { tools: baseTools, ...baseRequest } = super.mapOptionsToRequest(
      options,
    )
    const tools = options.tools?.length
      ? baseTools
      : options.messages.some(
            (message) => message.role === 'tool' || !!message.toolCalls?.length,
          )
        ? []
        : undefined

    // `chat({ promptCache })` fields go first, so a value the caller set in
    // `modelOptions` (already on `baseRequest`) wins.
    const promptCacheFields = responsesPromptCacheFields(options.promptCache, {
      explicitMode: openAIModelUsesExplicitPromptCache(options.model),
      longRetention: true,
    })
    const request: Omit<ResponseCreateParams, 'stream'> = {
      ...promptCacheFields,
      ...baseRequest,
      ...(tools !== undefined && { tools }),
    }

    // Reasoning models 400 on `temperature`/`top_p`. Callers (and the summarize
    // adapter's low-temperature default) can't know a given model rejects them,
    // so drop the pair here — stripping only ever averts a guaranteed 400, never
    // changes an otherwise-valid request.
    if (openAIModelRejectsSamplingParams(options.model)) {
      delete request.temperature
      delete request.top_p
    }

    // Reasoning models pair each function_call with a reasoning item. Request
    // the encrypted blob so convertMessagesToInput can replay it. Pre-5 chat
    // models do not emit those items, so leave include unset for them.
    // Callers can still set include in modelOptions.
    if (
      request.include === undefined &&
      openAIModelRejectsSamplingParams(options.model)
    ) {
      request.include = ['reasoning.encrypted_content']
    }

    // OpenAI only returns the URLs used by a hosted web search when this
    // response item is included. Preserve caller entries and add the item for
    // branded web search tools only. A custom function named `web_search` has
    // no internal provider-tool discriminator and must not change the request.
    const hasWebSearchTool = options.tools?.some((tool) => {
      const kind = tool.metadata?.['__kind']
      return (
        kind === 'openai.web_search' || kind === 'openai.web_search_preview'
      )
    })
    if (hasWebSearchTool) {
      const include = request.include ?? []
      if (!include.includes('web_search_call.action.sources')) {
        request.include = [...include, 'web_search_call.action.sources']
      }
    }

    return request
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
