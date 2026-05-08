import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId, transformNullsToUndefined } from '@tanstack/ai-utils'
import { createOpenAICompatibleClient } from '../utils/client'
import { extractRequestOptions } from '../utils/request-options'
import { makeStructuredOutputCompatible } from '../utils/schema-converter'
import { convertToolsToResponsesFormat } from './responses-tool-converter'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type OpenAI_SDK from 'openai'
import type { Responses } from 'openai/resources'
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
 * OpenAI-compatible Responses API Text Adapter
 *
 * A generalized base class for providers that use the OpenAI Responses API
 * (`/v1/responses`). Providers like OpenAI (native), Azure OpenAI, and others
 * that implement the Responses API can extend this class and only need to:
 * - Set `baseURL` in the config
 * - Lock the generic type parameters to provider-specific types
 * - Override specific methods for quirks
 *
 * Key differences from the Chat Completions adapter:
 * - Uses `client.responses.create()` instead of `client.chat.completions.create()`
 * - Messages use `ResponseInput` format
 * - System prompts go in `instructions` field, not as array messages
 * - Streaming events are completely different (9+ event types vs simple delta chunks)
 * - Supports reasoning/thinking tokens via `response.reasoning_text.delta`
 * - Structured output uses `text.format` in the request (not `response_format`)
 * - Tool calls use `response.function_call_arguments.delta`
 * - Content parts are `input_text`, `input_image`, `input_file`
 *
 * All methods that build requests or process responses are `protected` so subclasses
 * can override them.
 */
