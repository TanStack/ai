import { OpenRouter } from '@openrouter/sdk'
import { EventType } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId, transformNullsToUndefined } from '@tanstack/ai-utils'
import { extractRequestOptions } from '../internal/request-options'
import { makeStructuredOutputCompatible } from '../internal/schema-converter'
import { convertFunctionToolToResponsesFormat } from '../internal/responses-tool-converter'
import { isWebSearchTool } from '../tools/web-search-tool'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import type { SDKOptions } from '@openrouter/sdk'
import type { ResponsesFunctionTool } from '../internal/responses-tool-converter'
import type {
  InputsUnion,
  OpenResponsesResult,
  ResponsesRequest,
  StreamEvents,
} from '@openrouter/sdk/models'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  ContentPart,
  ModelMessage,
  StreamChunk,
  TextOptions,
  Tool,
} from '@tanstack/ai'
import type { ExternalResponsesProviderOptions } from '../text/responses-provider-options'
import type {
  OPENROUTER_CHAT_MODELS,
  OpenRouterChatModelToolCapabilitiesByName,
  OpenRouterModelInputModalitiesByName,
} from '../model-meta'
import type { OpenRouterMessageMetadataByModality } from '../message-types'

/** Element type of `ResponsesRequest.input` when it's the array form (the
 *  SDK union also allows a bare string). Pinning to the array element lets
 *  the convertMessagesToInput logic narrow to the per-item discriminated
 *  union so a TS rename surfaces here. */
type InputsItem = Extract<InputsUnion, ReadonlyArray<unknown>>[number]
/** ResponsesRequest input content part shape (per-content-part discriminated union). */
type ResponsesInputContent = unknown

export interface OpenRouterResponsesConfig extends SDKOptions {}
export type OpenRouterResponsesTextModels =
  (typeof OPENROUTER_CHAT_MODELS)[number]
export type OpenRouterResponsesTextProviderOptions =
  ExternalResponsesProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenRouterModelInputModalitiesByName
    ? OpenRouterModelInputModalitiesByName[TModel]
    : readonly ['text', 'image']

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof OpenRouterChatModelToolCapabilitiesByName
    ? NonNullable<OpenRouterChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * OpenRouter Responses (beta) Adapter — standalone implementation that talks
 * to OpenRouter's `/v1/responses` (beta) endpoint via the `@openrouter/sdk`
 * SDK.
 *
 * The wire format is OpenAI-Responses-compatible (so OpenRouter can route
 * Responses requests to GPT, Claude, Gemini, etc.) but the SDK exposes the
 * request/response in camelCase TS shapes (`callId`, `imageUrl`,
 * `fileData`, `outputIndex`, `itemId`, `inputTokens`, `incompleteDetails`,
 * etc.). This adapter operates directly in those camelCase shapes — there's
 * no snake_case ↔ camelCase round-trip.
 *
 * v1 routes function tools only. Passing a `webSearchTool()` brand throws
 * — OpenRouter's Responses API exposes richer server-tool variants
 * (WebSearchServerToolOpenRouter / Preview20250311WebSearchServerTool /
 * …) that will land in a follow-up.
 */
