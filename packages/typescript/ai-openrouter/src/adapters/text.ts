import { OpenRouter } from '@openrouter/sdk'
import { EventType } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId, transformNullsToUndefined } from '@tanstack/ai-utils'
import { extractRequestOptions } from '../internal/request-options'
import { makeStructuredOutputCompatible } from '../internal/schema-converter'
import { convertToolsToProviderFormat } from '../tools'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import type { SDKOptions } from '@openrouter/sdk'
import type {
  ChatContentItems,
  ChatMessages,
  ChatRequest,
  ChatStreamChoice,
  ChatStreamChunk,
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
} from '@tanstack/ai'
import type {
  OPENROUTER_CHAT_MODELS,
  OpenRouterChatModelToolCapabilitiesByName,
  OpenRouterModelInputModalitiesByName,
  OpenRouterModelOptionsByName,
} from '../model-meta'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type {
  OpenRouterImageMetadata,
  OpenRouterMessageMetadataByModality,
} from '../message-types'

export interface OpenRouterConfig extends SDKOptions {}
export type OpenRouterTextModels = (typeof OPENROUTER_CHAT_MODELS)[number]

export type OpenRouterTextModelOptions = ExternalTextProviderOptions

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OpenRouterModelOptionsByName
    ? OpenRouterModelOptionsByName[TModel]
    : OpenRouterTextModelOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenRouterModelInputModalitiesByName
    ? OpenRouterModelInputModalitiesByName[TModel]
    : readonly ['text', 'image']

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof OpenRouterChatModelToolCapabilitiesByName
    ? NonNullable<OpenRouterChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * OpenRouter Text (Chat) Adapter — standalone implementation that talks to
 * OpenRouter's `/v1/chat/completions` endpoint via the `@openrouter/sdk` SDK.
 *
 * The wire format is OpenAI-Chat-Completions-compatible, but the SDK exposes
 * the request/response in camelCase TS shapes (`toolCalls`, `finishReason`,
 * `maxCompletionTokens`, `responseFormat: { jsonSchema: ... }`, etc.). This
 * adapter operates directly in those camelCase shapes — there's no
 * snake_case ↔ camelCase round-trip.
 *
 * Behaviour preserved from the pre-decoupling implementation:
 *   - Provider routing surface (`provider`, `models`, `plugins`, `variant`,
 *     `transforms`) passes through `modelOptions`.
 *   - App attribution headers (`httpReferer`, `appTitle`) and base URL
 *     overrides flow through the SDK `SDKOptions` constructor.
 *   - `RequestAbortedError` from the SDK propagates up — `chatStream` wraps
 *     unknown errors into a single RUN_ERROR event via `toRunErrorPayload`.
 *   - Model variant suffixing (e.g. `:thinking`, `:free`) via
 *     `modelOptions.variant`.
 *   - OpenRouter-specific reasoning extraction (`delta.reasoningDetails`).
 *   - OpenRouter preserves nulls in structured-output results
 *     (`transformStructuredOutput` is a passthrough).
 */
