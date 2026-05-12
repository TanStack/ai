import { EventType } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId, transformNullsToUndefined } from '@tanstack/ai-utils'
import { extractRequestOptions } from '../utils/request-options'
import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import { convertToolsToResponsesFormat } from './responses-tool-converter'
import type OpenAI from 'openai'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  Response,
  ResponseCreateParams,
  ResponseInput,
  ResponseInputContent,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import type {
  ContentPart,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'

/**
 * Shared implementation of the OpenAI Responses API. Holds the stream-event
 * accumulator + AG-UI lifecycle and calls the OpenAI SDK directly. Subclasses
 * (today: ai-openai) construct an OpenAI client with their provider-specific
 * `baseURL` / headers and pass it in.
 */
export abstract class OpenAIBaseResponsesTextAdapter<
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
    // Track tool call metadata by unique ID
    // Responses API streams tool calls with deltas — first chunk has ID/name,
    // subsequent chunks only have args.
    // We assign our own indices as we encounter unique tool call IDs.
    const toolCallMetadata = new Map<
      string,
      {
        index: number
        name: string
        started: boolean
        // Set once TOOL_CALL_END has been emitted (via args.done or the
        // output_item.done backfill) so the two paths don't double-emit.
        ended?: boolean
        // Set when args.done arrives before TOOL_CALL_START could fire
        // (output_item.added lacked a name). output_item.done picks these
        // up to emit the missing END.
        pendingArguments?: string
      }
    >()

    // AG-UI lifecycle tracking
    const aguiState = {
      runId: generateId(this.name),
      threadId: options.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      hasEmittedRunStarted: false,
    }

    try {
      // mapOptionsToRequest can throw on caller-side validation failures
      // (empty user content, unsupported parts, webSearchTool() rejection in
      // the OpenRouter override). Keep it inside the try so those failures
      // surface as RUN_ERROR events instead of iterator throws.
      const requestParams = this.mapOptionsToRequest(options)
      options.logger.request(
        `activity=chat provider=${this.name} model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: this.name, model: this.model },
      )
      const response = await this.client.responses.create(
        {
          ...requestParams,
          stream: true,
        },
        extractRequestOptions(options.request),
      )

      yield* this.processStreamChunks(
        response,
        toolCallMetadata,
        options,
        aguiState,
      )
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
   * Generate structured output using the provider's native JSON Schema response format.
   * Uses stream: false to get the complete response in one call.
   *
   * OpenAI-compatible Responses APIs have strict requirements for structured output:
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

    // Apply provider-specific transformations for structured output compatibility
    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    try {
      // Strip streaming-only fields a subclass override of mapOptionsToRequest
      // might have returned (parallel to chat-completions's structuredOutput
      // cleanup) — sending stream_options to a non-streaming call is a 4xx.
      const {
        stream: _stream,
        stream_options: _streamOptions,
        ...cleanParams
      } = requestParams as Record<string, unknown>
      void _stream
      void _streamOptions
      chatOptions.logger.request(
        `activity=structuredOutput provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      const response = await this.client.responses.create(
        {
          ...(cleanParams as Omit<ResponseCreateParams, 'stream'>),
          stream: false,
          // Configure structured output via text.format
          text: {
            format: {
              type: 'json_schema',
              name: 'structured_output',
              schema: jsonSchema,
              strict: true,
            },
          },
        },
        extractRequestOptions(chatOptions.request),
      )

      // Extract text content from the response. `stream: false` narrows the
      // SDK return type to `Response`, but the explicit annotation makes
      // that contract local rather than relying on inference through the
      // overloaded `client.responses.create` signature.
      const rawText = this.extractTextFromResponse(response satisfies Response)

      // Fail loud on empty content rather than letting it cascade into a
      // confusing "Failed to parse JSON. Content: " error — the root cause
      // (the model returned no text content for the structured request) is
      // then visible in logs. Mirrors the chat-completions sibling.
      if (rawText.length === 0) {
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

      // Apply the provider-specific post-parse shaping (default: null →
      // undefined to align with the original Zod schema's optional-field
      // semantics; subclasses with different conventions can override
      // `transformStructuredOutput`, mirroring the chat-completions base's
      // hook so OpenRouter and other providers that preserve nulls in
      // structured output can opt out without forking `structuredOutput`).
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
   * Stream structured output via the Responses API: single request with
   * `text.format: json_schema` + `stream: true`. Consumes Responses-API
   * events (`response.output_text.delta`, `response.reasoning_text.delta`,
   * `response.reasoning_summary_text.delta`, `response.refusal.delta`,
   * `response.completed`, `response.failed`) and re-emits the standard AG-UI
   * lifecycle ending with `CUSTOM 'structured-output.complete'`.
   *
   * Tools are stripped (structured output is mutually exclusive with tool
   * calls in this path). Reasoning text is accumulated and surfaced both as
   * REASONING_* lifecycle events during the stream and on the terminal
   * CUSTOM event's `value.reasoning`.
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
    let hasEmittedTextMessageEnd = false
    let reasoningMessageId: string | undefined
    let stepId: string | undefined
    let hasClosedReasoning = false
    let model: string = chatOptions.model
    let usage: OpenAI_SDK.Responses.Response['usage'] | undefined

    const closeReasoning = function* (this: { name: string }): Generator<StreamChunk> {
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
        if (stepId) {
          yield asChunk({
            type: 'STEP_FINISHED',
            stepName: stepId,
            stepId,
            model,
            timestamp,
            content: accumulatedReasoning,
          })
        }
      }
    }.bind(this)

    const openReasoning = function* (
      this: { name: string },
    ): Generator<StreamChunk> {
      if (reasoningMessageId) return
      reasoningMessageId = generateId(this.name)
      stepId = generateId(this.name)
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
      yield asChunk({
        type: 'STEP_STARTED',
        stepName: stepId,
        stepId,
        model,
        timestamp,
        stepType: 'thinking',
      })
    }.bind(this)

    try {
      const {
        stream: _stream,
        stream_options: _streamOptions,
        tools: _tools,
        ...cleanParams
      } = requestParams as unknown as Record<string, unknown>
      void _stream
      void _streamOptions
      void _tools

      chatOptions.logger.request(
        `activity=structuredOutputStream provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )

      const stream = await this.callResponseStream(
        {
          ...(cleanParams as unknown as Omit<
            OpenAI_SDK.Responses.ResponseCreateParamsStreaming,
            'stream'
          >),
          stream: true,
          text: {
            format: {
              type: 'json_schema',
              name: 'structured_output',
              schema: jsonSchema,
              strict: true,
            },
          },
        },
        extractRequestOptions(chatOptions.request),
      )

      for await (const chunk of stream) {
        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield asChunk({
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            model,
            timestamp,
          })
        }

        if (chunk.type === 'response.created' || chunk.type === 'response.in_progress') {
          const responseModel = (chunk as { response?: { model?: string } })
            .response?.model
          if (responseModel) model = responseModel
          continue
        }

        if (chunk.type === 'response.refusal.delta') {
          const delta =
            typeof (chunk as { delta?: unknown }).delta === 'string'
              ? ((chunk as { delta: string }).delta)
              : ''
          yield asChunk({
            type: 'RUN_ERROR',
            runId: aguiState.runId,
            model,
            timestamp,
            message: `Model refused: ${delta}`,
            code: 'refusal',
            error: { message: `Model refused: ${delta}`, code: 'refusal' },
          })
          return
        }

        if (
          chunk.type === 'response.reasoning_text.delta' ||
          chunk.type === 'response.reasoning_summary_text.delta'
        ) {
          const raw = (chunk as { delta?: unknown }).delta
          const reasoningDelta = Array.isArray(raw)
            ? raw.join('')
            : typeof raw === 'string'
              ? raw
              : ''
          if (!reasoningDelta) continue
          yield* openReasoning()
          accumulatedReasoning += reasoningDelta
          yield asChunk({
            type: 'REASONING_MESSAGE_CONTENT',
            messageId: reasoningMessageId,
            delta: reasoningDelta,
            model,
            timestamp,
          })
          continue
        }

        if (chunk.type === 'response.output_text.delta') {
          const raw = (chunk as { delta?: unknown }).delta
          const textDelta = Array.isArray(raw)
            ? raw.join('')
            : typeof raw === 'string'
              ? raw
              : ''
          if (!textDelta) continue

          yield* closeReasoning()

          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield asChunk({
              type: 'TEXT_MESSAGE_START',
              messageId: aguiState.messageId,
              model,
              timestamp,
              role: 'assistant',
            })
          }
          accumulatedContent += textDelta
          yield asChunk({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: aguiState.messageId,
            model,
            timestamp,
            delta: textDelta,
            content: accumulatedContent,
          })
          continue
        }

        if (chunk.type === 'response.completed') {
          const response = (chunk as { response?: OpenAI_SDK.Responses.Response })
            .response
          if (response?.usage) usage = response.usage
          if (response?.model) model = response.model
          continue
        }

        if (chunk.type === 'response.failed') {
          const response = (chunk as {
            response?: { error?: { message?: string; code?: string } }
          }).response
          const message =
            response?.error?.message || 'Responses API stream failed'
          yield asChunk({
            type: 'RUN_ERROR',
            runId: aguiState.runId,
            model,
            timestamp,
            message,
            code: response?.error?.code,
            error: { message, code: response?.error?.code },
          })
          return
        }
      }

      yield* closeReasoning()

      if (hasEmittedTextMessageStart && !hasEmittedTextMessageEnd) {
        hasEmittedTextMessageEnd = true
        yield asChunk({
          type: 'TEXT_MESSAGE_END',
          messageId: aguiState.messageId,
          model,
          timestamp,
        })
      }

      if (accumulatedContent.length === 0) {
        yield asChunk({
          type: 'RUN_ERROR',
          runId: aguiState.runId,
          model,
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
          model,
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

      const transformed = transformNullsToUndefined(parsed)

      yield asChunk({
        type: 'CUSTOM',
        name: 'structured-output.complete',
        value: {
          object: transformed,
          raw: accumulatedContent,
          ...(accumulatedReasoning ? { reasoning: accumulatedReasoning } : {}),
        },
        model,
        timestamp,
      })

      yield asChunk({
        type: 'RUN_FINISHED',
        runId: aguiState.runId,
        model,
        timestamp,
        finishReason: 'stop',
        ...(usage && {
          usage: {
            promptTokens: usage.input_tokens ?? 0,
            completionTokens: usage.output_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          },
        }),
      })
    } catch (error: unknown) {
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield asChunk({
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          model,
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
        model,
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
   * Cross-SDK abort detection for `structuredOutputStream`. Mirrors the
   * Chat Completions base; subclasses with proprietary error types override.
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
   * Final shaping pass applied to parsed structured-output JSON before it is
   * returned to the caller. Default converts `null` values to `undefined` so
   * the result aligns with the original Zod schema's optional-field
   * semantics. Subclasses with different conventions (OpenRouter historically
   * preserves nulls) can override — mirrors the chat-completions base's hook
   * so a subclass that opts out of null-stripping doesn't have to fork the
   * whole `structuredOutput` method.
   */
  protected transformStructuredOutput(parsed: unknown): unknown {
    return transformNullsToUndefined(parsed)
  }

  /**
   * Extract text content from a non-streaming Responses API response.
   * Override this in subclasses for provider-specific response shapes.
   */
  protected extractTextFromResponse(response: Response): string {
    let textContent = ''
    let refusal: string | undefined
    let sawMessageItem = false
    const observedItemTypes = new Set<string>()

    for (const item of response.output) {
      observedItemTypes.add(item.type)
      if (item.type === 'message') {
        sawMessageItem = true
        for (const part of item.content) {
          // Cast off the discriminated union before the type discrimination
          // so future SDK variants (e.g. `output_audio`, `output_image`) hit
          // the explicit error path rather than being misreported as refusals
          // when they get added to the union. Mirrors the streaming side's
          // handleContentPart.
          const partType = (part as { type: string }).type
          if (partType === 'output_text') {
            textContent += (part as { text?: string }).text ?? ''
          } else if (partType === 'refusal') {
            const refusalText = (part as { refusal?: string }).refusal
            refusal = refusalText || refusal || 'Refused without explanation'
          } else {
            throw new Error(
              `${this.name}.extractTextFromResponse: unsupported message content part type "${partType}"`,
            )
          }
        }
      }
    }

    // Surface refusals as an explicit error so callers don't see a generic
    // "Failed to parse structured output as JSON. Content: " when the model
    // refused for safety / content-policy reasons.
    if (!textContent && refusal !== undefined) {
      const err = new Error(`Model refused to respond: ${refusal}`)
      ;(err as Error & { code?: string }).code = 'refusal'
      throw err
    }

    // Response had items but none carried message text (e.g. only
    // function_call or reasoning items). Surface that explicitly so a
    // downstream structured-output caller doesn't see a misleading
    // "Failed to parse JSON. Content: " from an empty string.
    if (!textContent && response.output.length > 0 && !sawMessageItem) {
      throw new Error(
        `${this.name}.extractTextFromResponse: response.output contained items of type(s) [${[...observedItemTypes].sort().join(', ')}] but no message text — the model returned a non-text response`,
      )
    }

    return textContent
  }

  /**
   * Processes streamed chunks from the Responses API and yields AG-UI events.
   * Override this in subclasses to handle provider-specific stream behavior.
   *
   * Handles the following event types:
   * - response.created / response.incomplete / response.failed
   * - response.output_text.delta
   * - response.reasoning_text.delta
   * - response.reasoning_summary_text.delta
   * - response.content_part.added / response.content_part.done
   * - response.output_item.added
   * - response.function_call_arguments.delta / response.function_call_arguments.done
   * - response.completed
   * - error
   */
  protected async *processStreamChunks(
    stream: AsyncIterable<ResponseStreamEvent>,
    toolCallMetadata: Map<
      string,
      {
        index: number
        name: string
        started: boolean
        ended?: boolean
        pendingArguments?: string
      }
    >,
    options: TextOptions<TProviderOptions>,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''

    // Track if we've been streaming deltas to avoid duplicating content from done events
    let hasStreamedContentDeltas = false
    let hasStreamedReasoningDeltas = false

    // Preserve response metadata across events
    let model: string = options.model

    // AG-UI lifecycle tracking
    let stepId: string | null = null
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false
    // Track whether we've emitted a terminal RUN_FINISHED so the
    // end-of-stream fallback below knows to synthesise one when the upstream
    // cuts off without a response.completed event.
    let runFinishedEmitted = false

    try {
      for await (const chunk of stream) {
        options.logger.provider(`provider=${this.name} type=${chunk.type}`, {
          provider: this.name,
          type: chunk.type,
        })

        // Emit RUN_STARTED on first chunk
        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield {
            type: EventType.RUN_STARTED,
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model: model || options.model,
            timestamp: Date.now(),
          }
        }

        const handleContentPart = (contentPart: {
          type: string
          text?: string
          refusal?: string
        }): StreamChunk => {
          if (contentPart.type === 'output_text') {
            accumulatedContent += contentPart.text || ''
            return {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp: Date.now(),
              delta: contentPart.text || '',
              content: accumulatedContent,
            }
          }

          if (contentPart.type === 'reasoning_text') {
            accumulatedReasoning += contentPart.text || ''
            // Cache the fallback stepId rather than generating a fresh one
            // on every call — otherwise multiple reasoning chunks arriving
            // before STEP_STARTED was emitted (e.g. via response.content_part.done
            // alone) would each get a different stepId and break correlation.
            if (!stepId) {
              stepId = generateId(this.name)
            }
            return {
              type: EventType.STEP_FINISHED,
              stepName: stepId,
              stepId,
              model: model || options.model,
              timestamp: Date.now(),
              delta: contentPart.text || '',
              content: accumulatedReasoning,
            }
          }
          // Either a real refusal or an unknown content_part type. Surface
          // the part type in the error so unknown parts are debuggable
          // instead of being misreported as "Unknown refusal".
          const isRefusal = contentPart.type === 'refusal'
          const message = isRefusal
            ? contentPart.refusal || 'Refused without explanation'
            : `Unsupported response content_part type: ${contentPart.type}`
          const code = isRefusal ? 'refusal' : contentPart.type
          return {
            type: EventType.RUN_ERROR,
            model: model || options.model,
            timestamp: Date.now(),
            message,
            code,
            error: { message, code },
          }
        }

        // Capture model metadata from any of these events (created starts
        // the run; failed/incomplete signal terminal failure).
        if (
          chunk.type === 'response.created' ||
          chunk.type === 'response.incomplete' ||
          chunk.type === 'response.failed'
        ) {
          model = chunk.response.model
        }

        // response.created marks the start of a fresh run — safe to reset
        // the per-run accumulators here.
        if (chunk.type === 'response.created') {
          hasStreamedContentDeltas = false
          hasStreamedReasoningDeltas = false
          hasEmittedTextMessageStart = false
          hasEmittedStepStarted = false
          accumulatedContent = ''
          accumulatedReasoning = ''
        }

        // response.failed and response.incomplete are TERMINAL events for
        // the current response. Close any open AG-UI message lifecycle FIRST
        // so consumers tracking start/end pairs don't see an unbalanced
        // TEXT_MESSAGE_START. Then surface the error and mark the run as
        // finished so the post-loop synthetic terminal block doesn't emit
        // a duplicate RUN_FINISHED on top of RUN_ERROR.
        if (
          chunk.type === 'response.failed' ||
          chunk.type === 'response.incomplete'
        ) {
          if (hasEmittedTextMessageStart) {
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: aguiState.messageId,
              model: chunk.response.model,
              timestamp: Date.now(),
            }
            hasEmittedTextMessageStart = false
          }
          // Coalesce error + incomplete_details into a single RUN_ERROR
          // payload — emitting two distinct events for one terminal upstream
          // event would force consumers to handle a non-existent ordering.
          const errorMessage =
            chunk.response.error?.message ||
            chunk.response.incomplete_details?.reason ||
            (chunk.type === 'response.failed'
              ? 'Response failed'
              : 'Response ended incomplete')
          const errorCode =
            chunk.response.error?.code ??
            (chunk.response.incomplete_details ? 'incomplete' : undefined) ??
            undefined
          // Always emit RUN_ERROR for terminal failure events, even when the
          // upstream omitted both `error` and `incomplete_details`. Skipping
          // emission on a `response.incomplete` with no detail would let the
          // post-loop synthetic block silently coerce the run to a clean
          // `RUN_FINISHED { finishReason: 'stop' }` — masking the failure.
          yield {
            type: EventType.RUN_ERROR,
            model: chunk.response.model,
            timestamp: Date.now(),
            message: errorMessage,
            ...(errorCode !== undefined && { code: errorCode }),
            error: {
              message: errorMessage,
              ...(errorCode !== undefined && { code: errorCode }),
            },
          }
          // RUN_ERROR is the terminal event for this run; stop processing
          // any further chunks the iterator might still deliver.
          runFinishedEmitted = true
          return
        }

        // Handle output text deltas (token-by-token streaming)
        // response.output_text.delta provides incremental text updates
        if (chunk.type === 'response.output_text.delta' && chunk.delta) {
          // Delta can be an array of strings or a single string
          const textDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (textDelta) {
            // Emit TEXT_MESSAGE_START on first text content
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId: aguiState.messageId,
                model: model || options.model,
                timestamp: Date.now(),
                role: 'assistant',
              }
            }

            accumulatedContent += textDelta
            hasStreamedContentDeltas = true
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp: Date.now(),
              delta: textDelta,
              content: accumulatedContent,
            }
          }
        }

        // Handle reasoning deltas (token-by-token thinking/reasoning streaming)
        // response.reasoning_text.delta provides incremental reasoning updates
        if (chunk.type === 'response.reasoning_text.delta' && chunk.delta) {
          // Delta can be an array of strings or a single string
          const reasoningDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (reasoningDelta) {
            // Emit STEP_STARTED on first reasoning content
            if (!hasEmittedStepStarted) {
              hasEmittedStepStarted = true
              stepId = generateId(this.name)
              yield {
                type: EventType.STEP_STARTED,
                stepName: stepId,
                stepId,
                model: model || options.model,
                timestamp: Date.now(),
                stepType: 'thinking',
              }
            }

            accumulatedReasoning += reasoningDelta
            hasStreamedReasoningDeltas = true
            const fallbackStepId = stepId || generateId(this.name)
            yield {
              type: EventType.STEP_FINISHED,
              stepName: fallbackStepId,
              stepId: fallbackStepId,
              model: model || options.model,
              timestamp: Date.now(),
              delta: reasoningDelta,
              content: accumulatedReasoning,
            }
          }
        }

        // Handle reasoning summary deltas (when using reasoning.summary option)
        // response.reasoning_summary_text.delta provides incremental summary updates
        if (
          chunk.type === 'response.reasoning_summary_text.delta' &&
          chunk.delta
        ) {
          const summaryDelta =
            typeof chunk.delta === 'string' ? chunk.delta : ''

          if (summaryDelta) {
            // Emit STEP_STARTED on first reasoning content
            if (!hasEmittedStepStarted) {
              hasEmittedStepStarted = true
              stepId = generateId(this.name)
              yield {
                type: EventType.STEP_STARTED,
                stepName: stepId,
                stepId,
                model: model || options.model,
                timestamp: Date.now(),
                stepType: 'thinking',
              }
            }

            accumulatedReasoning += summaryDelta
            hasStreamedReasoningDeltas = true
            const fallbackStepId = stepId || generateId(this.name)
            yield {
              type: EventType.STEP_FINISHED,
              stepName: fallbackStepId,
              stepId: fallbackStepId,
              model: model || options.model,
              timestamp: Date.now(),
              delta: summaryDelta,
              content: accumulatedReasoning,
            }
          }
        }

        // handle content_part added events for text, reasoning and refusals
        if (chunk.type === 'response.content_part.added') {
          const contentPart = chunk.part
          // Emit TEXT_MESSAGE_START if this is text content
          if (
            contentPart.type === 'output_text' &&
            !hasEmittedTextMessageStart
          ) {
            hasEmittedTextMessageStart = true
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp: Date.now(),
              role: 'assistant',
            }
          }
          // Emit STEP_STARTED if this is reasoning content
          if (contentPart.type === 'reasoning_text' && !hasEmittedStepStarted) {
            hasEmittedStepStarted = true
            stepId = generateId(this.name)
            yield {
              type: EventType.STEP_STARTED,
              stepName: stepId,
              stepId,
              model: model || options.model,
              timestamp: Date.now(),
              stepType: 'thinking',
            }
          }
          // Mark whichever stream we just emitted into so a subsequent
          // `content_part.done` doesn't duplicate the same text. Without
          // this flag, an `added` event carrying the full text followed by
          // a matching `done` event would emit TEXT_MESSAGE_CONTENT twice.
          if (contentPart.type === 'output_text') {
            hasStreamedContentDeltas = true
          } else if (contentPart.type === 'reasoning_text') {
            hasStreamedReasoningDeltas = true
          }
          const partChunk = handleContentPart(contentPart)
          yield partChunk
          // handleContentPart returns RUN_ERROR for refusals / unknown
          // content_part types — those are terminal events. Don't keep
          // processing more chunks (and don't let the post-loop synthetic
          // block emit a second terminal event).
          if (partChunk.type === 'RUN_ERROR') {
            runFinishedEmitted = true
            return
          }
        }

        if (chunk.type === 'response.content_part.done') {
          const contentPart = chunk.part

          // Skip emitting chunks for content parts that we've already streamed via deltas
          // The done event is just a completion marker, not new content
          if (contentPart.type === 'output_text' && hasStreamedContentDeltas) {
            // Content already accumulated from deltas, skip
            continue
          }
          if (
            contentPart.type === 'reasoning_text' &&
            hasStreamedReasoningDeltas
          ) {
            // Reasoning already accumulated from deltas, skip
            continue
          }

          // Upstreams that emit `content_part.done` without any preceding
          // deltas (or `content_part.added`) still need a START event before
          // CONTENT — otherwise consumers tracking start/end pairs see content
          // without a start and never see an end. Emit the lifecycle opener
          // for whichever stream this content_part belongs to before yielding
          // the CONTENT chunk; the post-loop block emits the matching END.
          if (
            contentPart.type === 'output_text' &&
            !hasEmittedTextMessageStart
          ) {
            hasEmittedTextMessageStart = true
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp: Date.now(),
              role: 'assistant',
            }
          } else if (
            contentPart.type === 'reasoning_text' &&
            !hasEmittedStepStarted
          ) {
            hasEmittedStepStarted = true
            stepId = generateId(this.name)
            yield {
              type: EventType.STEP_STARTED,
              stepName: stepId,
              stepId,
              model: model || options.model,
              timestamp: Date.now(),
              stepType: 'thinking',
            }
          }

          // Only emit if we haven't been streaming deltas (e.g., for non-streaming responses)
          const doneChunk = handleContentPart(contentPart)
          yield doneChunk
          if (doneChunk.type === 'RUN_ERROR') {
            runFinishedEmitted = true
            return
          }
        }

        // handle output_item.added to capture function call metadata (name)
        if (chunk.type === 'response.output_item.added') {
          const item = chunk.item
          if (item.type === 'function_call' && item.id) {
            const existing = toolCallMetadata.get(item.id)
            // Track the item as soon as we see it so subsequent arg deltas
            // aren't logged as orphans, but only emit TOOL_CALL_START when
            // both id AND name are populated. Emitting START with an empty
            // name would propagate into TOOL_CALL_END (which reads the same
            // metadata) and route the tool call to whatever name happens to
            // match `''` downstream — a silent misroute.
            if (!existing) {
              toolCallMetadata.set(item.id, {
                index: chunk.output_index,
                name: item.name || '',
                started: false,
              })
            } else if (!existing.name && item.name) {
              // A later output_item.added for the same id finally carries
              // the name. Update so the gated emission below can fire.
              existing.name = item.name
            }
            const metadata = toolCallMetadata.get(item.id)!
            if (!metadata.started && metadata.name) {
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: item.id,
                toolCallName: metadata.name,
                toolName: metadata.name,
                model: model || options.model,
                timestamp: Date.now(),
                index: chunk.output_index,
              }
              metadata.started = true
            }
          }
        }

        // Handle function call arguments delta (streaming). Drop the
        // previously-emitted `args` field — it had inverted polarity
        // (populated only when metadata was MISSING, i.e. when the
        // matching TOOL_CALL_START hadn't fired) and the chat-completions
        // adapter never emitted it, so it leaked partial deltas as
        // pseudo-args only on the orphan path. Consumers should accumulate
        // `delta` themselves.
        //
        // Guard with `metadata?.started`: the matching TOOL_CALL_START fires
        // from `output_item.added`, and emitting TOOL_CALL_ARGS before that
        // would violate the AG-UI lifecycle (ARGS without START). The .done
        // handler below applies the same guard.
        if (
          chunk.type === 'response.function_call_arguments.delta' &&
          chunk.delta
        ) {
          const metadata = toolCallMetadata.get(chunk.item_id)
          if (!metadata?.started) {
            options.logger.errors(
              `${this.name}.processStreamChunks orphan function_call_arguments.delta`,
              {
                source: `${this.name}.processStreamChunks`,
                toolCallId: chunk.item_id,
                rawDelta: chunk.delta,
              },
            )
            continue
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: chunk.item_id,
            model: model || options.model,
            timestamp: Date.now(),
            delta: chunk.delta,
          }
        }

        if (chunk.type === 'response.function_call_arguments.done') {
          const { item_id } = chunk

          // Get the function name from metadata (captured in output_item.added)
          const metadata = toolCallMetadata.get(item_id)
          // If the matching START was never emitted (the upstream sent an
          // `output_item.added` without a name and no later event has filled
          // it in yet), defer END until `output_item.done` or
          // `response.completed` can backfill the name. We stash the raw
          // arguments so the late emission has them. Emitting END without
          // START would produce an unbalanced AG-UI lifecycle event
          // downstream consumers can't pair.
          if (!metadata?.started) {
            if (metadata) {
              metadata.pendingArguments = chunk.arguments
            }
            options.logger.errors(
              `${this.name}.processStreamChunks deferring function_call_arguments.done — TOOL_CALL_START not yet emitted (waiting for name)`,
              {
                source: `${this.name}.processStreamChunks`,
                toolCallId: item_id,
                rawArguments: chunk.arguments,
              },
            )
            continue
          }
          // The output_item.done backstop may have already emitted END (when
          // it arrived before args.done with a populated item.arguments).
          // Skip so we never produce a duplicate close for the same id.
          if (metadata.ended) continue
          const name = metadata.name || ''
          metadata.ended = true

          // Parse arguments. Surface parse failures via the logger so a
          // model emitting malformed JSON is debuggable instead of silently
          // invoking the tool with {}.
          let parsedInput: unknown = {}
          if (chunk.arguments) {
            try {
              const parsed = JSON.parse(chunk.arguments)
              parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
            } catch (parseError) {
              options.logger.errors(
                `${this.name}.processStreamChunks tool-args JSON parse failed`,
                {
                  error: toRunErrorPayload(
                    parseError,
                    `tool ${name} (${item_id}) returned malformed JSON arguments`,
                  ),
                  source: `${this.name}.processStreamChunks`,
                  toolCallId: item_id,
                  toolName: name,
                  rawArguments: chunk.arguments,
                },
              )
              parsedInput = {}
            }
          }

          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: item_id,
            toolCallName: name,
            toolName: name,
            model: model || options.model,
            timestamp: Date.now(),
            input: parsedInput,
          }
        }

        // `output_item.done` is the last point at which a function_call's
        // name is guaranteed to be on the wire — it carries the fully-formed
        // ResponseFunctionToolCall. Use it as a backstop to recover any
        // tool call whose name was missing from `output_item.added` (and
        // whose START + END therefore never fired).
        if (chunk.type === 'response.output_item.done') {
          const item = chunk.item
          if (item.type === 'function_call' && item.id) {
            const metadata = toolCallMetadata.get(item.id) ?? {
              index: chunk.output_index,
              name: item.name || '',
              started: false,
            }
            if (!toolCallMetadata.has(item.id)) {
              toolCallMetadata.set(item.id, metadata)
            } else if (!metadata.name && item.name) {
              metadata.name = item.name
            }
            // Emit gated START if we now have a name and never started.
            if (!metadata.started && metadata.name) {
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: item.id,
                toolCallName: metadata.name,
                toolName: metadata.name,
                model: model || options.model,
                timestamp: Date.now(),
                index: metadata.index,
              }
              metadata.started = true
            }
            // Emit END if we have args (either from a previously-deferred
            // args.done OR from item.arguments) and haven't already ended.
            const rawArgs =
              typeof item.arguments === 'string' && item.arguments.length > 0
                ? item.arguments
                : metadata.pendingArguments
            if (metadata.started && !metadata.ended && rawArgs !== undefined) {
              const name = metadata.name || ''
              let parsedInput: unknown = {}
              if (rawArgs) {
                try {
                  const parsed = JSON.parse(rawArgs)
                  parsedInput =
                    parsed && typeof parsed === 'object' ? parsed : {}
                } catch (parseError) {
                  options.logger.errors(
                    `${this.name}.processStreamChunks tool-args JSON parse failed (output_item.done backfill)`,
                    {
                      error: toRunErrorPayload(
                        parseError,
                        `tool ${name} (${item.id}) returned malformed JSON arguments`,
                      ),
                      source: `${this.name}.processStreamChunks`,
                      toolCallId: item.id,
                      toolName: name,
                      rawArguments: rawArgs,
                    },
                  )
                  parsedInput = {}
                }
              }
              yield {
                type: EventType.TOOL_CALL_END,
                toolCallId: item.id,
                toolCallName: name,
                toolName: name,
                model: model || options.model,
                timestamp: Date.now(),
                input: parsedInput,
              }
              metadata.ended = true
              metadata.pendingArguments = undefined
            }
          }
        }

        if (chunk.type === 'response.completed') {
          // Final backstop for function_call lifecycle: if a function_call
          // appears in `response.output[]` but was never matched by an
          // output_item.added/done with a name, recover the missing START
          // (and END if args were pending). Without this, a tool call could
          // be silently dropped from the AG-UI stream while `hasFunctionCalls`
          // below still routes the run's finishReason to 'tool_calls' —
          // leaving consumers waiting for tool results they never saw start.
          for (const item of chunk.response.output) {
            if (item.type !== 'function_call' || !item.id) continue
            const metadata = toolCallMetadata.get(item.id) ?? {
              index: 0,
              name: item.name || '',
              started: false,
            }
            if (!toolCallMetadata.has(item.id)) {
              toolCallMetadata.set(item.id, metadata)
            } else if (!metadata.name && item.name) {
              metadata.name = item.name
            }
            if (!metadata.started && metadata.name) {
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: item.id,
                toolCallName: metadata.name,
                toolName: metadata.name,
                model: model || options.model,
                timestamp: Date.now(),
                index: metadata.index,
              }
              metadata.started = true
            }
            const rawArgs =
              typeof item.arguments === 'string' && item.arguments.length > 0
                ? item.arguments
                : metadata.pendingArguments
            if (metadata.started && !metadata.ended) {
              const name = metadata.name || ''
              let parsedInput: unknown = {}
              if (rawArgs) {
                try {
                  const parsed = JSON.parse(rawArgs)
                  parsedInput =
                    parsed && typeof parsed === 'object' ? parsed : {}
                } catch (parseError) {
                  options.logger.errors(
                    `${this.name}.processStreamChunks tool-args JSON parse failed (response.completed backfill)`,
                    {
                      error: toRunErrorPayload(
                        parseError,
                        `tool ${name} (${item.id}) returned malformed JSON arguments`,
                      ),
                      source: `${this.name}.processStreamChunks`,
                      toolCallId: item.id,
                      toolName: name,
                      rawArguments: rawArgs,
                    },
                  )
                  parsedInput = {}
                }
              }
              yield {
                type: EventType.TOOL_CALL_END,
                toolCallId: item.id,
                toolCallName: name,
                toolName: name,
                model: model || options.model,
                timestamp: Date.now(),
                input: parsedInput,
              }
              metadata.ended = true
              metadata.pendingArguments = undefined
            }
          }

          // Emit TEXT_MESSAGE_END if we had text content
          if (hasEmittedTextMessageStart) {
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp: Date.now(),
            }
            hasEmittedTextMessageStart = false
          }

          // Determine finish reason. Function-call output → tool_calls.
          // Otherwise surface incomplete_details.reason when present so
          // callers can distinguish length-limit / content-filter cutoffs
          // from a clean stop, mirroring the chat-completions adapter.
          // The Responses API's incomplete_details.reason ('max_output_tokens'
          // | 'content_filter') maps to the AG-UI finishReason vocabulary:
          // max_output_tokens → 'length', content_filter → 'content_filter'.
          const hasFunctionCalls = chunk.response.output.some(
            (item: unknown) =>
              (item as { type: string }).type === 'function_call',
          )
          const incompleteReason = chunk.response.incomplete_details?.reason
          const finishReason:
            | 'tool_calls'
            | 'length'
            | 'content_filter'
            | 'stop' = hasFunctionCalls
            ? 'tool_calls'
            : incompleteReason === 'max_output_tokens'
              ? 'length'
              : incompleteReason === 'content_filter'
                ? 'content_filter'
                : 'stop'

          yield {
            type: EventType.RUN_FINISHED,
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model: model || options.model,
            timestamp: Date.now(),
            usage: {
              promptTokens: chunk.response.usage?.input_tokens || 0,
              completionTokens: chunk.response.usage?.output_tokens || 0,
              totalTokens: chunk.response.usage?.total_tokens || 0,
            },
            finishReason,
          }
          runFinishedEmitted = true
        }

        if (chunk.type === 'error') {
          yield {
            type: EventType.RUN_ERROR,
            model: model || options.model,
            timestamp: Date.now(),
            message: chunk.message,
            code: chunk.code ?? undefined,
            error: {
              message: chunk.message,
              code: chunk.code ?? undefined,
            },
          }
          // RUN_ERROR is terminal — don't let the synthetic RUN_FINISHED
          // block fire after a top-level stream error event, and stop
          // processing further chunks so no in-flight lifecycle events
          // (TEXT_MESSAGE_CONTENT, TOOL_CALL_*) leak past the terminal
          // error. Mirrors the `response.failed` / `response.incomplete`
          // branches above which return after their RUN_ERROR emission.
          runFinishedEmitted = true
          return
        }
      }

      // Synthetic terminal RUN_FINISHED if the stream ended without a
      // response.completed event (e.g. truncated upstream connection). This
      // mirrors the chat-completions adapter's behavior so consumers always
      // see a terminal event for every started run.
      if (!runFinishedEmitted && aguiState.hasEmittedRunStarted) {
        if (hasEmittedTextMessageStart) {
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId: aguiState.messageId,
            model: model || options.model,
            timestamp: Date.now(),
          }
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: model || options.model,
          timestamp: Date.now(),
          usage: undefined,
          finishReason: toolCallMetadata.size > 0 ? 'tool_calls' : 'stop',
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
   * Maps common TextOptions to Responses API request format.
   * Override this in subclasses to add provider-specific options.
   */
  protected mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const input = this.convertMessagesToInput(options.messages)

    const tools = options.tools
      ? convertToolsToResponsesFormat(
          options.tools,
          this.makeStructuredOutputCompatible.bind(this),
        )
      : undefined

    const modelOptions = options.modelOptions

    // Spread modelOptions first, then explicit top-level options when set.
    // Mirrors the chat-completions base adapter's precedence so callers
    // tuning either backend get identical behaviour. Leaving `modelOptions`
    // last (its previous behavior) silently shadowed the canonical
    // `options.temperature`/`maxTokens` fields, while spreading first
    // without nullish-aware merge would clobber `modelOptions.temperature`
    // with `undefined` whenever the caller didn't set the top-level option.
    return {
      ...modelOptions,
      model: options.model,
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.maxTokens !== undefined && {
        max_output_tokens: options.maxTokens,
      }),
      ...(options.topP !== undefined && { top_p: options.topP }),
      ...(options.metadata !== undefined && { metadata: options.metadata }),
      ...(options.systemPrompts &&
        options.systemPrompts.length > 0 && {
          instructions: options.systemPrompts.join('\n'),
        }),
      input,
      // Conditional spread: `tools: undefined` would clobber any
      // modelOptions.tools the caller set above.
      ...(tools && tools.length > 0 && { tools }),
    }
  }

  /**
   * Converts ModelMessage[] to Responses API ResponseInput format.
   * Override this in subclasses for provider-specific message format quirks.
   *
   * Key differences from Chat Completions:
   * - Tool results use `function_call_output` type (not `tool` role)
   * - Assistant tool calls are `function_call` objects (not nested in `tool_calls`)
   * - User content uses `input_text`, `input_image`, `input_file` types
   * - System prompts go in `instructions`, not as messages
   */
  protected convertMessagesToInput(
    messages: Array<ModelMessage>,
  ): ResponseInput {
    const result: ResponseInput = []

    for (const message of messages) {
      // Handle tool messages - convert to FunctionToolCallOutput
      if (message.role === 'tool') {
        result.push({
          type: 'function_call_output',
          call_id: message.toolCallId || '',
          output:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
        })
        continue
      }

      // Handle assistant messages
      if (message.role === 'assistant') {
        // If the assistant message has tool calls, add them as FunctionToolCall objects
        // Responses API expects arguments as a string (JSON string)
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            // Keep arguments as string for Responses API
            const argumentsString =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments)

            result.push({
              type: 'function_call',
              call_id: toolCall.id,
              name: toolCall.function.name,
              arguments: argumentsString,
            })
          }
        }

        // Add the assistant's text message if there is content
        if (message.content) {
          const contentStr = this.extractTextContent(message.content)
          if (contentStr) {
            result.push({
              type: 'message',
              role: 'assistant',
              content: contentStr,
            })
          }
        }

        continue
      }

      // Handle user messages (default case) — support multimodal content
      const contentParts = this.normalizeContent(message.content)
      const inputContent: Array<ResponseInputContent> = []

      for (const part of contentParts) {
        inputContent.push(this.convertContentPartToInput(part))
      }

      if (inputContent.length === 0) {
        // Fail loud rather than silently sending an empty user message —
        // mirrors the chat-completions adapter, where a paid-but-empty
        // request would mask the real intent (caller passed `null` content
        // or a normalize step dropped everything).
        throw new Error(
          `User message for ${this.name} has no content parts. ` +
            `Empty user messages would produce a paid request with no input; ` +
            `provide at least one text/image/audio part or omit the message.`,
        )
      }

      result.push({
        type: 'message',
        role: 'user',
        content: inputContent,
      })
    }

    return result
  }

  /**
   * Converts a ContentPart to Responses API input content item.
   * Handles text, image, and audio content parts.
   * Override this in subclasses for additional content types or provider-specific metadata.
   */
  protected convertContentPartToInput(part: ContentPart): ResponseInputContent {
    switch (part.type) {
      case 'text':
        return {
          type: 'input_text',
          text: part.content,
        }
      case 'image': {
        const imageMetadata = part.metadata as
          | { detail?: 'auto' | 'low' | 'high' }
          | undefined
        if (part.source.type === 'url') {
          return {
            type: 'input_image',
            image_url: part.source.value,
            detail: imageMetadata?.detail || 'auto',
          }
        }
        // For base64 data, construct a data URI using the mimeType from
        // source. Default to a generic octet-stream MIME if the source
        // didn't supply one — letting `undefined` interpolate would produce
        // an invalid URI like "data:undefined;base64,...".
        const imageValue = part.source.value
        const imageMime = part.source.mimeType || 'application/octet-stream'
        const imageUrl = imageValue.startsWith('data:')
          ? imageValue
          : `data:${imageMime};base64,${imageValue}`
        return {
          type: 'input_image',
          image_url: imageUrl,
          detail: imageMetadata?.detail || 'auto',
        }
      }
      case 'audio': {
        if (part.source.type === 'url') {
          return {
            type: 'input_file',
            file_url: part.source.value,
          }
        }
        // Wrap raw base64 in a data URL — `input_file` rejects bare base64
        // payloads (matches the image branch above which already does this).
        // Default the MIME if missing so we never interpolate `undefined`.
        const audioValue = part.source.value
        const audioMime = part.source.mimeType || 'application/octet-stream'
        const audioFileData = audioValue.startsWith('data:')
          ? audioValue
          : `data:${audioMime};base64,${audioValue}`
        return {
          type: 'input_file',
          file_data: audioFileData,
        }
      }

      default:
        throw new Error(`Unsupported content part type: ${part.type}`)
    }
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