export class OpenRouterResponsesTextAdapter<
  TModel extends OpenRouterResponsesTextModels,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends BaseTextAdapter<
  TModel,
  OpenRouterResponsesTextProviderOptions,
  ResolveInputModalities<TModel>,
  OpenRouterMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name = 'openrouter-responses' as const

  protected orClient: OpenRouter

  constructor(config: OpenRouterResponsesConfig, model: TModel) {
    super({}, model)
    this.orClient = new OpenRouter(config)
  }

  async *chatStream(
    options: TextOptions<OpenRouterResponsesTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    // Track tool call metadata by unique ID. The Responses API streams tool
    // calls with deltas — first chunk has ID/name, subsequent chunks only
    // have args. We assign our own indices as we encounter unique ids.
    const toolCallMetadata = new Map<
      string,
      {
        index: number
        name: string
        started: boolean
        ended?: boolean
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
      // (empty user content, unsupported parts, webSearchTool() rejection).
      // Keep it inside the try so those failures surface as RUN_ERROR events
      // instead of iterator throws.
      const responsesRequest = this.mapOptionsToRequest(options)
      options.logger.request(
        `activity=chat provider=${this.name} model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: this.name, model: this.model },
      )
      const reqOptions = extractRequestOptions(options.request)
      const response = (await this.orClient.beta.responses.send(
        { responsesRequest: { ...responsesRequest, stream: true } },
        {
          signal: reqOptions.signal ?? undefined,
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
      )) as AsyncIterable<StreamEvents>

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
        } satisfies StreamChunk
      }

      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        code: errorPayload.code,
        error: errorPayload,
      } satisfies StreamChunk

      options.logger.errors(`${this.name}.chatStream fatal`, {
        error: errorPayload,
        source: `${this.name}.chatStream`,
      })
    }
  }

  /**
   * Generate structured output via OpenRouter's Responses API
   * `text.format: { type: 'json_schema', ... }`. Uses stream: false.
   */
  async structuredOutput(
    options: StructuredOutputOptions<OpenRouterResponsesTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const responsesRequest = this.mapOptionsToRequest(chatOptions)

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    try {
      chatOptions.logger.request(
        `activity=structuredOutput provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      const reqOptions = extractRequestOptions(chatOptions.request)
      const response = await this.orClient.beta.responses.send(
        {
          responsesRequest: {
            ...responsesRequest,
            stream: false,
            text: {
              format: {
                type: 'json_schema',
                name: 'structured_output',
                schema: jsonSchema,
                strict: true,
              },
            } as ResponsesRequest['text'],
          },
        },
        {
          signal: reqOptions.signal ?? undefined,
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
      )

      const rawText = this.extractTextFromResponse(response)

      if (rawText.length === 0) {
        throw new Error(
          `${this.name}.structuredOutput: response contained no content`,
        )
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      // OpenRouter override: pass nulls through unchanged.
      const transformed = this.transformStructuredOutput(parsed)

      return {
        data: transformed,
        rawText,
      }
    } catch (error: unknown) {
      chatOptions.logger.errors(`${this.name}.structuredOutput fatal`, {
        error: toRunErrorPayload(error, `${this.name}.structuredOutput failed`),
        source: `${this.name}.structuredOutput`,
      })
      throw error
    }
  }

  protected makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): Record<string, any> {
    return makeStructuredOutputCompatible(schema, originalRequired)
  }

  /**
   * OpenRouter routes through a wide variety of upstream providers; some
   * return `null` as a distinct sentinel rather than collapsing it to absent.
   * Stripping nulls would erase that distinction, so we passthrough.
   *
   * `transformNullsToUndefined` is imported for parity with the other
   * provider adapters but intentionally not invoked here.
   */
  protected transformStructuredOutput(parsed: unknown): unknown {
    void transformNullsToUndefined
    return parsed
  }

  /**
   * Extract text content from a non-streaming Responses API response.
   * Reads OpenRouter's camelCase `OpenResponsesResult` shape directly.
   */
  protected extractTextFromResponse(response: OpenResponsesResult): string {
    let textContent = ''
    let refusal: string | undefined
    let sawMessageItem = false
    const observedItemTypes = new Set<string>()

    for (const rawItem of response.output) {
      const item = rawItem as { type: string; content?: ReadonlyArray<unknown> }
      observedItemTypes.add(item.type)
      if (item.type === 'message') {
        sawMessageItem = true
        for (const part of item.content ?? []) {
          // Cast off the discriminated union before the type discrimination
          // so future SDK variants (e.g. `output_audio`, `output_image`) hit
          // the explicit error path rather than being misreported as refusals
          // when they get added to the union.
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
   * Processes streamed events from the OpenRouter Responses API and yields
   * AG-UI events. Reads the SDK's camelCase event shape directly
   * (`itemId`, `outputIndex`, `incompleteDetails`, `inputTokens`, etc.).
   *
   * Speakeasy's discriminated-union parser falls back to
   * `{ raw, type: 'UNKNOWN', isUnknown: true }` when an event's strict
   * per-variant schema rejects (missing optional fields like `sequenceNumber`
   * that some upstreams omit). The `raw` payload is the original wire-shape
   * event in snake_case. We translate snake_case keys to camelCase for those
   * unknown events so the rest of the processor reads a uniform shape.
   */
  protected async *processStreamChunks(
    stream: AsyncIterable<StreamEvents>,
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
    options: TextOptions<OpenRouterResponsesTextProviderOptions>,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''

    let hasStreamedContentDeltas = false
    let hasStreamedReasoningDeltas = false

    let model: string = options.model

    let stepId: string | null = null
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false
    let runFinishedEmitted = false

    try {
      for await (const rawEvent of stream) {
        const chunk = normalizeStreamEvent(rawEvent)
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
          } satisfies StreamChunk
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
            } satisfies StreamChunk
          }

          if (contentPart.type === 'reasoning_text') {
            accumulatedReasoning += contentPart.text || ''
            // Cache the fallback stepId rather than generating a fresh one
            // on every call.
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
            } satisfies StreamChunk
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
          } satisfies StreamChunk
        }

        // Capture model metadata from any of these events.
        if (
          chunk.type === 'response.created' ||
          chunk.type === 'response.in_progress' ||
          chunk.type === 'response.incomplete' ||
          chunk.type === 'response.failed'
        ) {
          const r = chunk.response as { model?: string } | undefined
          if (r?.model) model = r.model
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

        // response.failed and response.incomplete are TERMINAL events.
        if (
          chunk.type === 'response.failed' ||
          chunk.type === 'response.incomplete'
        ) {
          if (hasEmittedTextMessageStart) {
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: aguiState.messageId,
              model,
              timestamp: Date.now(),
            } satisfies StreamChunk
            hasEmittedTextMessageStart = false
          }
          const r = (chunk.response ?? {}) as {
            error?: { message?: string; code?: unknown } | null
            incompleteDetails?: { reason?: string } | null
          }
          const errorMessage =
            r.error?.message ||
            r.incompleteDetails?.reason ||
            (chunk.type === 'response.failed'
              ? 'Response failed'
              : 'Response ended incomplete')
          const errorCode =
            normalizeCode(r.error?.code) ??
            (r.incompleteDetails ? 'incomplete' : undefined) ??
            undefined
          yield {
            type: EventType.RUN_ERROR,
            model,
            timestamp: Date.now(),
            message: errorMessage,
            ...(errorCode !== undefined && { code: errorCode }),
            error: {
              message: errorMessage,
              ...(errorCode !== undefined && { code: errorCode }),
            },
          } satisfies StreamChunk
          runFinishedEmitted = true
          return
        }

        // Handle output text deltas (token-by-token streaming)
        if (chunk.type === 'response.output_text.delta' && chunk.delta) {
          const textDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (textDelta) {
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId: aguiState.messageId,
                model: model || options.model,
                timestamp: Date.now(),
                role: 'assistant',
              } satisfies StreamChunk
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
            } satisfies StreamChunk
          }
        }

        // Handle reasoning deltas
        if (chunk.type === 'response.reasoning_text.delta' && chunk.delta) {
          const reasoningDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (reasoningDelta) {
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
              } satisfies StreamChunk
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
            } satisfies StreamChunk
          }
        }

        // Handle reasoning summary deltas
        if (
          chunk.type === 'response.reasoning_summary_text.delta' &&
          chunk.delta
        ) {
          const summaryDelta =
            typeof chunk.delta === 'string' ? chunk.delta : ''

          if (summaryDelta) {
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
              } satisfies StreamChunk
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
            } satisfies StreamChunk
          }
        }

        // handle content_part added events for text, reasoning and refusals
        if (chunk.type === 'response.content_part.added') {
          const contentPart = chunk.part as {
            type: string
            text?: string
            refusal?: string
          }
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
            } satisfies StreamChunk
          }
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
            } satisfies StreamChunk
          }
          if (contentPart.type === 'output_text') {
            hasStreamedContentDeltas = true
          } else if (contentPart.type === 'reasoning_text') {
            hasStreamedReasoningDeltas = true
          }
          const partChunk = handleContentPart(contentPart)
          yield partChunk
          if (partChunk.type === 'RUN_ERROR') {
            runFinishedEmitted = true
            return
          }
        }

        if (chunk.type === 'response.content_part.done') {
          const contentPart = chunk.part as {
            type: string
            text?: string
            refusal?: string
          }

          // Skip emitting chunks for content parts that we've already streamed via deltas
          if (contentPart.type === 'output_text' && hasStreamedContentDeltas) {
            continue
          }
          if (
            contentPart.type === 'reasoning_text' &&
            hasStreamedReasoningDeltas
          ) {
            continue
          }

          // Upstreams that emit `content_part.done` without any preceding
          // deltas (or `content_part.added`) still need a START event before
          // CONTENT.
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
            } satisfies StreamChunk
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
            } satisfies StreamChunk
          }

          const doneChunk = handleContentPart(contentPart)
          yield doneChunk
          if (doneChunk.type === 'RUN_ERROR') {
            runFinishedEmitted = true
            return
          }
        }

        // handle output_item.added to capture function call metadata (name)
        if (chunk.type === 'response.output_item.added') {
          const item = chunk.item as {
            type: string
            id?: string
            name?: string
          }
          if (item.type === 'function_call' && item.id) {
            const existing = toolCallMetadata.get(item.id)
            if (!existing) {
              toolCallMetadata.set(item.id, {
                index: chunk.outputIndex ?? 0,
                name: item.name || '',
                started: false,
              })
            } else if (!existing.name && item.name) {
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
                index: chunk.outputIndex ?? 0,
              } satisfies StreamChunk
              metadata.started = true
            }
          }
        }

        // Handle function call arguments delta (streaming).
        if (
          chunk.type === 'response.function_call_arguments.delta' &&
          chunk.delta
        ) {
          const itemId = chunk.itemId ?? ''
          const metadata = toolCallMetadata.get(itemId)
          if (!metadata?.started) {
            options.logger.errors(
              `${this.name}.processStreamChunks orphan function_call_arguments.delta`,
              {
                source: `${this.name}.processStreamChunks`,
                toolCallId: itemId,
                rawDelta: chunk.delta,
              },
            )
            continue
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: itemId,
            model: model || options.model,
            timestamp: Date.now(),
            delta: typeof chunk.delta === 'string' ? chunk.delta : '',
          } satisfies StreamChunk
        }

        if (chunk.type === 'response.function_call_arguments.done') {
          const itemId = chunk.itemId ?? ''

          const metadata = toolCallMetadata.get(itemId)
          if (!metadata?.started) {
            if (metadata) {
              metadata.pendingArguments = chunk.arguments
            }
            options.logger.errors(
              `${this.name}.processStreamChunks deferring function_call_arguments.done — TOOL_CALL_START not yet emitted (waiting for name)`,
              {
                source: `${this.name}.processStreamChunks`,
                toolCallId: itemId,
                rawArguments: chunk.arguments,
              },
            )
            continue
          }
          if (metadata.ended) continue
          const name = metadata.name || ''
          metadata.ended = true

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
                    `tool ${name} (${itemId}) returned malformed JSON arguments`,
                  ),
                  source: `${this.name}.processStreamChunks`,
                  toolCallId: itemId,
                  toolName: name,
                  rawArguments: chunk.arguments,
                },
              )
              parsedInput = {}
            }
          }

          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: itemId,
            toolCallName: name,
            toolName: name,
            model: model || options.model,
            timestamp: Date.now(),
            input: parsedInput,
          } satisfies StreamChunk
        }

        // `output_item.done` is the last point at which a function_call's
        // name is guaranteed to be on the wire.
        if (chunk.type === 'response.output_item.done') {
          const item = chunk.item as {
            type: string
            id?: string
            name?: string
            arguments?: string
          }
          if (item.type === 'function_call' && item.id) {
            const metadata = toolCallMetadata.get(item.id) ?? {
              index: chunk.outputIndex ?? 0,
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
              } satisfies StreamChunk
              metadata.started = true
            }
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
              } satisfies StreamChunk
              metadata.ended = true
              metadata.pendingArguments = undefined
            }
          }
        }

        if (chunk.type === 'response.completed') {
          const responseObj = (chunk.response ?? {}) as {
            output?: ReadonlyArray<unknown>
            usage?: {
              inputTokens?: number
              outputTokens?: number
              totalTokens?: number
            } | null
            incompleteDetails?: { reason?: string } | null
          }
          const outputItems = Array.isArray(responseObj.output)
            ? responseObj.output
            : []

          // Final backstop for function_call lifecycle.
          for (const rawItem of outputItems) {
            const item = rawItem as {
              type?: string
              id?: string
              name?: string
              arguments?: string
            }
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
              } satisfies StreamChunk
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
              } satisfies StreamChunk
              metadata.ended = true
              metadata.pendingArguments = undefined
            }
          }

          if (hasEmittedTextMessageStart) {
            yield {
              type: EventType.TEXT_MESSAGE_END,
              messageId: aguiState.messageId,
              model: model || options.model,
              timestamp: Date.now(),
            } satisfies StreamChunk
            hasEmittedTextMessageStart = false
          }

          const hasFunctionCalls = outputItems.some(
            (item) => (item as { type?: string }).type === 'function_call',
          )
          const incompleteReason = responseObj.incompleteDetails?.reason
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
              promptTokens: responseObj.usage?.inputTokens || 0,
              completionTokens: responseObj.usage?.outputTokens || 0,
              totalTokens: responseObj.usage?.totalTokens || 0,
            },
            finishReason,
          } satisfies StreamChunk
          runFinishedEmitted = true
        }

        if (chunk.type === 'error') {
          const code = normalizeCode(chunk.code)
          yield {
            type: EventType.RUN_ERROR,
            model: model || options.model,
            timestamp: Date.now(),
            message: chunk.message ?? '',
            ...(code !== undefined && { code }),
            error: {
              message: chunk.message ?? '',
              ...(code !== undefined && { code }),
            },
          } satisfies StreamChunk
          runFinishedEmitted = true
          return
        }
      }

      // Synthetic terminal RUN_FINISHED if the stream ended without a
      // response.completed event.
      if (!runFinishedEmitted && aguiState.hasEmittedRunStarted) {
        if (hasEmittedTextMessageStart) {
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId: aguiState.messageId,
            model: model || options.model,
            timestamp: Date.now(),
          } satisfies StreamChunk
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: model || options.model,
          timestamp: Date.now(),
          usage: undefined,
          finishReason: toolCallMetadata.size > 0 ? 'tool_calls' : 'stop',
        } satisfies StreamChunk
      }
    } catch (error: unknown) {
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
      } satisfies StreamChunk
    }
  }

  /**
   * Build an OpenRouter `ResponsesRequest` (camelCase) from `TextOptions`.
   */
  protected mapOptionsToRequest(
    options: TextOptions<OpenRouterResponsesTextProviderOptions>,
  ): Omit<ResponsesRequest, 'stream'> {
    // Fail loud on webSearchTool() — v1 only routes function tools.
    if (options.tools) {
      for (const tool of options.tools) {
        if (isWebSearchTool(tool as Tool)) {
          throw new Error(
            `OpenRouterResponsesTextAdapter does not yet support webSearchTool(). ` +
              `Use the chat-completions adapter (openRouterText) for web search ` +
              `tools, or pass function tools only to this adapter.`,
          )
        }
      }
    }

    const modelOptions = options.modelOptions as
      | (Partial<ResponsesRequest> & { variant?: string })
      | undefined
    const variantSuffix = modelOptions?.variant
      ? `:${modelOptions.variant}`
      : ''

    const input = this.convertMessagesToInput(options.messages)

    // ResponsesFunctionTool already matches OpenRouter's
    // ResponsesRequestToolFunction shape:
    // `{ type:'function', name, parameters, description, strict }`.
    const tools: Array<ResponsesFunctionTool> | undefined = options.tools
      ? options.tools.map((tool) =>
          convertFunctionToolToResponsesFormat(
            tool,
            this.makeStructuredOutputCompatible.bind(this),
          ),
        )
      : undefined

    const built: Pick<
      ResponsesRequest,
      | 'model'
      | 'input'
      | 'instructions'
      | 'metadata'
      | 'temperature'
      | 'topP'
      | 'maxOutputTokens'
      | 'tools'
      | 'toolChoice'
      | 'parallelToolCalls'
    > = {
      ...modelOptions,
      model: options.model + variantSuffix,
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.maxTokens !== undefined && {
        maxOutputTokens: options.maxTokens,
      }),
      ...(options.topP !== undefined && { topP: options.topP }),
      ...(options.metadata !== undefined && { metadata: options.metadata }),
      ...(options.systemPrompts &&
        options.systemPrompts.length > 0 && {
          instructions: options.systemPrompts.join('\n'),
        }),
      input: input as ResponsesRequest['input'],
      ...(tools &&
        tools.length > 0 && {
          tools: tools as ResponsesRequest['tools'],
        }),
    }

    return built
  }

  /**
   * Convert a list of ModelMessage to OpenRouter's `InputsUnion` array form.
   * Emits camelCase shapes (`callId`, `imageUrl`, `videoUrl`, `fileData`,
   * `fileUrl`).
   */
  protected convertMessagesToInput(
    messages: Array<ModelMessage>,
  ): Array<InputsItem> {
    const result: Array<InputsItem> = []

    for (const message of messages) {
      if (message.role === 'tool') {
        result.push({
          type: 'function_call_output',
          callId: message.toolCallId || '',
          output:
            typeof message.content === 'string'
              ? message.content
              : this.extractTextContent(message.content),
        } as InputsItem)
        continue
      }

      if (message.role === 'assistant') {
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            const argumentsString =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments)
            result.push({
              type: 'function_call',
              callId: toolCall.id,
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: argumentsString,
            } as InputsItem)
          }
        }

        if (message.content) {
          const contentStr = this.extractTextContent(message.content)
          if (contentStr) {
            result.push({
              type: 'message',
              role: 'assistant',
              content: contentStr,
            } as InputsItem)
          }
        }
        continue
      }

      // user — fail loud on empty / unsupported content.
      const contentParts = this.normalizeContent(message.content)
      const inputContent: Array<ResponsesInputContent> = []
      for (const part of contentParts) {
        inputContent.push(this.convertContentPartToInput(part))
      }
      if (inputContent.length === 0) {
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
      } as InputsItem)
    }

    return result
  }

  protected convertContentPartToInput(part: ContentPart): ResponsesInputContent {
    switch (part.type) {
      case 'text':
        return {
          type: 'input_text',
          text: part.content,
        }
      case 'image': {
        const meta = part.metadata as
          | { detail?: 'auto' | 'low' | 'high' }
          | undefined
        const value = part.source.value
        const imageUrl =
          part.source.type === 'data' && !value.startsWith('data:')
            ? `data:${part.source.mimeType || 'application/octet-stream'};base64,${value}`
            : value
        return {
          type: 'input_image',
          imageUrl,
          detail: meta?.detail || 'auto',
        }
      }
      case 'audio': {
        if (part.source.type === 'url') {
          // OpenRouter's `input_audio` carries `{ data, format }` not a URL —
          // fall back to `input_file` for URLs so we don't silently drop the
          // audio reference.
          return {
            type: 'input_file',
            fileUrl: part.source.value,
          }
        }
        return {
          type: 'input_audio',
          inputAudio: { data: part.source.value, format: 'mp3' },
        }
      }
      case 'video':
        return {
          type: 'input_video',
          videoUrl: part.source.value,
        }
      case 'document': {
        if (part.source.type === 'url') {
          return {
            type: 'input_file',
            fileUrl: part.source.value,
          }
        }
        const mime = part.source.mimeType || 'application/octet-stream'
        const data = part.source.value.startsWith('data:')
          ? part.source.value
          : `data:${mime};base64,${part.source.value}`
        return {
          type: 'input_file',
          fileData: data,
        }
      }
      default:
        throw new Error(
          `Unsupported content part type for ${this.name}: ${(part as { type: string }).type}`,
        )
    }
  }

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

  protected extractTextContent(
    content: string | null | Array<ContentPart>,
  ): string {
    if (content === null) {
      return ''
    }
    if (typeof content === 'string') {
      return content
    }
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}