export class OpenAICompatibleResponsesTextAdapter<
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
    name: string = 'openai-compatible-responses',
  ) {
    super({}, model)
    this.name = name
    this.client = createOpenAICompatibleClient(config)
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
      { index: number; name: string; started: boolean }
    >()
    const requestParams = this.mapOptionsToRequest(options)
    const timestamp = Date.now()

    // AG-UI lifecycle tracking
    const aguiState = {
      runId: generateId(this.name),
      messageId: generateId(this.name),
      timestamp,
      hasEmittedRunStarted: false,
    }

    try {
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
          ...(cleanParams as Omit<
            OpenAI_SDK.Responses.ResponseCreateParams,
            'stream'
          >),
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
      const rawText = this.extractTextFromResponse(
        response satisfies OpenAI_SDK.Responses.Response,
      )

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
    originalRequired?: Array<string>,
  ): Record<string, any> {
    return makeStructuredOutputCompatible(schema, originalRequired)
  }

  /**
   * Extract text content from a non-streaming Responses API response.
   * Override this in subclasses for provider-specific response shapes.
   */
  protected extractTextFromResponse(
    response: OpenAI_SDK.Responses.Response,
  ): string {
    let textContent = ''
    let refusal: string | undefined

    for (const item of response.output) {
      if (item.type === 'message') {
        for (const part of item.content) {
          if (part.type === 'output_text') {
            textContent += part.text
          } else {
            // The Responses SDK currently models message content as
            // `output_text | refusal`, so the only non-text branch is a
            // refusal. Capture it so we can surface a distinct error below.
            refusal = part.refusal || refusal || 'Refused without explanation'
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
    stream: AsyncIterable<OpenAI_SDK.Responses.ResponseStreamEvent>,
    toolCallMetadata: Map<
      string,
      { index: number; name: string; started: boolean }
    >,
    options: TextOptions<TProviderOptions>,
    aguiState: {
      runId: string
      messageId: string
      timestamp: number
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''
    const timestamp = aguiState.timestamp

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
          yield asChunk({
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            model: model || options.model,
            timestamp,
          })
        }

        const handleContentPart = (contentPart: {
          type: string
          text?: string
          refusal?: string
        }): StreamChunk => {
          if (contentPart.type === 'output_text') {
            accumulatedContent += contentPart.text || ''
            return asChunk({
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp,
              delta: contentPart.text || '',
              content: accumulatedContent,
            })
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
            return asChunk({
              type: 'STEP_FINISHED',
              stepId,
              model: model || options.model,
              timestamp,
              delta: contentPart.text || '',
              content: accumulatedReasoning,
            })
          }
          // Either a real refusal or an unknown content_part type. Surface
          // the part type in the error so unknown parts are debuggable
          // instead of being misreported as "Unknown refusal".
          const isRefusal = contentPart.type === 'refusal'
          const message = isRefusal
            ? contentPart.refusal || 'Refused without explanation'
            : `Unsupported response content_part type: ${contentPart.type}`
          return asChunk({
            type: 'RUN_ERROR',
            runId: aguiState.runId,
            model: model || options.model,
            timestamp,
            error: {
              message,
              code: isRefusal ? 'refusal' : contentPart.type,
            },
          })
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
            yield asChunk({
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: chunk.response.model,
              timestamp,
            })
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
            chunk.response.error?.code ||
            (chunk.response.incomplete_details ? 'incomplete' : undefined)
          // Always emit RUN_ERROR for terminal failure events, even when the
          // upstream omitted both `error` and `incomplete_details`. Skipping
          // emission on a `response.incomplete` with no detail would let the
          // post-loop synthetic block silently coerce the run to a clean
          // `RUN_FINISHED { finishReason: 'stop' }` — masking the failure.
          yield asChunk({
            type: 'RUN_ERROR',
            runId: aguiState.runId,
            model: chunk.response.model,
            timestamp,
            error: {
              message: errorMessage,
              ...(errorCode !== undefined && { code: errorCode }),
            },
          })
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
              yield asChunk({
                type: 'TEXT_MESSAGE_START',
                messageId: aguiState.messageId,
                model: model || options.model,
                timestamp,
                role: 'assistant',
              })
            }

            accumulatedContent += textDelta
            hasStreamedContentDeltas = true
            yield asChunk({
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp,
              delta: textDelta,
              content: accumulatedContent,
            })
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
              yield asChunk({
                type: 'STEP_STARTED',
                stepId,
                model: model || options.model,
                timestamp,
                stepType: 'thinking',
              })
            }

            accumulatedReasoning += reasoningDelta
            hasStreamedReasoningDeltas = true
            yield asChunk({
              type: 'STEP_FINISHED',
              stepId: stepId || generateId(this.name),
              model: model || options.model,
              timestamp,
              delta: reasoningDelta,
              content: accumulatedReasoning,
            })
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
              yield asChunk({
                type: 'STEP_STARTED',
                stepId,
                model: model || options.model,
                timestamp,
                stepType: 'thinking',
              })
            }

            accumulatedReasoning += summaryDelta
            hasStreamedReasoningDeltas = true
            yield asChunk({
              type: 'STEP_FINISHED',
              stepId: stepId || generateId(this.name),
              model: model || options.model,
              timestamp,
              delta: summaryDelta,
              content: accumulatedReasoning,
            })
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
            yield asChunk({
              type: 'TEXT_MESSAGE_START',
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp,
              role: 'assistant',
            })
          }
          // Emit STEP_STARTED if this is reasoning content
          if (contentPart.type === 'reasoning_text' && !hasEmittedStepStarted) {
            hasEmittedStepStarted = true
            stepId = generateId(this.name)
            yield asChunk({
              type: 'STEP_STARTED',
              stepId,
              model: model || options.model,
              timestamp,
              stepType: 'thinking',
            })
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
            // Only emit TOOL_CALL_START on the FIRST output_item.added for
            // an item id. A duplicate emission (which can happen on retried
            // streams or replay) would violate AG-UI's start-once contract.
            if (!existing?.started) {
              if (!existing) {
                toolCallMetadata.set(item.id, {
                  index: chunk.output_index,
                  name: item.name || '',
                  started: false,
                })
              }
              yield asChunk({
                type: 'TOOL_CALL_START',
                toolCallId: item.id,
                toolCallName: item.name || '',
                toolName: item.name || '',
                model: model || options.model,
                timestamp,
                index: chunk.output_index,
              })
              toolCallMetadata.get(item.id)!.started = true
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
          yield asChunk({
            type: 'TOOL_CALL_ARGS',
            toolCallId: chunk.item_id,
            model: model || options.model,
            timestamp,
            delta: chunk.delta,
          })
        }

        if (chunk.type === 'response.function_call_arguments.done') {
          const { item_id } = chunk

          // Get the function name from metadata (captured in output_item.added)
          const metadata = toolCallMetadata.get(item_id)
          // Skip TOOL_CALL_END for items whose start was never emitted (no
          // matching `output_item.added`). Emitting END without START would
          // produce an unbalanced AG-UI lifecycle event downstream consumers
          // can't pair.
          if (!metadata?.started) {
            options.logger.errors(
              `${this.name}.processStreamChunks orphan function_call_arguments.done`,
              {
                source: `${this.name}.processStreamChunks`,
                toolCallId: item_id,
                rawArguments: chunk.arguments,
              },
            )
            continue
          }
          const name = metadata.name || ''

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

          yield asChunk({
            type: 'TOOL_CALL_END',
            toolCallId: item_id,
            toolCallName: name,
            toolName: name,
            model: model || options.model,
            timestamp,
            input: parsedInput,
          })
        }

        if (chunk.type === 'response.completed') {
          // Emit TEXT_MESSAGE_END if we had text content
          if (hasEmittedTextMessageStart) {
            yield asChunk({
              type: 'TEXT_MESSAGE_END',
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp,
            })
            hasEmittedTextMessageStart = false
          }

          // Determine finish reason. Function-call output → tool_calls.
          // Otherwise surface incomplete_details.reason when present so
          // callers can distinguish length-limit / content-filter cutoffs
          // from a clean stop, mirroring the chat-completions adapter.
          const hasFunctionCalls = chunk.response.output.some(
            (item: unknown) =>
              (item as { type: string }).type === 'function_call',
          )
          const finishReason: string = hasFunctionCalls
            ? 'tool_calls'
            : (chunk.response.incomplete_details?.reason ?? 'stop')

          yield asChunk({
            type: 'RUN_FINISHED',
            runId: aguiState.runId,
            model: model || options.model,
            timestamp,
            usage: {
              promptTokens: chunk.response.usage?.input_tokens || 0,
              completionTokens: chunk.response.usage?.output_tokens || 0,
              totalTokens: chunk.response.usage?.total_tokens || 0,
            },
            finishReason,
          })
          runFinishedEmitted = true
        }

        if (chunk.type === 'error') {
          yield asChunk({
            type: 'RUN_ERROR',
            runId: aguiState.runId,
            model: model || options.model,
            timestamp,
            error: {
              message: chunk.message,
              code: chunk.code ?? undefined,
            },
          })
          // RUN_ERROR is terminal — don't let the synthetic RUN_FINISHED
          // block fire after a top-level stream error event.
          runFinishedEmitted = true
        }
      }

      // Synthetic terminal RUN_FINISHED if the stream ended without a
      // response.completed event (e.g. truncated upstream connection). This
      // mirrors the chat-completions adapter's behavior so consumers always
      // see a terminal event for every started run.
      if (!runFinishedEmitted && aguiState.hasEmittedRunStarted) {
        if (hasEmittedTextMessageStart) {
          yield asChunk({
            type: 'TEXT_MESSAGE_END',
            messageId: aguiState.messageId,
            model: model || options.model,
            timestamp,
          })
        }
        yield asChunk({
          type: 'RUN_FINISHED',
          runId: aguiState.runId,
          model: model || options.model,
          timestamp,
          usage: undefined,
          finishReason: toolCallMetadata.size > 0 ? 'tool_calls' : 'stop',
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
   * Maps common TextOptions to Responses API request format.
   * Override this in subclasses to add provider-specific options.
   */
  protected mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): Omit<OpenAI_SDK.Responses.ResponseCreateParams, 'stream'> {
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
  ): Responses.ResponseInput {
    const result: Responses.ResponseInput = []

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
      const inputContent: Array<Responses.ResponseInputContent> = []

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
  protected convertContentPartToInput(
    part: ContentPart,
  ): Responses.ResponseInputContent {
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
