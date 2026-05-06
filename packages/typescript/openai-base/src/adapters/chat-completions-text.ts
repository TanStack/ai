import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId, transformNullsToUndefined } from '@tanstack/ai-utils'
import { createOpenAICompatibleClient } from '../utils/client'
import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import { convertToolsToChatCompletionsFormat } from './chat-completions-tool-converter'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type OpenAI_SDK from 'openai'
import type {
  ContentPart,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { OpenAICompatibleClientConfig } from '../types/config'

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

/**
 * OpenAI-compatible Chat Completions Text Adapter
 *
 * A generalized base class for providers that use the OpenAI Chat Completions API
 * (`/v1/chat/completions`). Providers like Grok, Groq, OpenRouter, and others can
 * extend this class and only need to:
 * - Set `baseURL` in the config
 * - Lock the generic type parameters to provider-specific types
 * - Override specific methods for quirks
 *
 * All methods that build requests or process responses are `protected` so subclasses
 * can override them.
 */
export class OpenAICompatibleChatCompletionsTextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, any> = Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TMessageMetadata extends DefaultMessageMetadataByModality =
    DefaultMessageMetadataByModality,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TMessageMetadata,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name: string

  protected client: OpenAI_SDK

  constructor(
    config: OpenAICompatibleClientConfig,
    model: TModel,
    name: string = 'openai-compatible',
  ) {
    super({}, model)
    this.name = name
    this.client = createOpenAICompatibleClient(config)
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const requestParams = this.mapOptionsToRequest(options)
    const timestamp = Date.now()

    // AG-UI lifecycle tracking (mutable state object for ESLint compatibility)
    const aguiState = {
      runId: generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    try {
      const stream = await this.client.chat.completions.create(
        {
          ...requestParams,
          stream: true,
          stream_options: { include_usage: true },
        },
        {
          headers: (options.request as RequestInit | undefined)?.headers as
            | Record<string, string>
            | undefined,
          signal: (options.request as RequestInit | undefined)?.signal,
        },
      )

      yield* this.processStreamChunks(stream, options, aguiState)
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      const errorPayload = toRunErrorPayload(
        error,
        `${this.name}.chatStream failed`,
      )

      // Emit RUN_STARTED if not yet emitted
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield asChunk({
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          model: options.model,
          timestamp,
        })
      }

      // Emit AG-UI RUN_ERROR
      yield asChunk({
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        error: errorPayload,
      })

      options.logger.errors(`${this.name}.chatStream fatal`, {
        error: errorPayload,
        source: `${this.name}.chatStream`,
      })
    }
  }

  /**
   * Generate structured output using the provider's JSON Schema response format.
   * Uses stream: false to get the complete response in one call.
   *
   * OpenAI-compatible APIs have strict requirements for structured output:
   * - All properties must be in the `required` array
   * - Optional fields should have null added to their type union
   * - additionalProperties must be false for all objects
   *
   * The outputSchema is already JSON Schema (converted in the ai layer).
   * We apply provider-specific transformations for structured output compatibility.
   */
  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapOptionsToRequest(chatOptions)

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required || [],
    )

    try {
      // Strip stream_options which is only valid for streaming calls
      const {
        stream_options: _,
        stream: __,
        ...cleanParams
      } = requestParams as any
      const response = await this.client.chat.completions.create(
        {
          ...cleanParams,
          stream: false,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'structured_output',
              schema: jsonSchema,
              strict: true,
            },
          },
        },
        {
          headers: (chatOptions.request as RequestInit | undefined)?.headers as
            | Record<string, string>
            | undefined,
          signal: (chatOptions.request as RequestInit | undefined)?.signal,
        },
      )

      // Extract text content from the response
      const rawText = response.choices[0]?.message.content || ''

      // Parse the JSON response
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      // Transform null values to undefined to match original Zod schema expectations
      // Provider returns null for optional fields we made nullable in the schema
      const transformed = transformNullsToUndefined(parsed)

      return {
        data: transformed,
        rawText,
      }
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      chatOptions.logger.errors(`${this.name}.structuredOutput fatal`, {
        error: toRunErrorPayload(error, `${this.name}.structuredOutput failed`),
        source: `${this.name}.structuredOutput`,
      })
      throw error
    }
  }

  /**
   * Applies provider-specific transformations for structured output compatibility.
   * Override this in subclasses to handle provider-specific quirks.
   */
  protected makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired: Array<string>,
  ): Record<string, any> {
    return makeStructuredOutputCompatible(schema, originalRequired)
  }

  /**
   * Processes streamed chunks from the Chat Completions API and yields AG-UI events.
   * Override this in subclasses to handle provider-specific stream behavior.
   */
  protected async *processStreamChunks(
    stream: AsyncIterable<OpenAI_SDK.Chat.Completions.ChatCompletionChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      messageId: string
      timestamp: number
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    const timestamp = aguiState.timestamp
    let hasEmittedTextMessageStart = false
    let lastModel: string | undefined
    // Track usage from any chunk that carries it. With
    // `stream_options: { include_usage: true }` OpenAI emits a terminal chunk
    // whose `choices` is `[]` and only the `usage` field is populated; the
    // earlier `finish_reason` chunk does NOT include token counts. We must
    // therefore defer RUN_FINISHED until the iterator is exhausted so we can
    // pick up usage from the trailing chunk regardless of arrival order.
    let lastUsage:
      | OpenAI_SDK.Chat.Completions.ChatCompletionChunk['usage']
      | undefined
    let pendingFinishReason:
      | OpenAI_SDK.Chat.Completions.ChatCompletionChunk.Choice['finish_reason']
      | undefined

    // Track tool calls being streamed (arguments come in chunks)
    const toolCallsInProgress = new Map<
      number,
      {
        id: string
        name: string
        arguments: string
        started: boolean // Track if TOOL_CALL_START has been emitted
      }
    >()

    try {
      for await (const chunk of stream) {
        // Capture usage from any chunk (including the terminal usage-only
        // chunk emitted when `stream_options.include_usage` is on).
        if (chunk.usage) {
          lastUsage = chunk.usage
        }
        if (chunk.model) {
          lastModel = chunk.model
        }

        // Emit RUN_STARTED on the first chunk of any kind so callers see a
        // run lifecycle even on streams that arrive entirely as usage-only
        // (no choices). Without this, a usage-first stream would skip
        // RUN_STARTED via `if (!choice) continue` below and the post-loop
        // synthetic block would also skip RUN_FINISHED (it gates on
        // `hasEmittedRunStarted`).
        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield asChunk({
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            model: chunk.model || options.model,
            timestamp,
          })
        }

        const choice = chunk.choices[0]

        if (!choice) continue

        const delta = choice.delta
        const deltaContent = delta.content
        const deltaToolCalls = delta.tool_calls

        // Handle content delta
        if (deltaContent) {
          // Emit TEXT_MESSAGE_START on first text content
          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield asChunk({
              type: 'TEXT_MESSAGE_START',
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp,
              role: 'assistant',
            })
          }

          accumulatedContent += deltaContent

          // Emit AG-UI TEXT_MESSAGE_CONTENT
          yield asChunk({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model: chunk.model || options.model,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          })
        }

        // Handle tool calls - they come in as deltas
        if (deltaToolCalls) {
          for (const toolCallDelta of deltaToolCalls) {
            const index = toolCallDelta.index

            // Initialize or update the tool call in progress
            if (!toolCallsInProgress.has(index)) {
              toolCallsInProgress.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: '',
                started: false,
              })
            }

            const toolCall = toolCallsInProgress.get(index)!

            // Update with any new data from the delta
            if (toolCallDelta.id) {
              toolCall.id = toolCallDelta.id
            }
            if (toolCallDelta.function?.name) {
              toolCall.name = toolCallDelta.function.name
            }
            if (toolCallDelta.function?.arguments) {
              toolCall.arguments += toolCallDelta.function.arguments
            }

            // Emit TOOL_CALL_START when we have id and name
            if (toolCall.id && toolCall.name && !toolCall.started) {
              toolCall.started = true
              yield asChunk({
                type: 'TOOL_CALL_START',
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp,
                index,
              })
            }

            // Emit TOOL_CALL_ARGS for argument deltas
            if (toolCallDelta.function?.arguments && toolCall.started) {
              yield asChunk({
                type: 'TOOL_CALL_ARGS',
                toolCallId: toolCall.id,
                model: chunk.model || options.model,
                timestamp,
                delta: toolCallDelta.function.arguments,
              })
            }
          }
        }

        // Handle finish reason. We DO emit TOOL_CALL_END and TEXT_MESSAGE_END
        // here because the corresponding _START events have already fired,
        // and tool execution downstream wants to begin as soon as possible.
        // RUN_FINISHED is deferred until the iterator is fully exhausted so
        // we can capture the trailing usage chunk that arrives AFTER this
        // chunk when stream_options.include_usage is on.
        if (choice.finish_reason) {
          // Track whether ANY tool call actually got a start event so we can
          // distinguish "tool-using run" from "stream had partial deltas but
          // never completed a tool call" — the latter must NOT report
          // tool_calls and must NOT emit TOOL_CALL_END for unstarted entries.
          let emittedAnyToolCallEnd = false
          if (
            choice.finish_reason === 'tool_calls' ||
            toolCallsInProgress.size > 0
          ) {
            for (const [, toolCall] of toolCallsInProgress) {
              // Skip tool calls that never emitted TOOL_CALL_START — emitting
              // a stray TOOL_CALL_END here would violate AG-UI lifecycle
              // (END without matching START) for partial deltas where the
              // upstream never sent both id and name.
              if (!toolCall.started) continue

              // Parse arguments for TOOL_CALL_END. Surface parse failures via
              // the logger so a model emitting malformed JSON for tool args
              // is debuggable instead of silently invoking the tool with {}.
              // Non-object JSON (e.g. a bare string or number) is also coerced
              // to {} so downstream tool execution doesn't receive a primitive
              // input, mirroring the Responses adapter's guard.
              let parsedInput: unknown = {}
              if (toolCall.arguments) {
                try {
                  const parsed: unknown = JSON.parse(toolCall.arguments)
                  parsedInput =
                    parsed && typeof parsed === 'object' ? parsed : {}
                } catch (parseError) {
                  options.logger.errors(
                    `${this.name}.processStreamChunks tool-args JSON parse failed`,
                    {
                      error: toRunErrorPayload(
                        parseError,
                        `tool ${toolCall.name} (${toolCall.id}) returned malformed JSON arguments`,
                      ),
                      source: `${this.name}.processStreamChunks`,
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      rawArguments: toolCall.arguments,
                    },
                  )
                  parsedInput = {}
                }
              }

              // Emit AG-UI TOOL_CALL_END
              yield asChunk({
                type: 'TOOL_CALL_END',
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp,
                input: parsedInput,
              })
              emittedAnyToolCallEnd = true
            }
            // Clear tool-call state after emission so a subsequent
            // `finish_reason: 'stop'` chunk (or the post-loop synthetic
            // block) doesn't see lingering entries and misreport the finish.
            toolCallsInProgress.clear()
          }
          void emittedAnyToolCallEnd

          // Emit TEXT_MESSAGE_END if we had text content
          if (hasEmittedTextMessageStart) {
            yield asChunk({
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp,
            })
            hasEmittedTextMessageStart = false
          }

          // Remember the upstream finish_reason; RUN_FINISHED is emitted at
          // end-of-stream so we pick up the trailing usage-only chunk too.
          pendingFinishReason = choice.finish_reason
        }
      }

      // Emit a single terminal RUN_FINISHED after the iterator is exhausted.
      // This both delivers accurate token counts (the trailing usage chunk
      // may arrive AFTER the finish_reason chunk) and gives consumers a
      // guaranteed terminal event even when the upstream cuts off mid-stream
      // (no finish_reason chunk ever arrives).
      if (aguiState.hasEmittedRunStarted) {
        // Close any started tool calls that never got finish_reason. A
        // truncated stream that emitted TOOL_CALL_START but never reached
        // finish_reason would otherwise leave consumers with an unbalanced
        // start. Skip non-started entries (no matching START to close).
        let pendingToolCount = 0
        for (const [, toolCall] of toolCallsInProgress) {
          if (!toolCall.started) continue
          let parsedInput: unknown = {}
          if (toolCall.arguments) {
            try {
              const parsed: unknown = JSON.parse(toolCall.arguments)
              parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
            } catch {
              parsedInput = {}
            }
          }
          yield asChunk({
            type: 'TOOL_CALL_END',
            toolCallId: toolCall.id,
            toolCallName: toolCall.name,
            toolName: toolCall.name,
            model: lastModel || options.model,
            timestamp,
            input: parsedInput,
          })
          pendingToolCount += 1
        }
        toolCallsInProgress.clear()

        // Make sure the text message lifecycle is closed even on early
        // termination paths where finish_reason never arrives.
        if (hasEmittedTextMessageStart) {
          yield asChunk({
            type: 'TEXT_MESSAGE_END',
            messageId: aguiState.messageId,
            model: lastModel || options.model,
            timestamp,
          })
        }

        // Map upstream finish_reason to AG-UI's narrower vocabulary while
        // preserving the upstream value when it falls outside the AG-UI set.
        // Collapsing length / content_filter to 'stop' would hide why the
        // run terminated — surface it instead. Use `tool_calls` only when
        // the upstream actually said so OR when we just closed pending tool
        // calls (truncated stream); a clean `stop` with no started tool
        // calls must NOT be remapped to `tool_calls`.
        const finishReason: string =
          pendingFinishReason === 'tool_calls' || pendingToolCount > 0
            ? 'tool_calls'
            : (pendingFinishReason ?? 'stop')

        yield asChunk({
          type: 'RUN_FINISHED',
          runId: aguiState.runId,
          model: lastModel || options.model,
          timestamp,
          usage: lastUsage
            ? {
                promptTokens: lastUsage.prompt_tokens || 0,
                completionTokens: lastUsage.completion_tokens || 0,
                totalTokens: lastUsage.total_tokens || 0,
              }
            : undefined,
          finishReason,
        })
      }
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      const errorPayload = toRunErrorPayload(
        error,
        `${this.name}.processStreamChunks failed`,
      )
      options.logger.errors(`${this.name}.processStreamChunks fatal`, {
        error: errorPayload,
        source: `${this.name}.processStreamChunks`,
      })

      // Emit AG-UI RUN_ERROR
      yield asChunk({
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        error: errorPayload,
      })
    }
  }

  /**
   * Maps common TextOptions to Chat Completions API request format.
   * Override this in subclasses to add provider-specific options.
   */
  protected mapOptionsToRequest(
    options: TextOptions,
  ): OpenAI_SDK.Chat.Completions.ChatCompletionCreateParamsStreaming {
    const tools = options.tools
      ? convertToolsToChatCompletionsFormat(
          options.tools,
          this.makeStructuredOutputCompatible.bind(this),
        )
      : undefined

    // Build messages array with system prompts
    const messages: Array<OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam> =
      []

    // Add system prompts first
    if (options.systemPrompts && options.systemPrompts.length > 0) {
      messages.push({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    // Convert messages
    for (const message of options.messages) {
      messages.push(this.convertMessage(message))
    }

    const modelOptions = options.modelOptions

    // Build the request so explicit top-level options win over modelOptions
    // when set, but `undefined` top-level options do NOT clobber values the
    // caller put in modelOptions. Keeping the merge nullish-aware fixes the
    // silent regression where a `modelOptions: { temperature: 0.7 }` setting
    // was overwritten with `temperature: undefined`.
    return {
      ...modelOptions,
      model: options.model,
      messages,
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.maxTokens !== undefined && {
        max_tokens: options.maxTokens,
      }),
      ...(options.topP !== undefined && { top_p: options.topP }),
      // Conditional spread: `tools: undefined` would clobber any
      // modelOptions.tools the caller set above.
      ...(tools &&
        tools.length > 0 && {
          tools,
        }),
      stream: true,
    }
  }

  /**
   * Converts a single ModelMessage to the Chat Completions API message format.
   * Override this in subclasses to handle provider-specific message formats.
   */
  protected convertMessage(
    message: ModelMessage,
  ): OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam {
    // Handle tool messages
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId || '',
        content:
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content),
      }
    }

    // Handle assistant messages
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
      const hasToolCalls = !!toolCalls && toolCalls.length > 0
      const textContent = this.extractTextContent(message.content)

      // Per the OpenAI Chat Completions contract, an assistant message that
      // only carries tool_calls should have `content: null` (or omit content)
      // rather than `content: ''`. Empty-string content interacts oddly with
      // tokenization on some backends; null is the documented shape.
      return {
        role: 'assistant',
        content: hasToolCalls && !textContent ? null : textContent,
        ...(hasToolCalls ? { tool_calls: toolCalls } : {}),
      }
    }

    // Handle user messages - support multimodal content
    const contentParts = this.normalizeContent(message.content)

    // If only text, use simple string format
    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
      const text = contentParts[0].content
      if (text.length === 0) {
        // Single empty text part is the same fail-loud condition as below —
        // an empty paid request mask a real intent (caller passed `null`/'',
        // or an upstream step normalised everything to an empty string).
        throw new Error(
          `User message for ${this.name} has empty text content. ` +
            `Empty user messages would produce a paid request with no input; ` +
            `provide non-empty content or omit the message.`,
        )
      }
      return {
        role: 'user',
        content: text,
      }
    }

    // Otherwise, use array format for multimodal. Fail fast on unsupported
    // content parts rather than silently dropping them — a message of all
    // unsupported parts would otherwise turn into an empty user prompt and
    // mask a real capability mismatch.
    const parts: Array<OpenAI_SDK.Chat.Completions.ChatCompletionContentPart> =
      []
    for (const part of contentParts) {
      const converted = this.convertContentPart(part)
      if (!converted) {
        throw new Error(
          `Unsupported content part type for ${this.name}: ${part.type}. ` +
            `Override convertContentPart() in a subclass to handle this type, ` +
            `or remove it from the message.`,
        )
      }
      parts.push(converted)
    }

    if (parts.length === 0) {
      // The original message had no content parts at all (e.g. content was
      // explicitly null or []). Sending an empty user message to OpenAI
      // produces a paid request with no signal — fail loud instead.
      throw new Error(
        `User message for ${this.name} has no content parts. ` +
          `Empty user messages would produce a paid request with no input; ` +
          `provide at least one text/image/audio part or omit the message.`,
      )
    }

    return {
      role: 'user',
      content: parts,
    }
  }

  /**
   * Converts a single ContentPart to the Chat Completions API content part format.
   * Override this in subclasses to handle additional content types or provider-specific metadata.
   */
  protected convertContentPart(
    part: ContentPart,
  ): OpenAI_SDK.Chat.Completions.ChatCompletionContentPart | null {
    if (part.type === 'text') {
      return { type: 'text', text: part.content }
    }

    if (part.type === 'image') {
      const imageMetadata = part.metadata as
        | { detail?: 'auto' | 'low' | 'high' }
        | undefined

      // For base64 data, construct a data URI using the mimeType from source.
      // Default to a generic octet-stream MIME if the source didn't provide
      // one — interpolating `undefined` into the URI ("data:undefined;base64,
      // ...") would produce an invalid URI the API rejects.
      const imageValue = part.source.value
      const imageMime = part.source.mimeType || 'application/octet-stream'
      const imageUrl =
        part.source.type === 'data' && !imageValue.startsWith('data:')
          ? `data:${imageMime};base64,${imageValue}`
          : imageValue

      return {
        type: 'image_url',
        image_url: {
          url: imageUrl,
          detail: imageMetadata?.detail || 'auto',
        },
      }
    }

    // Unsupported content type — subclasses can override to handle more types
    return null
  }

  /**
   * Normalizes message content to an array of ContentPart.
   * Handles backward compatibility with string content.
   */
  protected normalizeContent(
    content: string | null | Array<ContentPart>,
  ): Array<ContentPart> {
    if (content === null) {
      return []
    }
    if (typeof content === 'string') {
      return [{ type: 'text', content: content }]
    }
    return content
  }

  /**
   * Extracts text content from a content value that may be string, null, or ContentPart array.
   */
  protected extractTextContent(
    content: string | null | Array<ContentPart>,
  ): string {
    if (content === null) {
      return ''
    }
    if (typeof content === 'string') {
      return content
    }
    // It's an array of ContentPart
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}
