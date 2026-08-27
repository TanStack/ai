import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { getGroqApiKeyFromEnv, withGroqDefaults } from '../utils/client'
import { makeGroqStructuredOutputCompatibleWithMap } from '../utils/schema-converter'
import type { Modality, TextOptions } from '@tanstack/ai'
import type {
  GROQ_CHAT_MODELS,
  GroqChatModelToolCapabilitiesByName,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
import type { GroqMessageMetadataByModality } from '../message-types'
import type { GroqClientConfig } from '../utils/client'

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GroqChatModelToolCapabilitiesByName
    ? NonNullable<GroqChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export interface GroqTextConfig extends GroqClientConfig {}

export type { ExternalTextProviderOptions as GroqTextProviderOptions } from '../text/text-provider-options'

export class GroqTextAdapter<
  TModel extends (typeof GROQ_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GroqMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'groq' as const

  constructor(config: GroqTextConfig, model: TModel) {
    super(model, 'groq', new OpenAI(withGroqDefaults(config)))
  }

  protected override extractRejectedToolCall(
    rawEvent: unknown,
    fallbackMessage: string,
  ):
    | {
        toolName: string
        arguments: string
        input?: unknown
        error: string
      }
    | undefined {
    if (!isRecord(rawEvent)) return undefined
    if (rawEvent.code !== 'tool_use_failed') return undefined
    if (typeof rawEvent.failed_generation !== 'string') return undefined

    let failedGeneration: unknown
    try {
      failedGeneration = JSON.parse(rawEvent.failed_generation)
    } catch {
      return undefined
    }
    if (!isRecord(failedGeneration)) return undefined
    if (typeof failedGeneration.name !== 'string') return undefined
    if (failedGeneration.name.trim().length === 0) return undefined

    const rawArguments = failedGeneration.arguments
    let argumentsJson: string
    let input: unknown
    if (typeof rawArguments === 'string') {
      argumentsJson = rawArguments
      try {
        const parsed: unknown = JSON.parse(rawArguments)
        if (isRecord(parsed)) input = parsed
      } catch {
        // The provider-rejected call remains non-executable with its raw input.
      }
    } else if (isRecord(rawArguments)) {
      argumentsJson = JSON.stringify(rawArguments)
      input = rawArguments
    } else {
      return undefined
    }

    return {
      toolName: failedGeneration.name,
      arguments: argumentsJson,
      ...(input !== undefined && { input }),
      error:
        typeof rawEvent.message === 'string' && rawEvent.message.length > 0
          ? rawEvent.message
          : fallbackMessage,
    }
  }

  protected override makeStructuredOutputCompatibleWithMap(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ) {
    return makeGroqStructuredOutputCompatibleWithMap(schema, originalRequired)
  }

  protected override async *processStreamChunks(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
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

  protected override extractReasoning(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  ): { text: string } | undefined {
    const delta = chunk.choices[0]?.delta as
      | { reasoning?: unknown; reasoning_content?: unknown }
      | undefined
    const raw = delta?.reasoning ?? delta?.reasoning_content
    if (typeof raw === 'string' && raw.length > 0) {
      return { text: raw }
    }
    return undefined
  }

  override supportsCombinedToolsAndSchema(): boolean {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function* promoteGroqUsage(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
  for await (const chunk of stream) {
    const groqChunk = chunk as typeof chunk & {
      x_groq?: { usage?: OpenAI.Chat.Completions.ChatCompletionChunk['usage'] }
    }
    if (!chunk.usage && groqChunk.x_groq?.usage) {
      yield { ...chunk, usage: groqChunk.x_groq.usage }
    } else {
      yield chunk
    }
  }
}

export function createGroqText<
  TModel extends (typeof GROQ_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqTextConfig, 'apiKey'>,
): GroqTextAdapter<TModel> {
  return new GroqTextAdapter({ apiKey, ...config }, model)
}

export function groqText<TModel extends (typeof GROQ_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<GroqTextConfig, 'apiKey'>,
): GroqTextAdapter<TModel> {
  const apiKey = getGroqApiKeyFromEnv()
  return createGroqText(model, apiKey, config)
}
