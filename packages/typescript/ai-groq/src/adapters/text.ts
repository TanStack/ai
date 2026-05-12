import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { getGroqApiKeyFromEnv, withGroqDefaults } from '../utils/client'
import { makeGroqStructuredOutputCompatible } from '../utils/schema-converter'
import type { Modality, TextOptions } from '@tanstack/ai'
import type { ChatCompletionChunk } from '@tanstack/openai-base'
import type {
  GROQ_CHAT_MODELS,
  GroqChatModelToolCapabilitiesByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { GroqMessageMetadataByModality } from '../message-types'
import type { GroqClientConfig } from '../utils'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GroqChatModelToolCapabilitiesByName
    ? NonNullable<GroqChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Configuration for Groq text adapter
 */
export interface GroqTextConfig extends GroqClientConfig {}

/**
 * Re-export of the public provider options type
 */
export type { ExternalTextProviderOptions as GroqTextProviderOptions } from '../text/text-provider-options'

/**
 * Groq Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Groq chat/text completion. Groq exposes an
 * OpenAI-compatible Chat Completions endpoint at `/openai/v1`, so we drive
 * it with the OpenAI SDK via a `baseURL` override (the same pattern as
 * `ai-grok`).
 *
 * Quirk: when usage is present on a stream, Groq historically delivered it
 * under `chunk.x_groq.usage` rather than `chunk.usage`. The override below
 * promotes it to the standard location so the base's RUN_FINISHED usage
 * accounting works unchanged.
 */
export class GroqTextAdapter<
  TModel extends (typeof GROQ_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAICompatibleChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GroqMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name = 'groq' as const

  constructor(config: GroqTextConfig, model: TModel) {
    super(withGroqDefaults(config), model, 'groq')
  }

  protected override makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): Record<string, any> {
    return makeGroqStructuredOutputCompatible(schema, originalRequired)
  }

  protected override async *processStreamChunks(
    stream: AsyncIterable<ChatCompletionChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ) {
    yield* super.processStreamChunks(
      promoteGroqUsage(stream),
      options,
      aguiState,
    )
  }
}

/**
 * Promotes Groq's non-standard `x_groq.usage` to the standard `chunk.usage`
 * slot the base reads. Pass-through for chunks that already carry usage at
 * the documented location.
 */
async function* promoteGroqUsage(
  stream: AsyncIterable<ChatCompletionChunk>,
): AsyncIterable<ChatCompletionChunk> {
  for await (const chunk of stream) {
    const groqChunk = chunk as typeof chunk & {
      x_groq?: { usage?: ChatCompletionChunk['usage'] }
    }
    if (!chunk.usage && groqChunk.x_groq?.usage) {
      yield { ...chunk, usage: groqChunk.x_groq.usage }
    } else {
      yield chunk
    }
  }
}

/**
 * Creates a Groq text adapter with explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createGroqText('llama-3.3-70b-versatile', "gsk_...");
 * ```
 */
export function createGroqText<
  TModel extends (typeof GROQ_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqTextConfig, 'apiKey'>,
): GroqTextAdapter<TModel> {
  return new GroqTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Groq text adapter with API key from `GROQ_API_KEY`.
 *
 * @example
 * ```typescript
 * const adapter = groqText('llama-3.3-70b-versatile');
 * ```
 */
export function groqText<TModel extends (typeof GROQ_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<GroqTextConfig, 'apiKey'>,
): GroqTextAdapter<TModel> {
  const apiKey = getGroqApiKeyFromEnv()
  return createGroqText(model, apiKey, config)
}
