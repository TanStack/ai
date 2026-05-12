import { EventType } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId, transformNullsToUndefined } from '@tanstack/ai-utils'
import { extractRequestOptions } from '../utils/request-options'
import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import { convertToolsToChatCompletionsFormat } from './chat-completions-tool-converter'
import type OpenAI from 'openai'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'
import type {
  ContentPart,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  RunFinishedEvent,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'

/**
 * Shared implementation of the OpenAI Chat Completions API. Holds the
 * stream-accumulator + AG-UI lifecycle logic and calls the OpenAI SDK
 * directly. Subclasses (ai-openai, ai-grok, ai-groq) construct an OpenAI
 * client with their provider-specific `baseURL` / headers and pass it in.
 */
export abstract class OpenAIBaseChatCompletionsTextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, unknown> = Record<string, unknown>,
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
  protected client: OpenAI

  constructor(model: TModel, name: string, client: OpenAI) {
    super({}, model)
    this.name = name
    this.client = client
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    // AG-UI lifecycle tracking (mutable state object for ESLint compatibility)
    const aguiState = {
      runId: generateId(this.name),
      threadId: options.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      hasEmittedRunStarted: false,
    }

    try {
      // mapOptionsToRequest can throw (e.g. fail-loud guards in convertMessage
      // for empty content or unsupported parts). Keep it inside the try so
      // those failures surface as a single RUN_ERROR event, matching every
      // other failure mode here — callers iterating chatStream then only need
      // one error-handling path instead of both a try/catch around iteration
      // and a RUN_ERROR handler.
      const requestParams = this.mapOptionsToRequest(options)
      options.logger.request(
        `activity=chat provider=${this.name} model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: this.name, model: this.model },
      )
      const stream = await this.client.chat.completions.create(
        {
          ...requestParams,
          stream: true,
          stream_options: { include_usage: true },
        },
        extractRequestOptions(options.request),
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
        yield {
          type: EventType.RUN_STARTED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: options.model,
          timestamp: Date.now(),
        }
      }

      // Emit AG-UI RUN_ERROR
      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        code: errorPayload.code,
        error: errorPayload,
      }

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
      outputSchema.required,
    )

    try {
      // Strip stream_options which is only valid for streaming calls
      const {
        stream_options: _,
        stream: __,
        ...cleanParams
      } = requestParams as any
      chatOptions.logger.request(
        `activity=structuredOutput provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
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
        extractRequestOptions(chatOptions.request),
      )

      // Extract text content from the response. Fail loud on empty content
      // rather than letting it cascade into a JSON-parse error on '' — the
      // root cause (the model returned no content for the structured request)
      // is then visible in logs.
      const rawText = response.choices[0]?.message.content
      if (typeof rawText !== 'string' || rawText.length === 0) {
        throw new Error(
          `${this.name}.structuredOutput: response contained no content`,
        )
      }

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
      // Provider returns null for optional fields we made nullable in the schema.
      // Subclasses can override `transformStructuredOutput` to skip this — e.g.
      // OpenRouter historically passed nulls through unchanged.
      const transformed = this.transformStructuredOutput(parsed)

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
   * Stream structured output. Single Chat Completions request with
   * `response_format: json_schema` + `stream: true`. Emits the standard
   * AG-UI lifecycle (`RUN_STARTED` → `REASONING_*?` → `TEXT_MESSAGE_*`
   * carrying raw JSON deltas → terminal `CUSTOM 'structured-output.complete'`
   * → `RUN_FINISHED`). Subclasses use the same SDK-call / reasoning /
   * structured-output-transform hooks as `chatStream` / `structuredOutput` —
   * no per-subclass override should be needed.
   */
  async *structuredOutputStream(
    options: StructuredOutputOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapOptionsToRequest(chatOptions)

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    const timestamp = Date.now()
    const aguiState = {
      runId: generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let hasEmittedTextMessageStart = false
    let reasoningMessageId: string | undefined
    let hasClosedReasoning = false
    let stepId: string | undefined
    let lastModel: string | undefined
    let lastUsage:
      | OpenAI_SDK.Chat.Completions.ChatCompletionChunk['usage']
      | undefined

    const closeReasoningLifecycle = function* (this: {
      name: string
    }): Generator<StreamChunk> {
      if (reasoningMessageId && !hasClosedReasoning) {
        hasClosedReasoning = true
        yield asChunk({
          type: 'REASONING_MESSAGE_END',
          messageId: reasoningMessageId,
          model: lastModel || chatOptions.model,
          timestamp,
        })
        yield asChunk({
          type: 'REASONING_END',
          messageId: reasoningMessageId,
          model: lastModel || chatOptions.model,
          timestamp,
        })
        if (stepId) {
          yield asChunk({
            type: 'STEP_FINISHED',
            stepName: stepId,
            stepId,
            model: lastModel || chatOptions.model,
            timestamp,
            content: accumulatedReasoning,
          })
        }
      }
    }.bind(this)

    try {
      // Strip stream_options + tools from the base request. Structured output
      // sends `response_format: json_schema` and doesn't carry tools — keeping
      // them in the request can confuse strict-mode validation upstream.
      const {
        stream_options: _so,
        stream: _s,
        tools: _t,
        ...cleanParams
      } = requestParams

      chatOptions.logger.request(
        `activity=structuredOutputStream provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )

      const stream = await this.callChatCompletionStream(
        {
          ...cleanParams,
          stream: true,
          stream_options: { include_usage: true },
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'structured_output',
              schema: jsonSchema,
              strict: true,
            },
          },
        },
        extractRequestOptions(chatOptions.request),
      )

      for await (const chunk of stream) {
        if (chunk.model) lastModel = chunk.model

        // Usage may arrive on a chunk with empty `choices` (OpenAI's
        // include_usage terminal chunk) or piggybacked on a finish chunk
        // (`x_groq.usage` on Groq). Capture from either independent of
        // choices[0].
        const usage =
          chunk.usage ??
          (chunk as { x_groq?: { usage?: typeof chunk.usage } }).x_groq?.usage
        if (usage) lastUsage = usage

        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield asChunk({
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            model: chunk.model || chatOptions.model,
            timestamp,
          })
        }

        // Reasoning (via the extractReasoning hook — same hook as chatStream).
        const reasoning = this.extractReasoning(chunk)
        if (reasoning && reasoning.text) {
          if (!reasoningMessageId) {
            reasoningMessageId = generateId(this.name)
            stepId = generateId(this.name)
            yield asChunk({
              type: 'REASONING_START',
              messageId: reasoningMessageId,
              model: chunk.model || chatOptions.model,
              timestamp,
            })
            yield asChunk({
              type: 'REASONING_MESSAGE_START',
              messageId: reasoningMessageId,
              role: 'reasoning' as const,
              model: chunk.model || chatOptions.model,
              timestamp,
            })
            yield asChunk({
              type: 'STEP_STARTED',
              stepName: stepId,
              stepId,
              model: chunk.model || chatOptions.model,
              timestamp,
              stepType: 'thinking',
            })
          }
          accumulatedReasoning += reasoning.text
          yield asChunk({
            type: 'REASONING_MESSAGE_CONTENT',
            messageId: reasoningMessageId,
            delta: reasoning.text,
            model: chunk.model || chatOptions.model,
            timestamp,
          })
        }

        const choice = chunk.choices[0]
        if (!choice) continue

        const deltaContent = choice.delta.content
        if (deltaContent) {
          yield* closeReasoningLifecycle()

          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield asChunk({
              type: 'TEXT_MESSAGE_START',
              messageId: aguiState.messageId,
              model: chunk.model || chatOptions.model,
              timestamp,
              role: 'assistant',
            })
          }

          accumulatedContent += deltaContent

          yield asChunk({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model: chunk.model || chatOptions.model,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          })
        }
      }

      // Finalisation: close any open lifecycle, parse + validate, emit
      // terminal events. This block always runs unless the loop threw — abort
      // and SDK errors land in the catch block below.
      yield* closeReasoningLifecycle()

      if (hasEmittedTextMessageStart) {
        yield asChunk({
          type: 'TEXT_MESSAGE_END',
          messageId: aguiState.messageId,
          model: lastModel || chatOptions.model,
          timestamp,
        })
      }

      if (accumulatedContent.length === 0) {
        yield asChunk({
          type: 'RUN_ERROR',
          runId: aguiState.runId,
          model: lastModel || chatOptions.model,
          timestamp,
          message: `${this.name}.structuredOutputStream: response contained no content`,
          code: 'empty-response',
          error: {
            message: `${this.name}.structuredOutputStream: response contained no content`,
            code: 'empty-response',
          },
        })
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(accumulatedContent)
      } catch {
        yield asChunk({
          type: 'RUN_ERROR',
          runId: aguiState.runId,
          model: lastModel || chatOptions.model,
          timestamp,
          message: `Failed to parse structured output as JSON. Content: ${accumulatedContent.slice(0, 200)}${accumulatedContent.length > 200 ? '...' : ''}`,
          code: 'parse-error',
          error: {
            message: 'Failed to parse structured output as JSON',
            code: 'parse-error',
          },
        })
        return
      }

      const transformed = this.transformStructuredOutput(parsed)

      yield asChunk({
        type: 'CUSTOM',
        name: 'structured-output.complete',
        value: {
          object: transformed,
          raw: accumulatedContent,
          ...(accumulatedReasoning
            ? { reasoning: accumulatedReasoning }
            : {}),
        },
        model: lastModel || chatOptions.model,
        timestamp,
      })

      yield asChunk({
        type: 'RUN_FINISHED',
        runId: aguiState.runId,
        model: lastModel || chatOptions.model,
        timestamp,
        finishReason: 'stop',
        ...(lastUsage && {
          usage: {
            promptTokens: lastUsage.prompt_tokens,
            completionTokens: lastUsage.completion_tokens,
            totalTokens: lastUsage.total_tokens,
          },
        }),
      })
    } catch (error: unknown) {
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield asChunk({
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          model: chatOptions.model,
          timestamp,
        })
      }

      const isAbort = this.isAbortError(error)
      const errorPayload = toRunErrorPayload(
        error,
        `${this.name}.structuredOutputStream failed`,
      )

      yield asChunk({
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: lastModel || chatOptions.model,
        timestamp,
        message: errorPayload.message,
        code: isAbort ? 'aborted' : errorPayload.code,
        error: { ...errorPayload, ...(isAbort && { code: 'aborted' }) },
      })

      chatOptions.logger.errors(`${this.name}.structuredOutputStream fatal`, {
        error: errorPayload,
        source: `${this.name}.structuredOutputStream`,
      })
    }
  }

  /**
   * Cross-SDK abort detection for `structuredOutputStream`. Default duck-types
   * on `name === 'APIUserAbortError'` (OpenAI SDK), `code === 'ERR_CANCELED'`,
   * and standard `AbortError`s. Subclasses with proprietary error types (e.g.
   * `@openrouter/sdk`'s `RequestAbortedError`) override to extend the check.
   */
  protected isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const e = error as { name?: unknown; code?: unknown }
    return (
      e.name === 'APIUserAbortError' ||
      e.name === 'AbortError' ||
      e.code === 'ERR_CANCELED'
    )
  }

  /**
   * Applies provider-specific transformations for structured output compatibility.
   * Override this in subclasses to handle provider-specific quirks.
   */
  protected makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): Record<string, any> {
    return makeStructuredOutputCompatible(schema, originalRequired)
  }

  /**
   * Extract reasoning content from a stream chunk. Default returns
   * `undefined` because the OpenAI Chat Completions chunk shape doesn't
   * carry reasoning. The chunk param is typed `unknown` so an override can
   * narrow to its own SDK chunk type without an `as` dance — the base only
   * passes through `processStreamChunks`'s structurally-iterated chunk.
   */
  protected extractReasoning(_chunk: unknown): { text: string } | undefined {
    return undefined
  }

  /**
   * Final shaping pass applied to parsed structured-output JSON before it is
   * returned to the caller. Default converts `null` values to `undefined` so
   * the result aligns with the original Zod schema's optional-field
   * semantics. Subclasses with different conventions (OpenRouter historically
   * preserves nulls) can override.
   */
  protected transformStructuredOutput(parsed: unknown): unknown {
    return transformNullsToUndefined(parsed)
  }

  /**
   * Processes streamed chunks from the Chat Completions API and yields AG-UI events.
   * Override this in subclasses to handle provider-specific stream behavior.
   */
  protected async *processStreamChunks(
    stream: AsyncIterable<ChatCompletionChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let hasEmittedTextMessageStart = false
    let lastModel: string | undefined
    // Track usage from any chunk that carries it. With
    // `stream_options: { include_usage: true }` OpenAI emits a terminal chunk
    // whose `choices` is `[]` and only the `usage` field is populated; the
    // earlier `finish_reason` chunk does NOT include token counts. We must
    // therefore defer RUN_FINISHED until the iterator is exhausted so we can
    // pick up usage from the trailing chunk regardless of arrival order.
    let lastUsage: ChatCompletionChunk['usage'] | undefined
    let pendingFinishReason:
      | ChatCompletionChunk['choices'][number]['finish_reason']
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

    // Reasoning lifecycle (driven by extractReasoning() hook — see method
    // docs). The base wire format (OpenAI Chat Completions) has no reasoning,
    // so these stay unused for openai/grok/groq. OpenRouter etc. opt in.
    let reasoningMessageId: string | undefined
    let hasClosedReasoning = false
    // Legacy STEP_STARTED/STEP_FINISHED pair emitted alongside REASONING_*
    // for back-compat with consumers (UI, devtools) that haven't migrated
    // to the spec REASONING_* events yet.
    let stepId: string | undefined
    let accumulatedReasoning = ''
    // Track whether ANY tool call lifecycle was actually completed across the
    // entire stream. Lets us downgrade a `tool_calls` finish_reason to `stop`
    // when the upstream signalled tool calls but never produced a complete
    // start/end pair — emitting RUN_FINISHED { finishReason: 'tool_calls' }
    // with no matching TOOL_CALL_END would leave consumers waiting for tool
    // results that never arrive.
    let emittedAnyToolCallEnd = false

    try {
      for await (const chunk of stream) {
        const choiceForLog = chunk.choices[0]
        options.logger.provider(
          `provider=${this.name} finish_reason=${choiceForLog?.finish_reason ?? 'none'} hasContent=${!!choiceForLog?.delta.content} hasToolCalls=${!!choiceForLog?.delta.tool_calls} hasUsage=${!!chunk.usage}`,
          { provider: this.name, model: chunk.model },
        )

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
          yield {
            type: EventType.RUN_STARTED,
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model: chunk.model || options.model,
            timestamp: Date.now(),
          }
        }

        // Reasoning content (extractReasoning() hook). Run before reading
        // choice/delta so reasoning-only chunks (no `choices`) still drive
        // the REASONING_* lifecycle on providers that send reasoning out of
        // band. The base default returns undefined.
        const reasoning = this.extractReasoning(chunk)
        if (reasoning && reasoning.text) {
          if (!reasoningMessageId) {
            reasoningMessageId = generateId(this.name)
            stepId = generateId(this.name)
            yield {
              type: EventType.REASONING_START,
              messageId: reasoningMessageId,
              model: chunk.model || options.model,
              timestamp: Date.now(),
            }
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId: reasoningMessageId,
              role: 'reasoning' as const,
              model: chunk.model || options.model,
              timestamp: Date.now(),
            }
            // Legacy STEP_STARTED (single emission, paired with the
            // STEP_FINISHED below when reasoning closes).
            yield {
              type: EventType.STEP_STARTED,
              stepName: stepId,
              stepId,
              model: chunk.model || options.model,
              timestamp: Date.now(),
              stepType: 'thinking',
            }
          }
          accumulatedReasoning += reasoning.text
          yield {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: reasoningMessageId,
            delta: reasoning.text,
            model: chunk.model || options.model,
            timestamp: Date.now(),
          }
        }

        const choice = chunk.choices[0]

        if (!choice) continue

        const delta = choice.delta
        const deltaContent = delta.content
        const deltaToolCalls = delta.tool_calls

        // Handle content delta
        if (deltaContent) {
          // Close reasoning before text starts so consumers see a clean
          // REASONING_END before any TEXT_MESSAGE_START.
          if (reasoningMessageId && !hasClosedReasoning) {
            hasClosedReasoning = true
            yield {
              type: EventType.REASONING_MESSAGE_END,
              messageId: reasoningMessageId,
              model: chunk.model || options.model,
              timestamp: Date.now(),
            }
            yield {
              type: EventType.REASONING_END,
              messageId: reasoningMessageId,
              model: chunk.model || options.model,
              timestamp: Date.now(),
            }
            if (stepId) {
              yield {
                type: EventType.STEP_FINISHED,
                stepName: stepId,
                stepId,
                model: chunk.model || options.model,
                timestamp: Date.now(),
                content: accumulatedReasoning,
              }
            }
          }

          // Emit TEXT_MESSAGE_START on first text content
          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp: Date.now(),
              role: 'assistant',
            }
          }

          accumulatedContent += deltaContent

          // Emit AG-UI TEXT_MESSAGE_CONTENT
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: aguiState.messageId,
            model: chunk.model || options.model,
            timestamp: Date.now(),
            delta: deltaContent,
            content: accumulatedContent,
          }
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
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp: Date.now(),
                index,
              }
            }

            // Emit TOOL_CALL_ARGS for argument deltas
            if (toolCallDelta.function?.arguments && toolCall.started) {
              yield {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: toolCall.id,
                model: chunk.model || options.model,
                timestamp: Date.now(),
                delta: toolCallDelta.function.arguments,
              }
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
              yield {
                type: EventType.TOOL_CALL_END,
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                toolName: toolCall.name,
                model: chunk.model || options.model,
                timestamp: Date.now(),
                input: parsedInput,
              }
              emittedAnyToolCallEnd = true
            }
            // Clear tool-call state after emission so a subsequent
            // `finish_reason: 'stop'` chunk (or the post-loop synthetic
            // block) doesn't see lingering entries and misreport the finish.
            toolCallsInProgress.clear()
          }

          // Emit TEXT_MESSAGE_END if we had text content
          if (hasEmittedTextMessageStart) {
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: aguiState.messageId,
              model: chunk.model || options.model,
              timestamp: Date.now(),
            }
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
            } catch (parseError) {
              // Mirror the finish_reason path's logger call — a truncated
              // stream emitting malformed tool-call JSON would otherwise
              // silently invoke the tool with `{}`, the exact failure the
              // finish_reason logger was added to prevent.
              options.logger.errors(
                `${this.name}.processStreamChunks tool-args JSON parse failed (drain)`,
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
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: toolCall.id,
            toolCallName: toolCall.name,
            toolName: toolCall.name,
            model: lastModel || options.model,
            timestamp: Date.now(),
            input: parsedInput,
          }
          pendingToolCount += 1
          emittedAnyToolCallEnd = true
        }
        toolCallsInProgress.clear()

        // Make sure the text message lifecycle is closed even on early
        // termination paths where finish_reason never arrives.
        if (hasEmittedTextMessageStart) {
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId: aguiState.messageId,
            model: lastModel || options.model,
            timestamp: Date.now(),
          }
        }

        // Close any reasoning lifecycle that text never closed (no text
        // content arrived, or the stream cut off before text started).
        if (reasoningMessageId && !hasClosedReasoning) {
          hasClosedReasoning = true
          yield {
            type: EventType.REASONING_MESSAGE_END,
            messageId: reasoningMessageId,
            model: lastModel || options.model,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.REASONING_END,
            messageId: reasoningMessageId,
            model: lastModel || options.model,
            timestamp: Date.now(),
          }
          if (stepId) {
            yield {
              type: EventType.STEP_FINISHED,
              stepName: stepId,
              stepId,
              model: lastModel || options.model,
              timestamp: Date.now(),
              content: accumulatedReasoning,
            }
          }
        }

        // Map upstream finish_reason to AG-UI's narrower vocabulary.
        // Collapsing length / content_filter to 'stop' would hide why the
        // run terminated — surface it instead. Use `tool_calls` only when
        // a TOOL_CALL_END was actually emitted: an upstream that signalled
        // `tool_calls` but never produced a started/ended pair must NOT
        // surface `tool_calls` here, since downstream consumers wait for
        // tool results that would never arrive. OpenAI's legacy
        // `function_call` value (from the v1 function-calling API) is
        // normalized to `tool_calls` — semantically the same termination.
        const finishReason: NonNullable<RunFinishedEvent['finishReason']> =
          emittedAnyToolCallEnd
            ? 'tool_calls'
            : pendingFinishReason === 'tool_calls'
              ? 'stop'
              : pendingFinishReason === 'function_call'
                ? 'tool_calls'
                : (pendingFinishReason ?? 'stop')

        yield {
          type: EventType.RUN_FINISHED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: lastModel || options.model,
          timestamp: Date.now(),
          usage: lastUsage
            ? {
                promptTokens: lastUsage.prompt_tokens || 0,
                completionTokens: lastUsage.completion_tokens || 0,
                totalTokens: lastUsage.total_tokens || 0,
              }
            : undefined,
          finishReason,
        }
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
      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        code: errorPayload.code,
        error: errorPayload,
      }
    }
  }

  /**
   * Maps common TextOptions to Chat Completions API request format.
   * Override this in subclasses to add provider-specific options.
   */
  protected mapOptionsToRequest(
    options: TextOptions,
  ): ChatCompletionCreateParamsStreaming {
    const tools = options.tools
      ? convertToolsToChatCompletionsFormat(
          options.tools,
          this.makeStructuredOutputCompatible.bind(this),
        )
      : undefined

    // Build messages array with system prompts
    const messages: Array<ChatCompletionMessageParam> = []

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
  protected convertMessage(message: ModelMessage): ChatCompletionMessageParam {
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
    const parts: Array<ChatCompletionContentPart> = []
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
  ): ChatCompletionContentPart | null {
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
