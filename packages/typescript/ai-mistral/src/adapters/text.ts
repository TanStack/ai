import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools'
import {
  createMistralClient,
  generateId,
  getMistralApiKeyFromEnv,
  makeMistralStructuredOutputCompatible,
  transformNullsToUndefined,
} from '../utils'
import type {
  ContentPart,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type {
  MISTRAL_CHAT_MODELS,
  MistralChatModelProviderOptionsByName,
  MistralModelInputModalitiesByName,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { Mistral } from '@mistralai/mistralai'
import type { ChatCompletionStreamRequest } from '@mistralai/mistralai/models/components'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  MistralImageMetadata,
  MistralMessageMetadataByModality,
} from '../message-types'
import type { MistralClientConfig } from '../utils'

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

/**
 * Parse the accumulated streaming arguments for a tool call. Throws a clear
 * error if the JSON is malformed — silently substituting `{}` would let a
 * tool fire with empty inputs, masking truncated streams or mis-shaped output.
 */
function parseToolCallInput(toolCall: {
  id: string
  name: string
  arguments: string
}): unknown {
  if (!toolCall.arguments) return {}
  try {
    return transformNullsToUndefined(JSON.parse(toolCall.arguments))
  } catch (cause) {
    const preview = toolCall.arguments.slice(0, 200)
    const ellipsis = toolCall.arguments.length > 200 ? '...' : ''
    throw new Error(
      `Failed to parse tool call arguments for tool '${toolCall.name}' (id: ${toolCall.id}). Arguments: ${preview}${ellipsis}`,
      { cause },
    )
  }
}

/**
 * Configuration for Mistral text adapter.
 */
export type MistralTextConfig = MistralClientConfig

/**
 * Alias for TextProviderOptions for external use.
 */
export type MistralTextProviderOptions = ExternalTextProviderOptions

// ===========================
// Type Resolution Helpers
// ===========================

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof MistralChatModelProviderOptionsByName
    ? MistralChatModelProviderOptionsByName[TModel]
    : MistralTextProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof MistralModelInputModalitiesByName
    ? MistralModelInputModalitiesByName[TModel]
    : readonly ['text']

// ===========================
// Wire-format chunk types
// ===========================

/**
 * Snake-case shape of a Mistral chat completion stream chunk as returned on the
 * wire. We bypass the SDK's `chat.stream` because its Zod validation rejects
 * tool-call argument deltas that omit `function.name` (only the first chunk in
 * a tool call carries the name).
 */
interface MistralRawToolCall {
  id?: string
  type?: string
  index?: number
  function?: {
    name?: string
    arguments?: string | Record<string, unknown>
  }
}

interface MistralRawChoice {
  index?: number
  delta?: {
    role?: string | null
    content?:
      | string
      | Array<{
          type: string
          text?: string
          // Mistral magistral models stream reasoning as content parts of
          // type 'thinking' whose `thinking` field is itself an array of
          // text/reference chunks. See Mistral SDK ThinkChunk type.
          thinking?: Array<{ type: string; text?: string }>
        }>
      | null
    // Some OpenAI-compatible deployments (DeepSeek, Groq for reasoning
    // models, and aimock-based test environments) emit reasoning via a
    // separate `reasoning_content` delta field rather than as a content
    // part. Accept both shapes — they cannot collide because real Mistral
    // never sets the OpenAI-compat field, and aimock never sets the
    // thinking content part.
    reasoning_content?: string | null
    tool_calls?: Array<MistralRawToolCall>
  }
  finish_reason?: string | null
}

interface MistralRawChunk {
  id?: string
  model?: string
  choices?: Array<MistralRawChoice>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

// ===========================
// Adapter Implementation
// ===========================

/**
 * Mistral Text (Chat) Adapter.
 *
 * Tree-shakeable adapter for Mistral chat/text completion functionality.
 */
export class MistralTextAdapter<
  TModel extends (typeof MISTRAL_CHAT_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  MistralMessageMetadataByModality
> {
  readonly name = 'mistral' as const

  private client: Mistral
  private rawConfig: MistralClientConfig

  constructor(config: MistralTextConfig, model: TModel) {
    super(config, model)
    // The SDK client is retained for `structuredOutput` (non-streaming). The
    // streaming path bypasses the SDK and uses `fetchRawMistralStream` because
    // the SDK's Zod schemas reject partial tool-call argument deltas.
    this.client = createMistralClient(config)
    this.rawConfig = config
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToMistral(options)
    const timestamp = Date.now()

    const aguiState = {
      runId: options.runId ?? generateId(this.name),
      threadId: options.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    try {
      const stream = this.fetchRawMistralStream(requestParams, this.rawConfig)
      yield* this.processMistralStreamChunks(stream, options, aguiState)
    } catch (error: unknown) {
      const err = error as Error & { code?: string }

      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield asChunk({
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: options.model,
          timestamp,
        })
      }

      yield asChunk({
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        message: err.message || 'Unknown error',
        code: err.code,
        error: {
          message: err.message || 'Unknown error',
          code: err.code,
        },
      })

      throw err
    }
  }

  /**
   * Generate structured output using Mistral's JSON Schema response format.
   */
  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { stream: _stream, ...nonStreamParams } =
      this.mapTextOptionsToMistral(chatOptions)

    const jsonSchema = makeMistralStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    const response = await this.client.chat.complete({
      ...nonStreamParams,
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'structured_output',
          schemaDefinition: jsonSchema,
          strict: true,
        },
      },
    })

    const rawText = response.choices[0]?.message?.content
    const textContent = typeof rawText === 'string' ? rawText : ''

    let parsed: unknown
    try {
      parsed = JSON.parse(textContent)
    } catch {
      throw new Error(
        `Failed to parse structured output as JSON. Content: ${textContent.slice(0, 200)}${textContent.length > 200 ? '...' : ''}`,
      )
    }

    return {
      data: transformNullsToUndefined(parsed),
      rawText: textContent,
    }
  }

  /**
   * Processes streaming chunks from the Mistral API and yields AG-UI stream events.
   */
  private async *processMistralStreamChunks(
    stream: AsyncIterable<MistralRawChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      timestamp: number
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    const timestamp = aguiState.timestamp
    let hasEmittedTextMessageStart = false
    let hasEmittedTextMessageEnd = false
    let hasEmittedToolCall = false
    let hasEmittedRunFinished = false
    let lastChunkModel = options.model

    // Reasoning lifecycle (magistral-* models stream `thinking` content
    // parts before any text). Mirrors the anthropic adapter's pattern:
    // open REASONING_* events on the first thinking delta, close them when
    // text/tool content begins or the run finishes.
    let reasoningMessageId: string | null = null
    let hasClosedReasoning = false

    const toolCallsInProgress = new Map<
      number,
      {
        id: string
        name: string
        arguments: string
        started: boolean
        ended: boolean
      }
    >()

    try {
      for await (const chunk of stream) {
        lastChunkModel = chunk.model || options.model
        const choice = chunk.choices?.[0]
        if (!choice) continue

        const chunkModel = chunk.model || options.model

        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield asChunk({
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model: chunkModel,
            timestamp,
          })
        }

        const delta = choice.delta
        const { text: deltaContent, thinking: deltaThinkingFromContent } =
          this.extractDeltaParts(delta?.content)
        // Reasoning may also arrive as a separate top-level field
        // (`delta.reasoning_content`) on OpenAI-compatible deployments.
        const deltaThinking =
          deltaThinkingFromContent +
          (typeof delta?.reasoning_content === 'string'
            ? delta.reasoning_content
            : '')
        const deltaToolCalls = delta?.tool_calls

        // Emit reasoning events FIRST so they always precede the matching
        // text or tool deltas in the same chunk.
        if (deltaThinking) {
          if (reasoningMessageId === null) {
            reasoningMessageId = generateId(this.name)
            yield asChunk({
              type: 'REASONING_START',
              messageId: reasoningMessageId,
              model: chunkModel,
              timestamp,
            })
            yield asChunk({
              type: 'REASONING_MESSAGE_START',
              messageId: reasoningMessageId,
              role: 'reasoning',
              model: chunkModel,
              timestamp,
            })
          }
          yield asChunk({
            type: 'REASONING_MESSAGE_CONTENT',
            messageId: reasoningMessageId,
            model: chunkModel,
            timestamp,
            delta: deltaThinking,
          })
        }

        // Close reasoning before any text/tool output starts in this chunk.
        const aboutToEmitOutput =
          !!deltaContent || (!!deltaToolCalls && deltaToolCalls.length > 0)
        if (
          reasoningMessageId !== null &&
          !hasClosedReasoning &&
          aboutToEmitOutput
        ) {
          hasClosedReasoning = true
          yield asChunk({
            type: 'REASONING_MESSAGE_END',
            messageId: reasoningMessageId,
            model: chunkModel,
            timestamp,
          })
          yield asChunk({
            type: 'REASONING_END',
            messageId: reasoningMessageId,
            model: chunkModel,
            timestamp,
          })
        }

        if (deltaContent) {
          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield asChunk({
              type: 'TEXT_MESSAGE_START',
              messageId: aguiState.messageId,
              model: chunkModel,
              timestamp,
              role: 'assistant',
            })
          }

          accumulatedContent += deltaContent

          yield asChunk({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model: chunkModel,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          })
        }

        if (deltaToolCalls) {
          for (let i = 0; i < deltaToolCalls.length; i++) {
            const toolCallDelta = deltaToolCalls[i]!
            const index = toolCallDelta.index ?? i

            if (!toolCallsInProgress.has(index)) {
              toolCallsInProgress.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: '',
                started: false,
                ended: false,
              })
            }

            const toolCall = toolCallsInProgress.get(index)!

            if (toolCallDelta.id) toolCall.id = toolCallDelta.id
            if (toolCallDelta.function?.name) {
              toolCall.name = toolCallDelta.function.name
            }

            const rawArgs = toolCallDelta.function?.arguments
            const argsDelta =
              rawArgs === undefined
                ? undefined
                : typeof rawArgs === 'string'
                  ? rawArgs
                  : JSON.stringify(rawArgs)

            if (argsDelta !== undefined) {
              toolCall.arguments += argsDelta
            }

            const justStarted =
              !!toolCall.id && !!toolCall.name && !toolCall.started
            if (justStarted) {
              toolCall.started = true
              yield asChunk({
                type: 'TOOL_CALL_START',
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: chunkModel,
                timestamp,
                index,
              })
              // Replay any args buffered before id+name arrived (including
              // this chunk's argsDelta, if any).
              if (toolCall.arguments.length > 0) {
                yield asChunk({
                  type: 'TOOL_CALL_ARGS',
                  toolCallId: toolCall.id,
                  model: chunkModel,
                  timestamp,
                  delta: toolCall.arguments,
                })
              }
            } else if (argsDelta !== undefined && toolCall.started) {
              yield asChunk({
                type: 'TOOL_CALL_ARGS',
                toolCallId: toolCall.id,
                model: chunkModel,
                timestamp,
                delta: argsDelta,
              })
            }
          }
        }

        const finishReason = choice.finish_reason
        if (finishReason) {
          if (finishReason === 'tool_calls' || toolCallsInProgress.size > 0) {
            for (const [, toolCall] of toolCallsInProgress) {
              if (
                !toolCall.started ||
                !toolCall.id ||
                !toolCall.name ||
                toolCall.ended
              ) {
                continue
              }

              const parsedInput = parseToolCallInput(toolCall)

              toolCall.ended = true
              hasEmittedToolCall = true
              yield asChunk({
                type: 'TOOL_CALL_END',
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: chunkModel,
                timestamp,
                input: parsedInput,
              })
            }
          }

          const computedFinishReason =
            finishReason === 'tool_calls' || hasEmittedToolCall
              ? 'tool_calls'
              : finishReason === 'length'
                ? 'length'
                : 'stop'

          // If the run finished while reasoning was still open (no text or
          // tool output ever followed), close reasoning before TEXT/RUN
          // finalization events.
          if (reasoningMessageId !== null && !hasClosedReasoning) {
            hasClosedReasoning = true
            yield asChunk({
              type: 'REASONING_MESSAGE_END',
              messageId: reasoningMessageId,
              model: chunkModel,
              timestamp,
            })
            yield asChunk({
              type: 'REASONING_END',
              messageId: reasoningMessageId,
              model: chunkModel,
              timestamp,
            })
          }

          if (hasEmittedTextMessageStart && !hasEmittedTextMessageEnd) {
            hasEmittedTextMessageEnd = true
            yield asChunk({
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: chunkModel,
              timestamp,
            })
          }

          const usage = chunk.usage
          hasEmittedRunFinished = true
          yield asChunk({
            type: 'RUN_FINISHED',
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model: chunkModel,
            timestamp,
            usage: usage
              ? {
                  promptTokens: usage.prompt_tokens || 0,
                  completionTokens: usage.completion_tokens || 0,
                  totalTokens: usage.total_tokens || 0,
                }
              : undefined,
            finishReason: computedFinishReason,
          })
        }
      }

      // Stream ended cleanly without finish_reason — flush any open
      // lifecycle events so consumers don't see orphaned starts. This
      // happens for abrupt `[DONE]` or upstream cuts.
      if (!hasEmittedRunFinished) {
        if (reasoningMessageId !== null && !hasClosedReasoning) {
          hasClosedReasoning = true
          yield asChunk({
            type: 'REASONING_MESSAGE_END',
            messageId: reasoningMessageId,
            model: lastChunkModel,
            timestamp,
          })
          yield asChunk({
            type: 'REASONING_END',
            messageId: reasoningMessageId,
            model: lastChunkModel,
            timestamp,
          })
        }
        for (const [, toolCall] of toolCallsInProgress) {
          if (toolCall.started && !toolCall.ended) {
            toolCall.ended = true
            hasEmittedToolCall = true
            yield asChunk({
              type: 'TOOL_CALL_END',
              toolCallId: toolCall.id,
              toolCallName: toolCall.name,
              toolName: toolCall.name,
              model: lastChunkModel,
              timestamp,
              input: parseToolCallInput(toolCall),
            })
          }
        }
        if (hasEmittedTextMessageStart && !hasEmittedTextMessageEnd) {
          hasEmittedTextMessageEnd = true
          yield asChunk({
            type: 'TEXT_MESSAGE_END',
            messageId: aguiState.messageId,
            model: lastChunkModel,
            timestamp,
          })
        }
        hasEmittedRunFinished = true
        yield asChunk({
          type: 'RUN_FINISHED',
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: lastChunkModel,
          timestamp,
          usage: undefined,
          finishReason: hasEmittedToolCall ? 'tool_calls' : 'stop',
        })
      }
    } catch (error: unknown) {
      // Lifecycle cleanup (TEXT_MESSAGE_END / TOOL_CALL_END / REASONING_END)
      // on error path so consumers don't see orphaned starts. RUN_ERROR is
      // emitted by the outer chatStream catch — emitting it here would
      // duplicate the event.
      if (reasoningMessageId !== null && !hasClosedReasoning) {
        hasClosedReasoning = true
        yield asChunk({
          type: 'REASONING_MESSAGE_END',
          messageId: reasoningMessageId,
          model: lastChunkModel,
          timestamp,
        })
        yield asChunk({
          type: 'REASONING_END',
          messageId: reasoningMessageId,
          model: lastChunkModel,
          timestamp,
        })
      }
      if (hasEmittedTextMessageStart && !hasEmittedTextMessageEnd) {
        hasEmittedTextMessageEnd = true
        yield asChunk({
          type: 'TEXT_MESSAGE_END',
          messageId: aguiState.messageId,
          model: lastChunkModel,
          timestamp,
        })
      }
      for (const [, toolCall] of toolCallsInProgress) {
        if (toolCall.started && !toolCall.ended) {
          toolCall.ended = true
          // Best-effort parse for the partial args; if invalid, surface
          // empty input rather than throwing inside the cleanup path.
          let partialInput: unknown = {}
          try {
            partialInput = toolCall.arguments
              ? transformNullsToUndefined(JSON.parse(toolCall.arguments))
              : {}
          } catch {
            partialInput = {}
          }
          yield asChunk({
            type: 'TOOL_CALL_END',
            toolCallId: toolCall.id,
            toolCallName: toolCall.name,
            toolName: toolCall.name,
            model: lastChunkModel,
            timestamp,
            input: partialInput,
          })
        }
      }
      throw error
    }
  }

  /**
   * Makes a raw fetch request to the Mistral chat completions endpoint and
   * parses the SSE stream manually, bypassing the SDK's Zod validation which
   * rejects streaming tool call chunks that omit `name` in argument deltas.
   */
  private async *fetchRawMistralStream(
    params: ChatCompletionStreamRequest,
    config: MistralClientConfig,
  ): AsyncGenerator<MistralRawChunk> {
    const serverURL = (config.serverURL ?? 'https://api.mistral.ai')
      .replace(/\/+$/, '')
      .replace(/\/v1$/, '')
    const url = `${serverURL}/v1/chat/completions`

    const body = this.toWireBody(params)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...config.defaultHeaders,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Mistral API error ${response.status}: ${errorText}`)
    }

    if (!response.body) {
      throw new Error(
        'Mistral API returned a response with no body. This may indicate a proxy or runtime that does not support streaming.',
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trimStart()
          if (data === '[DONE]') return

          let parsed: unknown
          try {
            parsed = JSON.parse(data)
          } catch (e) {
            if (e instanceof SyntaxError) {
              console.warn(
                `[mistral] skipped unparseable SSE chunk: ${data.slice(0, 200)}`,
              )
              continue
            }
            throw e
          }

          // Mistral signals mid-stream errors via an `error` field. Surface
          // them as RUN_ERROR rather than swallowing them as empty chunks.
          if (
            parsed &&
            typeof parsed === 'object' &&
            'error' in parsed &&
            !('choices' in parsed)
          ) {
            const errPayload = (parsed as { error: unknown }).error
            const message =
              typeof errPayload === 'string'
                ? errPayload
                : errPayload &&
                    typeof errPayload === 'object' &&
                    'message' in errPayload
                  ? String((errPayload as { message: unknown }).message)
                  : JSON.stringify(errPayload)
            throw new Error(`Mistral stream error: ${message}`)
          }

          yield parsed as MistralRawChunk
        }
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }

  /**
   * Converts the SDK's camelCase `ChatCompletionStreamRequest` into the
   * snake_case wire body, including converting messages.
   */
  private toWireBody(
    params: ChatCompletionStreamRequest,
  ): Record<string, unknown> {
    const {
      messages,
      maxTokens,
      topP,
      randomSeed,
      responseFormat,
      toolChoice,
      parallelToolCalls,
      frequencyPenalty,
      presencePenalty,
      safePrompt,
      stream: _stream,
      ...rest
    } = params

    return {
      ...rest,
      messages: messages.map(messageToWire),
      stream: true,
      // Opt in to usage on the final streaming chunk.
      stream_options: { include_usage: true },
      ...(maxTokens != null && { max_tokens: maxTokens }),
      ...(topP != null && { top_p: topP }),
      ...(randomSeed != null && { random_seed: randomSeed }),
      ...(responseFormat != null && { response_format: responseFormat }),
      ...(toolChoice != null && { tool_choice: toolChoice }),
      ...(parallelToolCalls != null && {
        parallel_tool_calls: parallelToolCalls,
      }),
      ...(frequencyPenalty != null && { frequency_penalty: frequencyPenalty }),
      ...(presencePenalty != null && { presence_penalty: presencePenalty }),
      ...(safePrompt != null && { safe_prompt: safePrompt }),
    }
  }

  /**
   * Splits a Mistral delta content payload into text and reasoning deltas.
   * Mistral reasoning models (magistral-*) stream reasoning content as
   * `{ type: 'thinking', thinking: [{ type: 'text', text }, ...] }` content
   * parts. A single delta may contain text only, thinking only, or — rarely —
   * both (when a step transitions); both fields are returned so the caller
   * can sequence REASONING and TEXT lifecycle events in order.
   */
  private extractDeltaParts(
    content:
      | string
      | Array<{
          type: string
          text?: string
          thinking?: Array<{ type: string; text?: string }>
        }>
      | null
      | undefined,
  ): { text: string; thinking: string } {
    if (!content) return { text: '', thinking: '' }
    if (typeof content === 'string') return { text: content, thinking: '' }

    let text = ''
    let thinking = ''
    for (const part of content) {
      if (part.type === 'text' && typeof part.text === 'string') {
        text += part.text
      } else if (part.type === 'thinking' && Array.isArray(part.thinking)) {
        for (const inner of part.thinking) {
          if (inner.type === 'text' && typeof inner.text === 'string') {
            thinking += inner.text
          }
        }
      }
    }
    return { text, thinking }
  }

  /**
   * Maps common TextOptions to Mistral Chat Completions request parameters.
   */
  private mapTextOptionsToMistral(
    options: TextOptions<TProviderOptions>,
  ): ChatCompletionStreamRequest {
    const modelOptions = options.modelOptions as
      | Omit<InternalTextProviderOptions, 'max_tokens' | 'tools'>
      | undefined

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const messages: Array<ChatCompletionMessageParam> = []

    if (options.systemPrompts && options.systemPrompts.length > 0) {
      messages.push({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    for (const message of options.messages) {
      messages.push(this.convertMessageToMistral(message))
    }

    return {
      model: options.model,
      messages: messages as ChatCompletionStreamRequest['messages'],
      temperature:
        options.temperature ?? modelOptions?.temperature ?? undefined,
      maxTokens: options.maxTokens,
      topP: options.topP ?? modelOptions?.top_p ?? undefined,
      tools: tools as ChatCompletionStreamRequest['tools'],
      stream: true,
      ...(modelOptions && {
        ...(modelOptions.stop != null && { stop: modelOptions.stop }),
        ...(modelOptions.random_seed != null && {
          randomSeed: modelOptions.random_seed,
        }),
        ...(modelOptions.response_format != null && {
          responseFormat:
            modelOptions.response_format as ChatCompletionStreamRequest['responseFormat'],
        }),
        ...(modelOptions.tool_choice != null && {
          toolChoice:
            modelOptions.tool_choice as ChatCompletionStreamRequest['toolChoice'],
        }),
        ...(modelOptions.parallel_tool_calls != null && {
          parallelToolCalls: modelOptions.parallel_tool_calls,
        }),
        ...(modelOptions.frequency_penalty != null && {
          frequencyPenalty: modelOptions.frequency_penalty,
        }),
        ...(modelOptions.presence_penalty != null && {
          presencePenalty: modelOptions.presence_penalty,
        }),
        ...(modelOptions.n != null && { n: modelOptions.n }),
        ...(modelOptions.prediction != null && {
          prediction: modelOptions.prediction,
        }),
        ...(modelOptions.safe_prompt != null && {
          safePrompt: modelOptions.safe_prompt,
        }),
      }),
    }
  }

  /**
   * Converts a TanStack AI ModelMessage to a Mistral ChatCompletionMessageParam.
   */
  private convertMessageToMistral(
    message: ModelMessage,
  ): ChatCompletionMessageParam {
    if (message.role === 'tool') {
      if (!message.toolCallId) {
        throw new Error('Missing toolCallId for tool message')
      }
      return {
        role: 'tool',
        toolCallId: message.toolCallId,
        content:
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content),
      }
    }

    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments),
        },
      }))

      return {
        role: 'assistant',
        content: this.extractTextContent(message.content),
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      }
    }

    const contentParts = this.normalizeContent(message.content)

    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
      return {
        role: 'user',
        content: contentParts[0].content,
      }
    }

    const parts = contentParts.map((part) =>
      this.convertContentPartToMistral(part),
    )

    return {
      role: 'user',
      content: parts.length > 0 ? parts : '',
    }
  }

  /**
   * Converts a ContentPart to a Mistral content part. Returns undefined for
   * unsupported part types.
   */
  private convertContentPartToMistral(
    part: ContentPart,
  ): ChatCompletionContentPart {
    if (part.type === 'text') {
      return { type: 'text', text: part.content }
    }

    if (part.type === 'image') {
      const imageMetadata = part.metadata as MistralImageMetadata | undefined
      const imageValue = part.source.value
      const imageUrl =
        part.source.type === 'data' && !imageValue.startsWith('data:')
          ? `data:${part.source.mimeType};base64,${imageValue}`
          : imageValue
      return {
        type: 'image_url',
        imageUrl: imageMetadata?.detail
          ? { url: imageUrl, detail: imageMetadata.detail }
          : imageUrl,
      }
    }

    throw new Error(
      `Mistral text adapter does not support content part of type '${(part as ContentPart).type}'. Supported types: text, image. Use a vision-capable model (pixtral-large-latest, pixtral-12b-2409, mistral-medium-latest, or mistral-small-latest) for images.`,
    )
  }

  /**
   * Normalizes message content to an array of ContentPart.
   */
  private normalizeContent(
    content: string | null | Array<ContentPart>,
  ): Array<ContentPart> {
    if (content === null) return []
    if (typeof content === 'string') return [{ type: 'text', content }]
    return content
  }

  /**
   * Extracts text content from a content value that may be string, null, or ContentPart array.
   */
  private extractTextContent(
    content: string | null | Array<ContentPart>,
  ): string {
    if (content === null) return ''
    if (typeof content === 'string') return content
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}

/**
 * Snake-cases a Mistral SDK message into the wire format expected by the API.
 */
function messageToWire(msg: ChatCompletionStreamRequest['messages'][number]) {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: msg.toolCallId,
      content: msg.content,
      ...(msg.name !== undefined ? { name: msg.name } : {}),
    }
  }
  if (msg.role === 'assistant') {
    const base: Record<string, unknown> = {
      role: 'assistant',
      content: msg.content ?? null,
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      base.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type ?? 'function',
        function: tc.function,
      }))
    }
    if (msg.prefix !== undefined) base.prefix = msg.prefix
    return base
  }
  if (msg.role === 'user' && Array.isArray(msg.content)) {
    return {
      role: 'user',
      content: msg.content.map((part) => {
        if (part.type === 'image_url') {
          return { type: 'image_url', image_url: part.imageUrl }
        }
        if (part.type === 'document_url') {
          return { type: 'document_url', document_url: part.documentUrl }
        }
        return part
      }),
    }
  }
  return msg
}

/**
 * Creates a Mistral text adapter with explicit API key.
 *
 * @param model - The model name (e.g., 'mistral-large-latest')
 * @param apiKey - Your Mistral API key
 * @param config - Optional additional configuration
 * @returns Configured Mistral text adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createMistralText('mistral-large-latest', 'api_key');
 * ```
 */
export function createMistralText<
  TModel extends (typeof MISTRAL_CHAT_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<MistralTextConfig, 'apiKey'>,
): MistralTextAdapter<TModel> {
  return new MistralTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Mistral text adapter using the `MISTRAL_API_KEY` environment variable.
 *
 * @param model - The model name (e.g., 'mistral-large-latest')
 * @param config - Optional configuration (excluding apiKey)
 * @returns Configured Mistral text adapter instance
 * @throws Error if MISTRAL_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * const adapter = mistralText('mistral-large-latest');
 * ```
 */
export function mistralText<
  TModel extends (typeof MISTRAL_CHAT_MODELS)[number],
>(
  model: TModel,
  config?: Omit<MistralTextConfig, 'apiKey'>,
): MistralTextAdapter<TModel> {
  const apiKey = getMistralApiKeyFromEnv()
  return createMistralText(model, apiKey, config)
}