export class OpenRouterTextAdapter<
  TModel extends OpenRouterTextModels,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  OpenRouterMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name = 'openrouter' as const

  protected orClient: OpenRouter

  constructor(config: OpenRouterConfig, model: TModel) {
    super({}, model)
    this.orClient = new OpenRouter(config)
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
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
      // one error-handling path.
      const chatRequest = this.mapOptionsToRequest(options)
      options.logger.request(
        `activity=chat provider=${this.name} model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: this.name, model: this.model },
      )
      const reqOptions = extractRequestOptions(options.request)
      const stream = await this.orClient.chat.send(
        {
          chatRequest: {
            ...chatRequest,
            stream: true,
            streamOptions: {
              ...(chatRequest.streamOptions ?? {}),
              includeUsage: true,
            },
          },
        },
        {
          signal: reqOptions.signal ?? undefined,
          ...(reqOptions.headers && { headers: reqOptions.headers }),
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
   * Generate structured output via OpenRouter's `responseFormat: { type:
   * 'json_schema', jsonSchema: ... }` (camelCase). Uses stream: false to get
   * the complete response in one call.
   *
   * The outputSchema is already JSON Schema (converted in the ai layer).
   * We apply OpenAI-strict transformations for cross-provider compatibility.
   */
  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const chatRequest = this.mapOptionsToRequest(chatOptions)

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    try {
      // Strip streamOptions which is only valid for streaming calls
      const { streamOptions: _streamOptions, ...cleanParams } = chatRequest
      void _streamOptions
      chatOptions.logger.request(
        `activity=structuredOutput provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      const reqOptions = extractRequestOptions(chatOptions.request)
      const response = await this.orClient.chat.send(
        {
          chatRequest: {
            ...cleanParams,
            stream: false,
            responseFormat: {
              type: 'json_schema',
              jsonSchema: {
                name: 'structured_output',
                schema: jsonSchema,
                strict: true,
              },
            },
          },
        },
        {
          signal: reqOptions.signal ?? undefined,
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
      )

      // Extract text content from the response. Fail loud on empty content
      // rather than letting it cascade into a JSON-parse error on '' — the
      // root cause (the model returned no content for the structured request)
      // is then visible in logs.
      const message = response.choices[0]?.message
      const rawText =
        typeof message?.content === 'string' ? message.content : ''
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

      // OpenRouter override: pass nulls through unchanged (consumers that
      // discriminate "field present but null" from "field absent" rely on
      // this).
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
   * Streamed structured output: a single OpenRouter chat call with
   * `responseFormat: { type: 'json_schema', jsonSchema: {...} }` and
   * `stream: true`. Emits AG-UI lifecycle events plus a terminal
   * `CUSTOM { name: 'structured-output.complete' }` carrying the parsed
   * object and raw JSON text.
   *
   * Mirrors the chat-completions structured-output stream from
   * `@tanstack/openai-base`, adapted to OpenRouter's camelCase wire shape
   * (`responseFormat` / `streamOptions: { includeUsage: true }`) and SDK
   * call surface (`orClient.chat.send({ chatRequest })`). Reasoning flows
   * through the existing `extractReasoningText` helper used by
   * `processStreamChunks`; the final parsed JSON runs through
   * {@link transformStructuredOutput} (null-preserving for OpenRouter).
   */
  async *structuredOutputStream(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    const { chatOptions, outputSchema } = options
    const chatRequest = this.mapOptionsToRequest(chatOptions)

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    const timestamp = Date.now()
    const aguiState = {
      runId: generateId(this.name),
      threadId: chatOptions.threadId ?? generateId(this.name),
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
    let lastUsage: ChatStreamChunk['usage'] | undefined

    const closeReasoningLifecycle = function* (this: {
      name: string
    }): Generator<StreamChunk> {
      if (reasoningMessageId && !hasClosedReasoning) {
        hasClosedReasoning = true
        yield {
          type: EventType.REASONING_MESSAGE_END,
          messageId: reasoningMessageId,
          model: lastModel || chatOptions.model,
          timestamp,
        }
        yield {
          type: EventType.REASONING_END,
          messageId: reasoningMessageId,
          model: lastModel || chatOptions.model,
          timestamp,
        }
        if (stepId) {
          yield {
            type: EventType.STEP_FINISHED,
            stepName: stepId,
            stepId,
            model: lastModel || chatOptions.model,
            timestamp,
            content: accumulatedReasoning,
          }
        }
      }
    }.bind(this)

    try {
      // Strip streamOptions/tools from the base request. Structured output
      // sends `responseFormat: json_schema` and doesn't carry tools — keeping
      // them can confuse strict-mode validation upstream. (`stream` is
      // already absent — `mapOptionsToRequest` returns `Omit<ChatRequest,
      // 'stream'>`; we set it explicitly below.)
      const { streamOptions: _so, tools: _t, ...cleanParams } = chatRequest
      void _so
      void _t

      chatOptions.logger.request(
        `activity=structuredOutputStream provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )

      const reqOptions = extractRequestOptions(chatOptions.request)
      const stream = await this.orClient.chat.send(
        {
          chatRequest: {
            ...cleanParams,
            stream: true,
            streamOptions: { includeUsage: true },
            responseFormat: {
              type: 'json_schema',
              jsonSchema: {
                name: 'structured_output',
                schema: jsonSchema,
                strict: true,
              },
            },
          },
        },
        {
          signal: reqOptions.signal ?? undefined,
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
      )

      for await (const chunk of stream) {
        const choiceForLog = chunk.choices[0]
        chatOptions.logger.provider(
          `provider=${this.name} finishReason=${choiceForLog?.finishReason ?? 'none'} hasContent=${!!choiceForLog?.delta.content} hasUsage=${!!chunk.usage}`,
          { provider: this.name, model: chunk.model },
        )

        if (chunk.model) lastModel = chunk.model
        if (chunk.usage) lastUsage = chunk.usage

        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield {
            type: EventType.RUN_STARTED,
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model: chunk.model || chatOptions.model,
            timestamp,
          }
        }

        const reasoningText = extractReasoningText(chunk)
        if (reasoningText) {
          if (!reasoningMessageId) {
            reasoningMessageId = generateId(this.name)
            stepId = generateId(this.name)
            yield {
              type: EventType.REASONING_START,
              messageId: reasoningMessageId,
              model: chunk.model || chatOptions.model,
              timestamp,
            }
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId: reasoningMessageId,
              role: 'reasoning' as const,
              model: chunk.model || chatOptions.model,
              timestamp,
            }
            yield {
              type: EventType.STEP_STARTED,
              stepName: stepId,
              stepId,
              model: chunk.model || chatOptions.model,
              timestamp,
              stepType: 'thinking',
            }
          }
          accumulatedReasoning += reasoningText
          yield {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: reasoningMessageId,
            delta: reasoningText,
            model: chunk.model || chatOptions.model,
            timestamp,
          }
        }

        const choice = chunk.choices[0]
        if (!choice) continue

        const deltaContent = choice.delta.content
        if (deltaContent) {
          yield* closeReasoningLifecycle()

          if (!hasEmittedTextMessageStart) {
            hasEmittedTextMessageStart = true
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: aguiState.messageId,
              model: chunk.model || chatOptions.model,
              timestamp,
              role: 'assistant',
            }
          }

          accumulatedContent += deltaContent

          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: aguiState.messageId,
            model: chunk.model || chatOptions.model,
            timestamp,
            delta: deltaContent,
            content: accumulatedContent,
          }
        }
      }

      yield* closeReasoningLifecycle()

      if (hasEmittedTextMessageStart) {
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: aguiState.messageId,
          model: lastModel || chatOptions.model,
          timestamp,
        }
      }

      if (accumulatedContent.length === 0) {
        yield {
          type: EventType.RUN_ERROR,
          runId: aguiState.runId,
          model: lastModel || chatOptions.model,
          timestamp,
          message: `${this.name}.structuredOutputStream: response contained no content`,
          code: 'empty-response',
          error: {
            message: `${this.name}.structuredOutputStream: response contained no content`,
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
          timestamp,
          message: `Failed to parse structured output as JSON. Content: ${accumulatedContent.slice(0, 200)}${accumulatedContent.length > 200 ? '...' : ''}`,
          code: 'parse-error',
          error: {
            message: 'Failed to parse structured output as JSON',
            code: 'parse-error',
          },
        }
        return
      }

      const transformed = this.transformStructuredOutput(parsed)

      yield {
        type: EventType.CUSTOM,
        name: 'structured-output.complete',
        value: {
          object: transformed,
          raw: accumulatedContent,
          ...(accumulatedReasoning ? { reasoning: accumulatedReasoning } : {}),
        },
        model: lastModel || chatOptions.model,
        timestamp,
      }

      yield {
        type: EventType.RUN_FINISHED,
        runId: aguiState.runId,
        threadId: aguiState.threadId,
        model: lastModel || chatOptions.model,
        timestamp,
        finishReason: 'stop',
        ...(lastUsage && {
          usage: {
            promptTokens: lastUsage.promptTokens,
            completionTokens: lastUsage.completionTokens,
            totalTokens: lastUsage.totalTokens,
          },
        }),
      }
    } catch (error: unknown) {
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: chatOptions.model,
          timestamp,
        }
      }

      // OpenRouter SDK raises a proprietary `RequestAbortedError` on
      // caller-initiated abort. Map it (plus the standard DOM `AbortError`)
      // to `code: 'aborted'` so consumers can distinguish abort from a real
      // upstream failure.
      const errName =
        error && typeof error === 'object'
          ? ((error as { name?: unknown }).name ?? '')
          : ''
      const isAbort =
        errName === 'AbortError' || errName === 'RequestAbortedError'
      const errorPayload = toRunErrorPayload(
        error,
        `${this.name}.structuredOutputStream failed`,
      )

      yield {
        type: EventType.RUN_ERROR,
        runId: aguiState.runId,
        model: lastModel || chatOptions.model,
        timestamp,
        message: errorPayload.message,
        code: isAbort ? 'aborted' : errorPayload.code,
        error: { ...errorPayload, ...(isAbort && { code: 'aborted' }) },
      }

      chatOptions.logger.errors(`${this.name}.structuredOutputStream fatal`, {
        error: errorPayload,
        source: `${this.name}.structuredOutputStream`,
      })
    }
  }

  /**
   * Applies provider-specific transformations for structured output compatibility.
   */
  protected makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): Record<string, any> {
    return makeStructuredOutputCompatible(schema, originalRequired)
  }

  /**
   * Final shaping pass applied to parsed structured-output JSON before it is
   * returned to the caller. OpenRouter routes through a wide variety of
   * upstream providers; some return `null` as a distinct sentinel ("the field
   * exists, the value is null") rather than collapsing it to absent. Stripping
   * nulls would erase that distinction, so we passthrough.
   *
   * `transformNullsToUndefined` is imported for parity with the other
   * provider adapters but intentionally not invoked here.
   */
  protected transformStructuredOutput(parsed: unknown): unknown {
    void transformNullsToUndefined
    return parsed
  }

  /**
   * Processes streamed chunks from OpenRouter's chat-completions API and
   * yields AG-UI events. Reads the SDK's camelCase chunk shape directly
   * (`delta.toolCalls`, `delta.reasoningDetails`, `chunk.usage.promptTokens`,
   * `choice.finishReason`, etc.).
   */
  protected async *processStreamChunks(
    stream: AsyncIterable<ChatStreamChunk>,
    options: TextOptions<ResolveProviderOptions<TModel>>,
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
    // `streamOptions: { includeUsage: true }` OpenRouter emits a terminal
    // chunk whose `choices` is `[]` and only the `usage` field is populated;
    // the earlier `finishReason` chunk does NOT include token counts. We must
    // therefore defer RUN_FINISHED until the iterator is exhausted so we can
    // pick up usage from the trailing chunk regardless of arrival order.
    let lastUsage: ChatStreamChunk['usage'] | undefined
    let pendingFinishReason: ChatStreamChoice['finishReason'] | undefined

    // Track tool calls being streamed (arguments come in chunks).
    const toolCallsInProgress = new Map<
      number,
      {
        id: string
        name: string
        arguments: string
        started: boolean // Track if TOOL_CALL_START has been emitted
      }
    >()

    // Reasoning lifecycle (driven by inline reasoning extraction below).
    let reasoningMessageId: string | undefined
    let hasClosedReasoning = false
    // Legacy STEP_STARTED/STEP_FINISHED pair emitted alongside REASONING_*
    // for back-compat with consumers (UI, devtools) that haven't migrated
    // to the spec REASONING_* events yet.
    let stepId: string | undefined
    let accumulatedReasoning = ''
    // Track whether ANY tool call lifecycle was actually completed across the
    // entire stream. Lets us downgrade a `tool_calls` finishReason to `stop`
    // when the upstream signalled tool calls but never produced a complete
    // start/end pair — emitting RUN_FINISHED { finishReason: 'tool_calls' }
    // with no matching TOOL_CALL_END would leave consumers waiting for tool
    // results that never arrive.
    let emittedAnyToolCallEnd = false

    try {
      for await (const chunk of stream) {
        const choiceForLog = chunk.choices[0]
        options.logger.provider(
          `provider=${this.name} finishReason=${choiceForLog?.finishReason ?? 'none'} hasContent=${!!choiceForLog?.delta.content} hasToolCalls=${!!choiceForLog?.delta.toolCalls} hasUsage=${!!chunk.usage}`,
          { provider: this.name, model: chunk.model },
        )

        // Surface upstream errors so they can be routed to RUN_ERROR. Stream
        // chunks may carry an `error` field (provider-side failures that
        // happen mid-stream rather than as an SDK throw).
        if (chunk.error) {
          throw Object.assign(
            new Error(chunk.error.message || 'OpenRouter stream error'),
            { code: chunk.error.code },
          )
        }

        // Capture usage from any chunk (including the terminal usage-only
        // chunk emitted when `streamOptions.includeUsage` is on).
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

        // Reasoning content (OpenRouter emits this as `delta.reasoningDetails`).
        // Run before reading choice/delta so reasoning-only chunks (no `choices`)
        // still drive the REASONING_* lifecycle.
        const reasoningText = extractReasoningText(chunk)
        if (reasoningText) {
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
          accumulatedReasoning += reasoningText
          yield {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: reasoningMessageId,
            delta: reasoningText,
            model: chunk.model || options.model,
            timestamp: Date.now(),
          }
        }

        const choice = chunk.choices[0]

        if (!choice) continue

        const delta = choice.delta
        const deltaContent = delta.content
        const deltaToolCalls = delta.toolCalls

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

        // Handle tool calls - they come in as deltas (camelCase toolCalls)
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

        // Handle finishReason. We DO emit TOOL_CALL_END and TEXT_MESSAGE_END
        // here because the corresponding _START events have already fired,
        // and tool execution downstream wants to begin as soon as possible.
        // RUN_FINISHED is deferred until the iterator is fully exhausted so
        // we can capture the trailing usage chunk that arrives AFTER this
        // chunk when streamOptions.includeUsage is on.
        if (choice.finishReason) {
          if (
            choice.finishReason === 'tool_calls' ||
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
            // `finishReason: 'stop'` chunk (or the post-loop synthetic
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

          // Remember the upstream finishReason; RUN_FINISHED is emitted at
          // end-of-stream so we pick up the trailing usage-only chunk too.
          pendingFinishReason = choice.finishReason
        }
      }

      // Emit a single terminal RUN_FINISHED after the iterator is exhausted.
      if (aguiState.hasEmittedRunStarted) {
        // Close any started tool calls that never got finishReason.
        for (const [, toolCall] of toolCallsInProgress) {
          if (!toolCall.started) continue
          let parsedInput: unknown = {}
          if (toolCall.arguments) {
            try {
              const parsed: unknown = JSON.parse(toolCall.arguments)
              parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
            } catch (parseError) {
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
          emittedAnyToolCallEnd = true
        }
        toolCallsInProgress.clear()

        // Make sure the text message lifecycle is closed even on early
        // termination paths where finishReason never arrives.
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

        // Map upstream finishReason to AG-UI's narrower vocabulary while
        // preserving the upstream value when it falls outside the AG-UI set.
        // Use `tool_calls` only when a TOOL_CALL_END was actually emitted.
        // OpenRouter emits 'error' as a finish reason for upstream errors;
        // collapse to 'content_filter' (the closest AG-UI equivalent).
        const finishReason:
          | 'tool_calls'
          | 'length'
          | 'content_filter'
          | 'stop' = emittedAnyToolCallEnd
          ? 'tool_calls'
          : pendingFinishReason === 'tool_calls'
            ? 'stop'
            : pendingFinishReason === 'length'
              ? 'length'
              : pendingFinishReason === 'content_filter' ||
                  pendingFinishReason === 'error'
                ? 'content_filter'
                : 'stop'

        yield {
          type: EventType.RUN_FINISHED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: lastModel || options.model,
          timestamp: Date.now(),
          usage: lastUsage
            ? {
                promptTokens: lastUsage.promptTokens || 0,
                completionTokens: lastUsage.completionTokens || 0,
                totalTokens: lastUsage.totalTokens || 0,
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
   * Build an OpenRouter `ChatRequest` (camelCase) from `TextOptions`. Applies
   * `:variant` model suffixing and routes tools through OpenRouter's
   * converter (function tools + branded web_search tool).
   */
  protected mapOptionsToRequest(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): Omit<ChatRequest, 'stream'> {
    const modelOptions = options.modelOptions as
      | (Record<string, any> & { variant?: string })
      | undefined
    const variantSuffix = modelOptions?.variant
      ? `:${modelOptions.variant}`
      : ''

    const messages: Array<ChatMessages> = []
    if (options.systemPrompts?.length) {
      messages.push({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }
    for (const m of options.messages) {
      messages.push(this.convertMessage(m))
    }

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    // Spread modelOptions first so explicit top-level options (set below) win
    // when defined but `undefined` doesn't clobber values the caller set in
    // modelOptions.
    const request: Omit<ChatRequest, 'stream'> = {
      ...modelOptions,
      model: options.model + variantSuffix,
      messages,
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.maxTokens !== undefined && {
        maxCompletionTokens: options.maxTokens,
      }),
      ...(options.topP !== undefined && { topP: options.topP }),
      ...(tools && tools.length > 0 && { tools }),
    }
    return request
  }

  /**
   * Convert a ModelMessage to OpenRouter's ChatMessages discriminated union
   * (camelCase: `toolCallId`, `toolCalls`).
   */
  protected convertMessage(message: ModelMessage): ChatMessages {
    if (message.role === 'tool') {
      // For structured (Array<ContentPart>) tool results, extract the text
      // content rather than JSON-stringifying the parts — sending the raw
      // ContentPart shape (e.g. `[{"type":"text","content":"…"}]`) into the
      // tool message's `content` field would feed the literal JSON of the
      // parts back to the model instead of the tool's textual result.
      return {
        role: 'tool',
        content:
          typeof message.content === 'string'
            ? message.content
            : this.extractTextContent(message.content),
        toolCallId: message.toolCallId || '',
      }
    }

    if (message.role === 'assistant') {
      // Stringify object-shaped tool-call arguments to match the SDK's
      // `ChatToolCall.function.arguments: string` contract. Without this an
      // assistant message that carries already-parsed args (common after a
      // multi-turn run) would either serialise as `[object Object]` or be
      // rejected by the SDK's Zod schema with an opaque validation error.
      const toolCalls = message.toolCalls?.map((tc) => ({
        ...tc,
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments),
        },
      }))
      // Per the OpenAI-compatible Chat Completions contract, an assistant
      // message that only carries tool_calls should have `content: null`
      // rather than `content: ''` or `content: undefined`. For multi-part
      // assistant content (Array<ContentPart>) we extract the text rather
      // than JSON-stringifying the parts, which would otherwise leak the
      // literal part shape into the next-turn prompt.
      const textContent = this.extractTextContent(message.content)
      const hasToolCalls = !!toolCalls && toolCalls.length > 0
      return {
        role: 'assistant',
        content: hasToolCalls && !textContent ? null : textContent,
        toolCalls,
      }
    }

    // user — fail loud on empty and unsupported content. Silently sending an
    // empty string would mask a real caller bug and produce a paid request
    // with no input.
    const contentParts = this.normalizeContent(message.content)
    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
      const text = contentParts[0].content
      if (text.length === 0) {
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

    const parts: Array<ChatContentItems> = []
    for (const part of contentParts) {
      const converted = this.convertContentPart(part)
      if (!converted) {
        throw new Error(
          `Unsupported content part type for ${this.name}: ${part.type}. ` +
            `Override convertContentPart to handle this type, ` +
            `or remove it from the message.`,
        )
      }
      parts.push(converted)
    }
    if (parts.length === 0) {
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

  /** OpenRouter content-part converter (camelCase imageUrl/inputAudio/videoUrl). */
  protected convertContentPart(part: ContentPart): ChatContentItems | null {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.content }
      case 'image': {
        const meta = part.metadata as OpenRouterImageMetadata | undefined
        const value = part.source.value
        // Default to `application/octet-stream` when the source didn't
        // provide a MIME type — interpolating `undefined` into the URI
        // ("data:undefined;base64,...") produces an invalid data URI the
        // API rejects.
        const imageMime = part.source.mimeType || 'application/octet-stream'
        const url =
          part.source.type === 'data' && !value.startsWith('data:')
            ? `data:${imageMime};base64,${value}`
            : value
        return {
          type: 'image_url',
          imageUrl: { url, detail: meta?.detail || 'auto' },
        }
      }
      case 'audio':
        // OpenRouter's chat-completions `input_audio` shape carries
        // `{ data, format }` where `data` is base64 — there's no URL
        // variant on this wire. For URL-sourced audio, fall back to a
        // text reference rather than feeding the literal URL into the
        // base64 slot. The Responses adapter does have an `input_file`
        // URL variant and routes URLs there directly — see
        // `responses-text.ts`.
        if (part.source.type === 'url') {
          return {
            type: 'text',
            text: `[Audio: ${part.source.value}]`,
          }
        }
        return {
          type: 'input_audio',
          inputAudio: { data: part.source.value, format: 'mp3' },
        }
      case 'video':
        return {
          type: 'video_url',
          videoUrl: { url: part.source.value },
        }
      case 'document':
        // The chat-completions SDK has no document_url type. For URL
        // sources, surface a text reference so the model at least sees
        // the link. For data sources, `part.source.value` is the raw
        // base64 payload — inlining it into the prompt would blow the
        // context window with megabytes of binary and leak the document
        // content verbatim. Throw instead so the caller can either
        // switch to the Responses adapter (which has proper input_file
        // support for data documents) or strip the document before
        // sending.
        if (part.source.type === 'data') {
          throw new Error(
            `${this.name} chat-completions does not support inline (data) document content parts. ` +
              `Use the Responses adapter (openRouterResponsesText) for document data, ` +
              `or pass the document as a URL.`,
          )
        }
        return {
          type: 'text',
          text: `[Document: ${part.source.value}]`,
        }
      default:
        return null
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
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}

/**
 * Flatten any reasoning deltas in a stream chunk into a single string.
 * OpenRouter emits reasoning content via `delta.reasoningDetails`, a union of
 * variants including `{ type: 'reasoning.text', text }` and
 * `{ type: 'reasoning.summary', summary }`.
 */
function extractReasoningText(chunk: ChatStreamChunk): string {
  let text = ''
  for (const choice of chunk.choices) {
    const details = (choice.delta as { reasoningDetails?: Array<unknown> })
      .reasoningDetails
    if (!Array.isArray(details)) continue
    for (const detail of details) {
      const d = detail as { type?: string; text?: unknown; summary?: unknown }
      if (d.type === 'reasoning.text' && typeof d.text === 'string') {
        text += d.text
      } else if (
        d.type === 'reasoning.summary' &&
        typeof d.summary === 'string'
      ) {
        text += d.summary
      }
    }
  }
  return text
}

export function createOpenRouterText<TModel extends OpenRouterTextModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterTextAdapter<TModel, ResolveToolCapabilities<TModel>> {
  return new OpenRouterTextAdapter({ apiKey, ...config }, model)
}

export function openRouterText<TModel extends OpenRouterTextModels>(
  model: TModel,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterTextAdapter<TModel, ResolveToolCapabilities<TModel>> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterText(model, apiKey, config)
}
