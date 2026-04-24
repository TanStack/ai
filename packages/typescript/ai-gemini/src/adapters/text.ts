import { FinishReason } from '@google/genai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type {
  GEMINI_MODELS,
  GeminiChatModelProviderOptionsByName,
  GeminiChatModelToolCapabilitiesByName,
  GeminiModelInputModalitiesByName,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  Content,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
  ThinkingLevel,
} from '@google/genai'
import type {
  ContentPart,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type { GeminiMessageMetadataByModality } from '../message-types'
import type { GeminiClientConfig } from '../utils'

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

/**
 * Configuration for Gemini text adapter
 */
export interface GeminiTextConfig extends GeminiClientConfig {}

/**
 * Gemini-specific provider options for text/chat
 */
export type GeminiTextProviderOptions = ExternalTextProviderOptions

// ===========================
// Type Resolution Helpers
// ===========================

/**
 * Resolve provider options for a specific model.
 * If the model has explicit options in the map, use those; otherwise use base options.
 */
type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof GeminiChatModelProviderOptionsByName
    ? GeminiChatModelProviderOptionsByName[TModel]
    : GeminiTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use all modalities.
 */
type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GeminiModelInputModalitiesByName
    ? GeminiModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio', 'video', 'document']

/**
 * Resolve tool capabilities for a specific model.
 * If the model has explicit tools in the map, use those; otherwise use empty tuple.
 */
type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GeminiChatModelToolCapabilitiesByName
    ? NonNullable<GeminiChatModelToolCapabilitiesByName[TModel]>
    : readonly []

// ===========================
// Adapter Implementation
// ===========================

/**
 * Gemini Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Gemini chat/text completion functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class GeminiTextAdapter<
  TModel extends (typeof GEMINI_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GeminiMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name = 'gemini' as const

  private client: GoogleGenAI

  constructor(config: GeminiTextConfig, model: TModel) {
    super({}, model)
    this.client = createGeminiClient(config)
  }

  async *chatStream(
    options: TextOptions<GeminiTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const mappedOptions = this.mapCommonOptionsToGemini(options)
    const { logger } = options

    try {
      logger.request(
        `activity=chat provider=gemini model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: 'gemini', model: this.model },
      )
      const result =
        await this.client.models.generateContentStream(mappedOptions)

      yield* this.processStreamChunks(result, options, logger)
    } catch (error) {
      const timestamp = Date.now()
      logger.errors('gemini.chatStream fatal', {
        error,
        source: 'gemini.chatStream',
      })
      yield asChunk({
        type: 'RUN_ERROR',
        model: options.model,
        timestamp,
        message:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred during the chat stream.',
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred during the chat stream.',
        },
      })
    }
  }

  /**
   * Generate structured output using Gemini's native JSON response format.
   * Uses responseMimeType: 'application/json' and responseSchema for structured output.
   * The outputSchema is already JSON Schema (converted in the ai layer).
   */
  async structuredOutput(
    options: StructuredOutputOptions<GeminiTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions

    const mappedOptions = this.mapCommonOptionsToGemini(chatOptions)

    try {
      logger.request(
        `activity=chat provider=gemini model=${this.model} messages=${chatOptions.messages.length} tools=${chatOptions.tools?.length ?? 0} stream=false`,
        { provider: 'gemini', model: this.model },
      )
      // Add structured output configuration
      const result = await this.client.models.generateContent({
        ...mappedOptions,
        config: {
          ...mappedOptions.config,
          responseMimeType: 'application/json',
          responseSchema: outputSchema,
        },
      })

      // Extract text content from the response
      const rawText = this.extractTextFromResponse(result)

      // Parse the JSON response
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      return {
        data: parsed,
        rawText,
      }
    } catch (error) {
      logger.errors('gemini.structuredOutput fatal', {
        error,
        source: 'gemini.structuredOutput',
      })
      throw new Error(
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during structured output generation.',
      )
    }
  }

  /**
   * Extract text content from a non-streaming response
   */
  private extractTextFromResponse(response: GenerateContentResponse): string {
    let textContent = ''

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          textContent += part.text
        }
      }
    }

    return textContent
  }

  private async *processStreamChunks(
    result: AsyncGenerator<GenerateContentResponse, unknown, unknown>,
    options: TextOptions<GeminiTextProviderOptions>,
    logger: InternalLogger,
  ): AsyncIterable<StreamChunk> {
    const model = options.model
    const timestamp = Date.now()
    let accumulatedContent = ''
    let accumulatedThinking = ''
    const toolCallMap = new Map<
      string,
      {
        name: string
        args: string
        index: number
        started: boolean
        thoughtSignature?: string
      }
    >()
    let nextToolIndex = 0

    // AG-UI lifecycle tracking
    const runId = options.runId ?? generateId(this.name)
    const threadId = options.threadId ?? generateId(this.name)
    const messageId = generateId(this.name)
    let stepId: string | null = null
    let reasoningMessageId: string | null = null
    let hasClosedReasoning = false
    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false

    for await (const chunk of result) {
      logger.provider(`provider=gemini`, { chunk })
      // Emit RUN_STARTED on first chunk
      if (!hasEmittedRunStarted) {
        hasEmittedRunStarted = true
        yield asChunk({
          type: 'RUN_STARTED',
          runId,
          threadId,
          model,
          timestamp,
        })
      }

      if (chunk.candidates?.[0]?.content?.parts) {
        const parts = chunk.candidates[0].content.parts

        for (const part of parts) {
          if (part.text) {
            if (part.thought) {
              // Emit STEP_STARTED and REASONING events on first thinking content
              if (!hasEmittedStepStarted) {
                hasEmittedStepStarted = true
                stepId = generateId(this.name)
                reasoningMessageId = generateId(this.name)

                // Spec REASONING events
                yield asChunk({
                  type: 'REASONING_START',
                  messageId: reasoningMessageId,
                  model,
                  timestamp,
                })
                yield asChunk({
                  type: 'REASONING_MESSAGE_START',
                  messageId: reasoningMessageId,
                  role: 'reasoning' as const,
                  model,
                  timestamp,
                })

                // Legacy STEP events (kept during transition)
                yield asChunk({
                  type: 'STEP_STARTED',
                  stepName: stepId,
                  stepId,
                  model,
                  timestamp,
                  stepType: 'thinking',
                })
              }

              accumulatedThinking += part.text

              // Spec REASONING content event
              yield asChunk({
                type: 'REASONING_MESSAGE_CONTENT',
                messageId: reasoningMessageId!,
                delta: part.text,
                model,
                timestamp,
              })

              // Legacy STEP event
              yield asChunk({
                type: 'STEP_FINISHED',
                stepName: stepId || generateId(this.name),
                stepId: stepId || generateId(this.name),
                model,
                timestamp,
                delta: part.text,
                content: accumulatedThinking,
              })
            } else if (part.text.trim()) {
              // Close reasoning before text starts
              if (reasoningMessageId && !hasClosedReasoning) {
                hasClosedReasoning = true
                yield asChunk({
                  type: 'REASONING_MESSAGE_END',
                  messageId: reasoningMessageId,
                  model,
                  timestamp,
                })
                yield asChunk({
                  type: 'REASONING_END',
                  messageId: reasoningMessageId,
                  model,
                  timestamp,
                })
              }

              // Skip whitespace-only text parts (e.g. "\n" during auto-continuation)
              // Emit TEXT_MESSAGE_START on first text content
              if (!hasEmittedTextMessageStart) {
                hasEmittedTextMessageStart = true
                yield asChunk({
                  type: 'TEXT_MESSAGE_START',
                  messageId,
                  model,
                  timestamp,
                  role: 'assistant',
                })
              }

              accumulatedContent += part.text
              yield asChunk({
                type: 'TEXT_MESSAGE_CONTENT',
                messageId,
                model,
                timestamp,
                delta: part.text,
                content: accumulatedContent,
              })
            }
          }

          const functionCall = part.functionCall
          if (functionCall) {
            const toolCallId =
              functionCall.id ||
              `${functionCall.name}_${Date.now()}_${nextToolIndex}`
            const functionArgs = functionCall.args || {}

            let toolCallData = toolCallMap.get(toolCallId)
            if (!toolCallData) {
              toolCallData = {
                name: functionCall.name || '',
                args:
                  typeof functionArgs === 'string'
                    ? functionArgs
                    : JSON.stringify(functionArgs),
                index: nextToolIndex++,
                started: false,
                thoughtSignature:
                  (functionCall as any).thoughtSignature || undefined,
              }
              toolCallMap.set(toolCallId, toolCallData)
            } else {
              try {
                const existingArgs = JSON.parse(toolCallData.args)
                const newArgs =
                  typeof functionArgs === 'string'
                    ? JSON.parse(functionArgs)
                    : functionArgs
                const mergedArgs = { ...existingArgs, ...newArgs }
                toolCallData.args = JSON.stringify(mergedArgs)
              } catch {
                toolCallData.args =
                  typeof functionArgs === 'string'
                    ? functionArgs
                    : JSON.stringify(functionArgs)
              }
            }

            // Emit TOOL_CALL_START if not already started
            if (!toolCallData.started) {
              toolCallData.started = true
              yield asChunk({
                type: 'TOOL_CALL_START',
                toolCallId,
                toolCallName: toolCallData.name,
                toolName: toolCallData.name,
                model,
                timestamp,
                index: toolCallData.index,
                ...(toolCallData.thoughtSignature && {
                  providerMetadata: {
                    thoughtSignature: toolCallData.thoughtSignature,
                  },
                }),
              })
            }

            // Emit TOOL_CALL_ARGS
            yield asChunk({
              type: 'TOOL_CALL_ARGS',
              toolCallId,
              model,
              timestamp,
              delta: toolCallData.args,
              args: toolCallData.args,
            })
          }
        }
      } else if (chunk.data && chunk.data.trim()) {
        // Skip whitespace-only data (e.g. "\n" during auto-continuation)
        // Emit TEXT_MESSAGE_START on first text content
        if (!hasEmittedTextMessageStart) {
          hasEmittedTextMessageStart = true
          yield asChunk({
            type: 'TEXT_MESSAGE_START',
            messageId,
            model,
            timestamp,
            role: 'assistant',
          })
        }

        accumulatedContent += chunk.data
        yield asChunk({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId,
          model,
          timestamp,
          delta: chunk.data,
          content: accumulatedContent,
        })
      }

      if (chunk.candidates?.[0]?.finishReason) {
        const finishReason = chunk.candidates[0].finishReason

        if (finishReason === FinishReason.UNEXPECTED_TOOL_CALL) {
          if (chunk.candidates[0].content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              const functionCall = part.functionCall
              if (functionCall) {
                const toolCallId =
                  functionCall.id ||
                  `${functionCall.name}_${Date.now()}_${nextToolIndex}`
                const functionArgs = functionCall.args || {}

                const argsString =
                  typeof functionArgs === 'string'
                    ? functionArgs
                    : JSON.stringify(functionArgs)

                toolCallMap.set(toolCallId, {
                  name: functionCall.name || '',
                  args: argsString,
                  index: nextToolIndex++,
                  started: true,
                })

                // Emit TOOL_CALL_START
                yield asChunk({
                  type: 'TOOL_CALL_START',
                  toolCallId,
                  toolCallName: functionCall.name || '',
                  toolName: functionCall.name || '',
                  model,
                  timestamp,
                  index: nextToolIndex - 1,
                })

                // Emit TOOL_CALL_END with parsed input
                let parsedInput: unknown = {}
                try {
                  const parsed =
                    typeof functionArgs === 'string'
                      ? JSON.parse(functionArgs)
                      : functionArgs
                  parsedInput =
                    parsed && typeof parsed === 'object' ? parsed : {}
                } catch {
                  parsedInput = {}
                }

                yield asChunk({
                  type: 'TOOL_CALL_END',
                  toolCallId,
                  toolCallName: functionCall.name || '',
                  toolName: functionCall.name || '',
                  model,
                  timestamp,
                  input: parsedInput,
                })
              }
            }
          }
        }

        // Emit TOOL_CALL_END for all tracked tool calls
        for (const [toolCallId, toolCallData] of toolCallMap.entries()) {
          let parsedInput: unknown = {}
          try {
            const parsed = JSON.parse(toolCallData.args)
            parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
          } catch {
            parsedInput = {}
          }

          yield asChunk({
            type: 'TOOL_CALL_END',
            toolCallId,
            toolCallName: toolCallData.name,
            toolName: toolCallData.name,
            model,
            timestamp,
            input: parsedInput,
          })
        }

        // Reset so a new TEXT_MESSAGE_START is emitted if text follows tool calls
        if (toolCallMap.size > 0) {
          hasEmittedTextMessageStart = false
        }

        if (finishReason === FinishReason.MAX_TOKENS) {
          yield asChunk({
            type: 'RUN_ERROR',
            runId,
            model,
            timestamp,
            message:
              'The response was cut off because the maximum token limit was reached.',
            code: 'max_tokens',
            error: {
              message:
                'The response was cut off because the maximum token limit was reached.',
              code: 'max_tokens',
            },
          })
        }

        // Close reasoning events if still open
        if (reasoningMessageId && !hasClosedReasoning) {
          hasClosedReasoning = true
          yield asChunk({
            type: 'REASONING_MESSAGE_END',
            messageId: reasoningMessageId,
            model,
            timestamp,
          })
          yield asChunk({
            type: 'REASONING_END',
            messageId: reasoningMessageId,
            model,
            timestamp,
          })
        }

        // Emit TEXT_MESSAGE_END if we had text content
        if (hasEmittedTextMessageStart) {
          yield asChunk({
            type: 'TEXT_MESSAGE_END',
            messageId,
            model,
            timestamp,
          })
        }

        yield asChunk({
          type: 'RUN_FINISHED',
          runId,
          threadId,
          model,
          timestamp,
          finishReason: toolCallMap.size > 0 ? 'tool_calls' : 'stop',
          usage: chunk.usageMetadata
            ? {
                promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
              }
            : undefined,
        })
      }
    }
  }

  private convertContentPartToGemini(part: ContentPart): Part {
    switch (part.type) {
      case 'text':
        return { text: part.content }
      case 'image':
      case 'audio':
      case 'video':
      case 'document': {
        if (part.source.type === 'data') {
          return {
            inlineData: {
              data: part.source.value,
              mimeType: part.source.mimeType,
            },
          }
        } else {
          // For URL sources, use provided mimeType or fall back to reasonable defaults
          const defaultMimeType = {
            image: 'image/jpeg',
            audio: 'audio/mp3',
            video: 'video/mp4',
            document: 'application/pdf',
          }[part.type]

          return {
            fileData: {
              fileUri: part.source.value,
              mimeType: part.source.mimeType ?? defaultMimeType,
            },
          }
        }
      }
      default: {
        const _exhaustiveCheck: never = part
        throw new Error(
          `Unsupported content part type: ${(_exhaustiveCheck as ContentPart).type}`,
        )
      }
    }
  }

  private formatMessages(
    messages: Array<ModelMessage>,
  ): GenerateContentParameters['contents'] {
    // Build a lookup from toolCallId → function name so functionResponse uses the
    // correct name instead of the raw call ID.
    const toolCallIdToName = new Map<string, string>()
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          toolCallIdToName.set(tc.id, tc.function.name)
        }
      }
    }

    const formatted = messages.map((msg) => {
      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user'
      const parts: Array<Part> = []

      if (Array.isArray(msg.content)) {
        for (const contentPart of msg.content) {
          parts.push(this.convertContentPartToGemini(contentPart))
        }
      } else if (msg.content && msg.role !== 'tool') {
        parts.push({ text: msg.content })
      }

      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        for (const toolCall of msg.toolCalls) {
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = toolCall.function.arguments
              ? (JSON.parse(toolCall.function.arguments) as Record<
                  string,
                  unknown
                >)
              : {}
          } catch {
            parsedArgs = toolCall.function.arguments as unknown as Record<
              string,
              unknown
            >
          }

          const thoughtSignature = toolCall.providerMetadata
            ?.thoughtSignature as string | undefined
          parts.push({
            functionCall: {
              id: toolCall.id,
              name: toolCall.function.name,
              args: parsedArgs,
              ...(thoughtSignature && { thoughtSignature }),
            } as any,
          })
        }
      }

      if (msg.role === 'tool' && msg.toolCallId) {
        const functionName =
          toolCallIdToName.get(msg.toolCallId) || msg.toolCallId
        parts.push({
          functionResponse: {
            id: msg.toolCallId,
            name: functionName,
            response: {
              content: msg.content || '',
            },
          } as any,
        })
      }

      return {
        role,
        parts: parts.length > 0 ? parts : [{ text: '' }],
      }
    })

    // Post-process: Gemini requires strictly alternating user/model roles.
    // Tool results are mapped to role:'user', which can create consecutive
    // user messages when followed by a new user message. Merge them.
    return this.mergeConsecutiveSameRoleMessages(formatted)
  }

  /**
   * Merge consecutive messages of the same role into a single message.
   * Gemini's API requires strictly alternating user/model roles.
   * Tool results are mapped to role:'user', which can collide with actual
   * user messages in multi-turn conversations.
   *
   * Also filters out empty model messages (e.g., from a previous failed request)
   * and deduplicates functionResponse parts with the same name (tool call ID).
   */
  private mergeConsecutiveSameRoleMessages(
    messages: Array<Content>,
  ): Array<Content> {
    const merged: Array<Content> = []

    for (const msg of messages) {
      const parts = msg.parts || []

      // Skip empty model messages (no parts or only empty text)
      if (msg.role === 'model') {
        const hasContent =
          parts.length > 0 &&
          !parts.every(
            (p) => 'text' in p && (p as { text: string }).text === '',
          )
        if (!hasContent) {
          continue
        }
      }

      const prev = merged[merged.length - 1]
      if (prev && prev.role === msg.role) {
        // Merge parts arrays
        prev.parts = [...(prev.parts || []), ...parts]
      } else {
        merged.push({ ...msg, parts: [...parts] })
      }
    }

    // Deduplicate functionResponse parts with the same name (tool call ID)
    for (const msg of merged) {
      if (!msg.parts) continue
      const seenFunctionResponseNames = new Set<string>()
      msg.parts = msg.parts.filter((part) => {
        if ('functionResponse' in part && part.functionResponse?.name) {
          if (seenFunctionResponseNames.has(part.functionResponse.name)) {
            return false
          }
          seenFunctionResponseNames.add(part.functionResponse.name)
        }
        return true
      })
    }

    return merged
  }

  private mapCommonOptionsToGemini(
    options: TextOptions<GeminiTextProviderOptions>,
  ) {
    const modelOpts = options.modelOptions
    const thinkingConfig = modelOpts?.thinkingConfig
    const requestOptions: GenerateContentParameters = {
      model: options.model,
      contents: this.formatMessages(options.messages),
      config: {
        ...modelOpts,
        temperature: options.temperature,
        topP: options.topP,
        maxOutputTokens: options.maxTokens,
        thinkingConfig: thinkingConfig
          ? {
              ...thinkingConfig,
              thinkingLevel: thinkingConfig.thinkingLevel
                ? // Enum is provided by the SDK, we use it for the type but cast it to string constants, here we just cast them back
                  (thinkingConfig.thinkingLevel as ThinkingLevel)
                : undefined,
            }
          : undefined,
        systemInstruction: options.systemPrompts?.join('\n'),
        tools: convertToolsToProviderFormat(options.tools),
      },
    }

    return requestOptions
  }
}

/**
 * Creates a Gemini text adapter with explicit API key.
 * Type resolution happens here at the call site.
 */
export function createGeminiChat<TModel extends (typeof GEMINI_MODELS)[number]>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiTextConfig, 'apiKey'>,
): GeminiTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  ResolveToolCapabilities<TModel>
> {
  return new GeminiTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Gemini text adapter with automatic API key detection.
 * Type resolution happens here at the call site.
 */
export function geminiText<TModel extends (typeof GEMINI_MODELS)[number]>(
  model: TModel,
  config?: Omit<GeminiTextConfig, 'apiKey'>,
): GeminiTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  ResolveToolCapabilities<TModel>
> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiChat(model, apiKey, config)
}
