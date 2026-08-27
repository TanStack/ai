import { OpenRouter } from '@openrouter/sdk'
import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { extractRequestOptions } from '../internal/request-options'
import { openRouterSupportsCombinedToolsAndSchema } from '../internal/combined-tools-and-schema'
import { makeStructuredOutputCompatible } from '../internal/schema-converter'
import { convertFunctionToolToResponsesFormat } from '../internal/responses-tool-converter'
import { isWebSearchTool } from '../tools/web-search-tool'
import { isWebFetchTool } from '../tools/web-fetch-tool'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import { extractUsageCost } from './cost'
import {
  consumeResponsesStructuredChunk,
  emitResponsesStructuredStreamError,
  finishResponsesStructuredStream,
  processResponsesStreamChunks,
} from './responses-stream'
import type {
  ResponsesStructuredState,
  StreamedFunctionCallMetadata,
} from './responses-stream'
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
  JSONSchema,
  ModelMessage,
  AdapterYieldChunk,
  TextOptions,
} from '@tanstack/ai'
import type { ExternalResponsesProviderOptions } from '../text/responses-provider-options'
import type {
  OPENROUTER_CHAT_MODELS,
  OpenRouterChatModelToolCapabilitiesByName,
  OpenRouterModelInputModalitiesByName,
} from '../model-meta'
import type {
  OpenRouterMessageMetadataByModality,
  OpenRouterResponsesToolCallMetadata,
} from '../message-types'

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
  TToolCapabilities,
  OpenRouterResponsesToolCallMetadata
