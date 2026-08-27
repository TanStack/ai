import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { extractRequestOptions } from '../utils/request-options'
import { makeStructuredOutputCompatibleWithMap } from '../utils/schema-converter'
import type { StructuredOutputCompatibility } from '../utils/schema-converter'
import { buildChatCompletionsUsage } from '../usage'
import { convertToolsToChatCompletionsFormat } from './chat-completions-tool-converter'
import { processChatCompletionsStream } from './chat-completions-stream'
import type { ChatStreamState } from './chat-completions-stream'
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
  AdapterYieldChunk,
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
  override readonly kind = 'text' as const
  readonly name: string
  protected client: OpenAI

  constructor(model: TModel, name: string, client: OpenAI) {
    super({}, model)
    this.name = name
    this.client = client
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
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
      yield* this.handleChatStreamError(error, options, aguiState, 'chatStream')
    }
  }

  private async *handleChatStreamError(
    error: unknown,
    options: TextOptions,
    aguiState: ChatStreamState,
    source: 'chatStream' | 'processStreamChunks',
  ): AsyncIterable<AdapterYieldChunk> {
    // Narrow before logging: raw SDK errors can carry request metadata
    // (including auth headers) which we must never surface to user loggers.
    const errorPayload = toRunErrorPayload(
      error,
      `${this.name}.${source} failed`,
    )
    const rawEvent = toRunErrorRawEvent(error)

    if (!aguiState.hasEmittedRunStarted) {
      aguiState.hasEmittedRunStarted = true
      yield {
        type: EventType.RUN_STARTED,
        runId: aguiState.runId,
        threadId: aguiState.threadId,
        model: options.model,
        timestamp: Date.now(),
        parentRunId: options.parentRunId,
      }
    }

    const rejectedToolCall = this.extractRejectedToolCall(
      rawEvent,
      errorPayload.message,
    )
    if (rejectedToolCall) {
      const toolCallId = generateId(this.name)
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: rejectedToolCall.toolName,
        toolName: rejectedToolCall.toolName,
        parentMessageId: aguiState.messageId,
        model: options.model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: rejectedToolCall.arguments,
        args: rejectedToolCall.arguments,
        model: options.model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        toolCallName: rejectedToolCall.toolName,
        toolName: rejectedToolCall.toolName,
        ...(rejectedToolCall.input !== undefined && {
          input: rejectedToolCall.input,
        }),
        result: JSON.stringify({ error: rejectedToolCall.error }),
        state: 'output-error',
        model: options.model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.RUN_FINISHED,
        runId: aguiState.runId,
        threadId: aguiState.threadId,
        model: options.model,
        timestamp: Date.now(),
        finishReason: 'tool_calls',
      }
      return
    }

    options.logger.errors(`${this.name}.${source} fatal`, {
      error: errorPayload,
      source: `${this.name}.${source}`,
    })

    yield {
      type: EventType.RUN_ERROR,
      runId: aguiState.runId,
      threadId: aguiState.threadId,
      model: options.model,
      timestamp: Date.now(),
      message: errorPayload.message,
      ...(errorPayload.code !== undefined && { code: errorPayload.code }),
      ...(rawEvent !== undefined && { rawEvent }),
      error: {
        message: errorPayload.message,
        ...(errorPayload.code !== undefined && { code: errorPayload.code }),
      },
    }
  }

  /**
   * Extracts a rejected tool call from a provider error. Returned calls are
   * emitted as non-executable `output-error` results so the model can repair them.
   */
  protected extractRejectedToolCall(
    _rawEvent: unknown,
    _fallbackMessage: string,
  ):
    | {
        toolName: string
        arguments: string
        input?: unknown
        error: string
      }
    | undefined {
    return undefined
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

      // Final provider-specific shaping pass (default passthrough). Null-widening
      // from strict mode is undone by the engine, not here.
      const transformed = this.transformStructuredOutput(parsed)

      // Surface usage so non-stream structured paths (and
      // fallbackStructuredOutputStream) can forward tokens to middleware.
      const usage = buildChatCompletionsUsage(response.usage)
      return {
        data: transformed,
        rawText,
        ...(usage && { usage }),
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
  ): AsyncIterable<AdapterYieldChunk> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapOptionsToRequest(chatOptions)

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    const aguiState = {
      runId: generateId(this.name),
      threadId: chatOptions.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
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
      | OpenAI.Chat.Completions.ChatCompletionChunk['usage']
      | undefined
    const adapterName = this.name
    const extractReasoning = (chunk: unknown) => this.extractReasoning(chunk)
    const transformOutput = (parsed: unknown) =>
      this.transformStructuredOutput(parsed)

    const closeReasoningLifecycle = function* (): Generator<AdapterYieldChunk> {
      if (reasoningMessageId && !hasClosedReasoning) {
        hasClosedReasoning = true
        yield {
          type: EventType.REASONING_MESSAGE_END,
          messageId: reasoningMessageId,
          model: lastModel || chatOptions.model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.REASONING_END,
          messageId: reasoningMessageId,
          model: lastModel || chatOptions.model,
          timestamp: Date.now(),
        }
        if (stepId) {
          yield {
            type: EventType.STEP_FINISHED,
            stepName: stepId,
            stepId,
            model: lastModel || chatOptions.model,
            timestamp: Date.now(),
            content: accumulatedReasoning,
          }
        }
        reasoningMessageId = undefined
        stepId = undefined
        hasClosedReasoning = false
      }
    }

    const emitReasoning = function* (
      chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
    ): Generator<AdapterYieldChunk> {
      const reasoning = extractReasoning(chunk)
      if (!reasoning || !reasoning.text) return
      const model = chunk.model || chatOptions.model
      if (!reasoningMessageId) {
        reasoningMessageId = generateId(adapterName)
        stepId = generateId(adapterName)
        yield {
          type: EventType.REASONING_START,
          messageId: reasoningMessageId,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.REASONING_MESSAGE_START,
          messageId: reasoningMessageId,
          role: 'reasoning' as const,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.STEP_STARTED,
          stepName: stepId,
          stepId,
          model,
          timestamp: Date.now(),
          stepType: 'thinking',
        }
      }
      accumulatedReasoning += reasoning.text
      yield {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: reasoningMessageId,
        delta: reasoning.text,
        model,
        timestamp: Date.now(),
      }
    }

    const handleChunk = function* (
      chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
    ): Generator<AdapterYieldChunk> {
      const choiceForLog = chunk.choices[0]
      chatOptions.logger.provider(
        `provider=${adapterName} finish_reason=${choiceForLog?.finish_reason ?? 'none'} hasContent=${!!choiceForLog?.delta.content} hasUsage=${!!chunk.usage}`,
        { provider: adapterName, model: chunk.model },
      )

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
        yield {
          type: EventType.RUN_STARTED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: chunk.model || chatOptions.model,
          timestamp: Date.now(),
          parentRunId: chatOptions.parentRunId,
        }
      }

      yield* emitReasoning(chunk)

      const choice = chunk.choices[0]
      if (!choice) return

      const deltaContent = choice.delta.content
      if (!deltaContent) return

      yield* closeReasoningLifecycle()

      if (!hasEmittedTextMessageStart) {
        hasEmittedTextMessageStart = true
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: aguiState.messageId,
          model: chunk.model || chatOptions.model,
          timestamp: Date.now(),
          role: 'assistant',
        }
      }

      accumulatedContent += deltaContent

      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: aguiState.messageId,
        model: chunk.model || chatOptions.model,
        timestamp: Date.now(),
        delta: deltaContent,
        content: accumulatedContent,
      }
    }

    const finalize = function* (): Generator<AdapterYieldChunk> {
      yield* closeReasoningLifecycle()

      if (hasEmittedTextMessageStart) {
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: aguiState.messageId,
          model: lastModel || chatOptions.model,
          timestamp: Date.now(),
        }
      }

      if (accumulatedContent.length === 0) {
        yield {
          type: EventType.RUN_ERROR,
          runId: aguiState.runId,
          model: lastModel || chatOptions.model,
          timestamp: Date.now(),
          message: `${adapterName}.structuredOutputStream: response contained no content`,
          code: 'empty-response',
          error: {
            message: `${adapterName}.structuredOutputStream: response contained no content`,
            code: 'empty-response',
          },
        }
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(accumulatedContent)
      } catch {
        yield {
          type: EventType.RUN_ERROR,
          runId: aguiState.runId,
          model: lastModel || chatOptions.model,
          timestamp: Date.now(),
          message: `Failed to parse structured output as JSON. Content: ${accumulatedContent.slice(0, 200)}${accumulatedContent.length > 200 ? '...' : ''}`,
          code: 'parse-error',
          error: {
            message: 'Failed to parse structured output as JSON',
            code: 'parse-error',
          },
        }
        return
      }

      const transformed = transformOutput(parsed)

      yield {
        type: EventType.CUSTOM,
        name: 'structured-output.complete',
        value: {
          object: transformed,
          raw: accumulatedContent,
          ...(accumulatedReasoning ? { reasoning: accumulatedReasoning } : {}),
        },
        model: lastModel || chatOptions.model,
        timestamp: Date.now(),
      }

      yield {
        type: EventType.RUN_FINISHED,
        runId: aguiState.runId,
        threadId: aguiState.threadId,
        model: lastModel || chatOptions.model,
        timestamp: Date.now(),
        finishReason: 'stop',
        ...(lastUsage && {
          usage: buildChatCompletionsUsage(lastUsage),
        }),
      }
    }

    const handleFatal = function* (
      error: unknown,
      isAbort: boolean,
    ): Generator<AdapterYieldChunk> {
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: chatOptions.model,
          timestamp: Date.now(),
          parentRunId: chatOptions.parentRunId,
        }
      }

      const errorPayload = toRunErrorPayload(
        error,
        `${adapterName}.structuredOutputStream failed`,
      )

      const resolvedCode = isAbort ? 'aborted' : errorPayload.code
      const rawEvent = isAbort ? undefined : toRunErrorRawEvent(error)
      yield {
        type: EventType.RUN_ERROR,
        runId: aguiState.runId,
        model: lastModel || chatOptions.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        ...(resolvedCode !== undefined && { code: resolvedCode }),
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: errorPayload.message,
          ...(resolvedCode !== undefined && { code: resolvedCode }),
        },
      }

      chatOptions.logger.errors(`${adapterName}.structuredOutputStream fatal`, {
        error: errorPayload,
        source: `${adapterName}.structuredOutputStream`,
      })
    }

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

      const stream = await this.client.chat.completions.create(
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
        yield* handleChunk(chunk)
      }

      yield* finalize()
    } catch (error: unknown) {
      yield* handleFatal(error, this.isAbortError(error))
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
   * Strict conversion plus the inverse null-widening map for this request.
   * Override this when schema conversion changes, so tool-input undo matches
   * the wire schema.
   */
  protected makeStructuredOutputCompatibleWithMap(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): StructuredOutputCompatibility {
    return makeStructuredOutputCompatibleWithMap(schema, originalRequired)
  }

  /**
   * Applies provider-specific transformations for structured output compatibility.
   * Override `makeStructuredOutputCompatibleWithMap` when you need the inverse map
   * to match the wire schema.
   */
  protected makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): Record<string, any> {
    return this.makeStructuredOutputCompatibleWithMap(schema, originalRequired)
      .schema
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
   * returned to the caller. Default is a passthrough.
   *
   * Provider `null`s are no longer stripped here: strict-mode null-widening is
   * now undone precisely by the engine (`undoNullWidening`, driven by the
   * schema's null-widening map) the moment the result is captured, so a blind
   * `transformNullsToUndefined` at the adapter would only destroy genuine
   * `.nullable()` nulls. Subclasses may still override to remap or reshape the
   * provider's structured output.
   */
  protected transformStructuredOutput(parsed: unknown): unknown {
    return parsed
  }

  /**
   * Processes streamed chunks from the Chat Completions API and yields AG-UI events.
   * Override this in subclasses to handle provider-specific stream behavior.
   */
  protected async *processStreamChunks(
    stream: AsyncIterable<ChatCompletionChunk>,
    options: TextOptions,
    aguiState: ChatStreamState,
  ): AsyncIterable<AdapterYieldChunk> {
    yield* processChatCompletionsStream({
      stream,
      options,
      aguiState,
      adapterName: this.name,
      extractReasoning: (chunk) => this.extractReasoning(chunk),
      toCompatibility: (schema, required) =>
        this.makeStructuredOutputCompatibleWithMap(schema, required),
      handleError: (error) =>
        this.handleChatStreamError(
          error,
          options,
          aguiState,
          'processStreamChunks',
        ),
    })
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
    const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
    if (systemPrompts.length > 0) {
      messages.push({
        role: 'system',
        content: systemPrompts.map((p) => p.content).join('\n'),
      })
    }

    // Convert messages
    for (const message of options.messages) {
      messages.push(this.convertMessage(message))
    }

    const modelOptions = options.modelOptions

    // Native combined mode (issue #605): when the engine threads
    // `outputSchema` through TextOptions, the adapter declared
    // `supportsCombinedToolsAndSchema` and the schema is already JSON Schema
    // (pre-converted at the activity boundary). Wire it into
    // `response_format` alongside any `tools`. Modern OpenAI-compatible
    // Chat Completions accepts both together and emits the schema-
    // constrained text on the natural final turn.
    const combinedSchema = options.outputSchema as
      | Record<string, unknown>
      | undefined
    const responseFormat = combinedSchema
      ? {
          response_format: {
            type: 'json_schema' as const,
            json_schema: {
              name: 'structured_output',
              schema: this.makeStructuredOutputCompatible(
                combinedSchema,
                Array.isArray(combinedSchema.required)
                  ? (combinedSchema.required as Array<string>)
                  : undefined,
              ),
              strict: true,
            },
          },
        }
      : undefined

    // `modelOptions` is the sole sampling surface: callers set provider-native
    // wire names (`temperature`, `top_p`, `max_tokens`/`max_completion_tokens`)
    // there and they flow through the spread below. The root
    // `temperature`/`topP`/`maxTokens` fields are intentionally NOT read here.
    return {
      ...modelOptions,
      model: options.model,
      messages,
      // Conditional spread: `tools: undefined` would clobber any
      // modelOptions.tools the caller set above.
      ...(tools &&
        tools.length > 0 && {
          tools,
        }),
      ...(responseFormat ?? {}),
      stream: true,
    }
  }

  /**
   * Modern OpenAI-compatible Chat Completions APIs support `tools` and
   * `response_format: json_schema` together in a single streaming request
   * (per issue #605). Subclasses can override — Groq, for instance, must
   * return `false` because its API rejects schema + tools + stream with a
   * 400.
   */
  supportsCombinedToolsAndSchema(): boolean {
    return true
  }

  /**
   * Converts a single ModelMessage to the Chat Completions API message format.
   * Override this in subclasses to handle provider-specific message formats.
   */
  protected convertMessage(message: ModelMessage): ChatCompletionMessageParam {
    // Handle tool messages
    if (message.role === 'tool') {
      // The Chat Completions API has no multimodal `tool` message support
      // (unlike the Responses API's `function_call_output`). A tool that
      // returns an `Array<ContentPart>` is therefore stringified here — the
      // documented fallback for providers on the chat-completions path
      // (Groq, Ollama, Grok, OpenRouter chat). Multimodal tool results are
      // only delivered structurally via the Responses adapter.
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

    if (part.type === 'document') {
      // Documents (PDF) are implemented on the Responses adapter, which maps
      // them to `input_file`. Model modality arrays are not endpoint-scoped,
      // so a document part can type-check for a model this adapter serves —
      // point callers at the supported path instead of a generic error.
      throw new Error(
        `${this.name} does not support document parts on the Chat Completions ` +
          `API; use the Responses adapter, which sends them as input_file.`,
      )
    }

    // Unsupported content type — subclasses can override to handle more types
    return null
  }

  /**
   * Normalizes message content to an array of ContentPart.
   * Handles backward compatibility with string content.
   */
  protected normalizeContent(
    content: string | null | undefined | Array<ContentPart>,
  ): Array<ContentPart> {
    if (content === null || content === undefined) {
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
    content: string | null | undefined | Array<ContentPart>,
  ): string {
    // Tool-call-only assistant turns (e.g. an approval resume replaying the
    // pending call) carry no text and arrive as `null` or `undefined`; both
    // must collapse to '' rather than crash on `.filter`.
    if (content === null || content === undefined) {
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
