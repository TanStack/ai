import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import {
  NEON_MODELS_REJECTING_SAMPLING,
  NEON_MODELS_REJECTING_STREAM_OPTIONS,
  NEON_MODEL_INPUT_MODALITIES,
  NEON_MODEL_REASONING,
} from '../model-meta'
import { withNeonDefaults } from '../utils/client'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  TextOptions,
} from '@tanstack/ai'
import type {
  NeonChatModel,
  NeonModelInputModalitiesByName,
  NeonModelReasoningByName,
} from '../model-meta'
import type { NeonTextProviderOptions } from '../text/text-provider-options'
import type { NeonClientConfig } from '../utils/client'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'

/** The reasoning levels of a model, for `chat({ reasoning })`. `never`: none. */
export type ResolveReasoning<TModel extends string> =
  TModel extends keyof NeonModelReasoningByName
    ? NeonModelReasoningByName[TModel]
    : never

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof NeonModelInputModalitiesByName
    ? NeonModelInputModalitiesByName[TModel]
    : readonly ['text']

// The Chat Completions converter handles text and images. The catalog also
// lists media that needs a native route, so constrain this route's types.
type ResolveChatInputModalities<TModel extends string> =
  'image' extends ResolveInputModalities<TModel>[number]
    ? readonly ['text', 'image']
    : readonly ['text']

/**
 * Drop `temperature` and `top_p` for the models that 400 on them. Callers
 * (and the summarize adapter's low-temperature default) can't know a given
 * model rejects them, and stripping only ever averts a guaranteed 400.
 */
export function dropRejectedSampling<TRequest extends object>(
  model: string,
  request: TRequest,
): TRequest {
  if (NEON_MODELS_REJECTING_SAMPLING.has(model)) {
    Reflect.deleteProperty(request, 'temperature')
    Reflect.deleteProperty(request, 'top_p')
  }
  return request
}

export interface NeonTextConfig
  extends NeonClientConfig, OpenAIBaseTextAdapterOptions {}

/**
 * Neon AI Gateway adapter for the unified Chat Completions route
 * (`/v1/chat/completions`), which serves every chat model in the catalog.
 * `neonText` picks this adapter unless the model needs another route.
 */
export class NeonTextAdapter<
  TModel extends NeonChatModel,
  TProviderOptions extends Record<string, any> = NeonTextProviderOptions,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveChatInputModalities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  DefaultMessageMetadataByModality,
  readonly [],
  ResolveReasoning<TModel>
> {
  override readonly kind = 'text' as const
  override readonly name = 'neon' as const
  override readonly inputModalities = NEON_MODEL_INPUT_MODALITIES[
    this.model
  ].filter((modality) => modality === 'text' || modality === 'image')
  /** The gateway's output cap on this route, for `summarize({ maxLength })`. */
  readonly maxTokensKey = 'max_tokens'

  constructor(config: NeonTextConfig, model: TModel) {
    const options = withNeonDefaults(config, 'chat')
    // The base wraps `options.fetch` for `wrapFetch`, so it must be the
    // normalizing fetch the client uses.
    super(model, 'neon', new OpenAI(options), {
      ...config,
      fetch: options.fetch,
    })
  }

  protected override modelReasoning(model: string) {
    return NEON_MODEL_REASONING[model]
  }

  /** Gemini models 400 on `stream_options` here, and stream usage anyway. */
  protected override streamOptions(model: string) {
    return NEON_MODELS_REJECTING_STREAM_OPTIONS.has(model)
      ? undefined
      : super.streamOptions(model)
  }

  protected override mapOptionsToRequest(options: TextOptions) {
    return dropRejectedSampling(
      options.model,
      super.mapOptionsToRequest(options),
    )
  }

  /**
   * Reasoning deltas arrive as `delta.reasoning_content` (also where the
   * content normalizer puts array `reasoning` parts) or `delta.reasoning`.
   */
  protected override extractReasoning(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  ): { text: string } | undefined {
    const delta = chunk.choices?.[0]?.delta as
      | { reasoning?: unknown; reasoning_content?: unknown }
      | undefined
    const raw = delta?.reasoning_content ?? delta?.reasoning
    return typeof raw === 'string' && raw.length > 0 ? { text: raw } : undefined
  }
}
