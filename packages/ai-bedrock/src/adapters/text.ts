import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { withBedrockDefaults } from '../utils/client'
import type { Modality } from '@tanstack/ai'
import type { BedrockClientConfig } from '../utils/client'
import type { BedrockMessageMetadataByModality } from '../message-types'
import type {
  BedrockChatModelToolCapabilitiesByName,
  BedrockChatModels,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'

export interface BedrockTextConfig extends BedrockClientConfig {}

export type { ExternalTextProviderOptions as BedrockTextProviderOptions } from '../text/text-provider-options'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof BedrockChatModelToolCapabilitiesByName
    ? NonNullable<BedrockChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Bedrock Chat Completions adapter. Drives Bedrock's OpenAI-compatible
 * `/chat/completions` endpoint via the OpenAI SDK with a baseURL override
 * (same pattern as ai-groq). Tool conversion, streaming, structured output,
 * and the agent loop come from the base.
 */
export class BedrockTextAdapter<
  TModel extends BedrockChatModels,
  // Constraint mirrors ai-groq and the base, which parameterises
  // `TProviderOptions extends Record<string, any>`. Our default
  // `ResolveProviderOptions<TModel>` resolves to the `BedrockTextProviderOptions`
  // interface, which (lacking an implicit index signature) `Record<string,
  // unknown>` would reject but `Record<string, any>` accepts. This `any` is
  // confined to the generic constraint (the established ai-groq pattern) — no
  // value/shape `as` cast is introduced.
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  BedrockMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'bedrock' as const

  constructor(config: BedrockTextConfig, model: TModel) {
    // No `forced` -> honors config.endpoint ('runtime' default, 'mantle' allowed).
    // `model` reaches `buildBaseURL` so the mantle path matches the model family
    // (e.g. Gemma needs `/openai/v1` instead of the `/v1` default) — see #925.
    super(model, 'bedrock', new OpenAI(withBedrockDefaults(config, undefined, model)))
  }

  /**
   * Surface reasoning deltas (gpt-oss / Claude reasoning) the OpenAI-compatible
   * way. Base types the chunk as `unknown`; narrow with runtime guards — no
   * `as` casts, no `any`.
   */
  protected override extractReasoning(
    chunk: unknown,
  ): { text: string } | undefined {
    return readDeltaReasoning(chunk)
  }
}

/** Cast-free narrowing of a Chat Completions chunk's reasoning delta. */
function readDeltaReasoning(chunk: unknown): { text: string } | undefined {
  if (typeof chunk !== 'object' || chunk === null || !('choices' in chunk))
    return undefined
  if (!Array.isArray(chunk.choices)) return undefined
  const choice: unknown = chunk.choices[0]
  if (typeof choice !== 'object' || choice === null || !('delta' in choice))
    return undefined
  const delta = choice.delta
  if (typeof delta !== 'object' || delta === null) return undefined
  const raw =
    'reasoning' in delta && typeof delta.reasoning === 'string'
      ? delta.reasoning
      : 'reasoning_content' in delta &&
          typeof delta.reasoning_content === 'string'
        ? delta.reasoning_content
        : undefined
  return raw && raw.length > 0 ? { text: raw } : undefined
}

/** Chat adapter with an explicit API key (low-level; the public branching factory delegates here). */
export function createBedrockChat<TModel extends BedrockChatModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<BedrockTextConfig, 'apiKey'>,
): BedrockTextAdapter<TModel> {
  return new BedrockTextAdapter({ ...config, apiKey }, model)
}