/**
 * Normalised event shape we read off each OpenRouter SDK stream event after
 * camel-case translation. Models the loose superset of fields we consult
 * across all event-type branches; specific branches narrow further inline.
 */
interface NormalizedStreamEvent {
  type: string
  itemId?: string
  outputIndex?: number
  contentIndex?: number
  delta?: string | Array<string>
  text?: string
  arguments?: string
  message?: string
  code?: unknown
  param?: string | null
  sequenceNumber?: number
  response?: unknown
  item?: unknown
  part?: unknown
}

/**
 * Translate the SDK's discriminated-union event into a uniform camelCase
 * shape our processor reads.
 *
 * The SDK's discriminated-union parser falls back to
 * `{ raw, type: 'UNKNOWN', isUnknown: true }` when an event's strict per-
 * variant schema rejects (missing optional-ish fields like `sequenceNumber`/
 * `logprobs` that some upstreams — including aimock — omit). The `raw`
 * payload is the original wire-shape event in snake_case. We translate
 * snake_case keys to camelCase for those unknown events so the rest of the
 * processor reads a uniform shape.
 *
 * Known events already have camelCase fields and are passed through.
 */
function normalizeStreamEvent(event: StreamEvents): NormalizedStreamEvent {
  const e = event as {
    isUnknown?: boolean
    raw?: unknown
    type?: string
    [k: string]: unknown
  }

  if (e.isUnknown && e.raw && typeof e.raw === 'object') {
    const raw = e.raw as Record<string, unknown>
    // Translate the snake_case wire-shape fields we need into camelCase. The
    // adapter only consults the fields below; any others are passed through
    // verbatim so downstream extraction (e.g. for unknown event types) still
    // sees them.
    const out: Record<string, unknown> = { ...raw }
    if ('item_id' in raw) out.itemId = raw.item_id
    if ('output_index' in raw) out.outputIndex = raw.output_index
    if ('content_index' in raw) out.contentIndex = raw.content_index
    if ('sequence_number' in raw) out.sequenceNumber = raw.sequence_number
    if ('summary_index' in raw) out.summaryIndex = raw.summary_index
    if (
      'response' in raw &&
      raw.response &&
      typeof raw.response === 'object'
    ) {
      out.response = camelCaseResponseShape(raw.response as Record<string, unknown>)
    }
    if ('item' in raw && raw.item && typeof raw.item === 'object') {
      out.item = camelCaseOutputItem(raw.item as Record<string, unknown>)
    }
    if ('part' in raw) out.part = raw.part
    out.type =
      typeof raw.type === 'string' ? raw.type : (e.type as string) || 'unknown'
    return out as unknown as NormalizedStreamEvent
  }

  return event as unknown as NormalizedStreamEvent
}