> {
  override readonly kind = 'text' as const
  readonly name = 'openrouter-responses' as const

  protected orClient: OpenRouter

  constructor(config: OpenRouterResponsesConfig, model: TModel) {
    super({}, model)
    this.orClient = new OpenRouter(config)
  }

  async *chatStream(
    options: TextOptions<OpenRouterResponsesTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    // Track tool call metadata by unique ID. The Responses API streams tool
    // calls with deltas — first chunk has ID/name, subsequent chunks only
    // have args. We assign our own indices as we encounter unique ids.
    const toolCallMetadata = new Map<string, StreamedFunctionCallMetadata>()

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
      const response = await this.orClient.beta.responses.send(
        { responsesRequest: { ...responsesRequest, stream: true } },
        {
          ...(reqOptions.signal != null && { signal: reqOptions.signal }),
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
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
      const rawEvent = toRunErrorRawEvent(error)

      // Emit RUN_STARTED if not yet emitted
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

      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        code: errorPayload.code,
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: errorPayload.message,
          code: errorPayload.code,
        },
      }

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
            },
          },
        },
        {
          ...(reqOptions.signal != null && { signal: reqOptions.signal }),
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

      // Responses API reports usage as inputTokens/outputTokens (not the
      // chat-completions promptTokens/completionTokens shape). Map to
      // TokenUsage and attach OpenRouter cost when present — same contract
      // as structuredOutputStream / processStreamChunks. Cost-only usage
      // (finite cost, no token fields) still forwards with zeroed tokens.
      const usage = response.usage
      const cost = extractUsageCost(usage)
      const hasUsage =
        usage != null &&
        (usage.inputTokens != null ||
          usage.outputTokens != null ||
          usage.totalTokens != null ||
          cost.cost !== undefined)
      return {
        data: transformed,
        rawText,
        ...(hasUsage && {
          usage: {
            promptTokens: usage.inputTokens ?? 0,
            completionTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
            ...cost,
          },
        }),
      }
    } catch (error: unknown) {
      chatOptions.logger.errors(`${this.name}.structuredOutput fatal`, {
        error: toRunErrorPayload(error, `${this.name}.structuredOutput failed`),
        source: `${this.name}.structuredOutput`,
      })
      throw error
    }
  }

  /**
   * Streamed structured output via OpenRouter's Responses API
   * (`text.format: { type: 'json_schema', ... }` + `stream: true`).
   *
   * Mirrors {@link OpenAIBaseResponsesTextAdapter.structuredOutputStream}
   * adapted to OpenRouter's SDK call surface
   * (`orClient.beta.responses.send`) and to the camelCase usage shape on
   * `response.completed` (`inputTokens` / `outputTokens` / `totalTokens`).
   *
   * Events flow through the same canonical event shape as `processStreamChunks`
   * (covering Speakeasy's UNKNOWN-with-`raw` fallback for events that fail
   * strict per-variant validation upstream).
   */
  async *structuredOutputStream(
    options: StructuredOutputOptions<OpenRouterResponsesTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { chatOptions, outputSchema } = options
    const responsesRequest = this.mapOptionsToRequest(chatOptions)

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

    const state: ResponsesStructuredState = {
      adapterName: this.name,
      accumulatedContent: '',
      accumulatedReasoning: '',
      hasEmittedTextMessageStart: false,
      reasoningMessageId: undefined,
      stepId: undefined,
      hasClosedReasoning: false,
      model: chatOptions.model,
      usage: undefined,
      stop: false,
    }

    try {
      chatOptions.logger.request(
        `activity=structuredOutputStream provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      const reqOptions = extractRequestOptions(chatOptions.request)
      const rawStream = await this.orClient.beta.responses.send(
        {
          responsesRequest: {
            ...responsesRequest,
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
        },
        {
          ...(reqOptions.signal != null && { signal: reqOptions.signal }),
          ...(reqOptions.headers && { headers: reqOptions.headers }),
        },
      )

      for await (const rawEvent of rawStream) {
        yield* consumeResponsesStructuredChunk(
          rawEvent,
          chatOptions,
          aguiState,
          state,
        )
        if (state.stop) return
      }

      yield* finishResponsesStructuredStream(aguiState, state, (parsed) =>
        this.transformStructuredOutput(parsed),
      )
    } catch (error: unknown) {
      yield* emitResponsesStructuredStreamError(
        error,
        chatOptions,
        aguiState,
        state,
      )
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
   * return `null` as a distinct sentinel rather than collapsing it to absent,
   * so we passthrough and let the engine un-widen strict-mode nulls precisely.
   * Matches the base adapters' default — kept as an explicit override because
   * OpenRouter extends `BaseTextAdapter` directly, not the OpenAI base.
   */
  protected transformStructuredOutput(parsed: unknown): unknown {
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
    toolCallMetadata: Map<string, StreamedFunctionCallMetadata>,
    options: TextOptions<OpenRouterResponsesTextProviderOptions>,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<AdapterYieldChunk> {
    yield* processResponsesStreamChunks({
      stream,
      toolCallMetadata,
      options,
      aguiState,
      adapterName: this.name,
    })
  }

  /**
   * Build an OpenRouter `ResponsesRequest` (camelCase) from `TextOptions`.
   */
  protected mapOptionsToRequest(
    options: TextOptions<OpenRouterResponsesTextProviderOptions>,
  ): Omit<ResponsesRequest, 'stream'> {
    // Fail loud on webSearchTool() / webFetchTool() — v1 only routes function tools.
    if (options.tools) {
      for (const tool of options.tools) {
        if (isWebSearchTool(tool)) {
          throw new Error(
            `OpenRouterResponsesTextAdapter does not yet support webSearchTool(). ` +
              `Use the chat-completions adapter (openRouterText) for web search ` +
              `tools, or pass function tools only to this adapter.`,
          )
        }
        if (isWebFetchTool(tool)) {
          throw new Error(
            `OpenRouterResponsesTextAdapter does not yet support webFetchTool(). ` +
              `Use the chat-completions adapter (openRouterText) for web fetch ` +
              `tools, or pass function tools only to this adapter.`,
          )
        }
      }
    }

    // `variant` is OpenRouter metadata used only to build the `:variant` model
    // suffix — it is not part of the wire `ResponsesRequest`, so strip it out
    // of the spread body (mirrors the chat-completions adapter).
    const { variant, ...modelOptions } = (options.modelOptions ??
      {}) as Partial<ResponsesRequest> & { variant?: string }
    const variantSuffix = variant ? `:${variant}` : ''

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

    // Attach text.format json_schema only when outputSchema is set and every
    // routed model is in the combined-capable set.
    const combinedOutputSchema: JSONSchema | undefined = options.outputSchema
    const combinedSchema =
      combinedOutputSchema &&
      this.supportsCombinedToolsAndSchema(options.modelOptions)
        ? this.makeStructuredOutputCompatible(
            combinedOutputSchema,
            combinedOutputSchema.required,
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
      | 'text'
    > = {
      ...modelOptions,
      model: options.model + variantSuffix,
      // Root `metadata` is observability-only and intentionally not forwarded:
      // the SDK validates wire `metadata` as `Record<string, string>`, while
      // root metadata may carry arbitrarily structured values (#735). Callers
      // set wire metadata via `modelOptions.metadata`, which flows through
      // the spread.
      ...(() => {
        const prompts = normalizeSystemPrompts(options.systemPrompts)
        if (prompts.length === 0) return {}
        return { instructions: prompts.map((p) => p.content).join('\n') }
      })(),
      input,
      ...(tools &&
        tools.length > 0 && {
          tools,
        }),
      ...(combinedSchema && {
        // Merge onto any caller-supplied `text` (spread above via
        // `...modelOptions`) so sibling fields like `text.verbosity` survive;
        // only `text.format` is overridden by the combined-mode schema.
        text: {
          ...modelOptions.text,
          format: {
            type: 'json_schema' as const,
            name: 'structured_output',
            schema: combinedSchema,
            strict: true,
          },
        },
      }),
    }

    return built
  }

  /**
   * Combined mode is safe only when this model and every `modelOptions.models`
   * fallback are in `OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
   * `:variant` suffixes are routing directives and do not change the gate.
   */
  supportsCombinedToolsAndSchema(
    modelOptions?: OpenRouterResponsesTextProviderOptions,
  ): boolean {
    return openRouterSupportsCombinedToolsAndSchema(this.model, modelOptions)
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
        })
        continue
      }

      if (message.role === 'assistant') {
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            const argumentsString =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments)
            const itemId = (
              toolCall.metadata as
                | OpenRouterResponsesToolCallMetadata
                | undefined
            )?.itemId
            result.push({
              type: 'function_call',
              callId: toolCall.id,
              id: itemId || toolCall.id,
              name: toolCall.function.name,
              arguments: argumentsString,
            })
          }
        }

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
      })
    }

    return result
  }

  protected convertContentPartToInput(
    part: ContentPart,
  ): ResponsesInputContent {
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

  protected extractTextContent(
    content: string | null | undefined | Array<ContentPart>,
  ): string {
    if (content === null || content === undefined) {
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