/** Translate snake_case keys in a `response` payload to camelCase for the
 *  fields our terminal-event handlers read. Unknown keys passthrough. */
function camelCaseResponseShape(
  src: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...src }
  if ('incomplete_details' in src) out.incompleteDetails = src.incomplete_details
  if ('input_tokens' in src || 'output_tokens' in src || 'total_tokens' in src) {
    // never mutate src; rewrite usage in place if present.
  }
  if (src.usage && typeof src.usage === 'object') {
    const u = src.usage as Record<string, unknown>
    out.usage = {
      ...u,
      ...(('input_tokens' in u) && { inputTokens: u.input_tokens }),
      ...(('output_tokens' in u) && { outputTokens: u.output_tokens }),
      ...(('total_tokens' in u) && { totalTokens: u.total_tokens }),
    }
  }
  if (Array.isArray(src.output)) {
    out.output = src.output.map((item) =>
      item && typeof item === 'object'
        ? camelCaseOutputItem(item as Record<string, unknown>)
        : item,
    )
  }
  return out
}

/** Translate snake_case keys in an output item to camelCase. */
function camelCaseOutputItem(
  src: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...src }
  if ('call_id' in src) out.callId = src.call_id
  return out
}

/** Normalize an `error.code` to the string slot our RUN_ERROR event reads. */
function normalizeCode(code: unknown): string | undefined {
  if (typeof code === 'string') return code
  if (typeof code === 'number' && Number.isFinite(code)) return String(code)
  return undefined
}

export function createOpenRouterResponsesText<
  TModel extends OpenRouterResponsesTextModels,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterResponsesTextAdapter<TModel, ResolveToolCapabilities<TModel>> {
  return new OpenRouterResponsesTextAdapter({ apiKey, ...config }, model)
}

export function openRouterResponsesText<
  TModel extends OpenRouterResponsesTextModels,
>(
  model: TModel,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterResponsesTextAdapter<TModel, ResolveToolCapabilities<TModel>> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterResponsesText(model, apiKey, config)
}
