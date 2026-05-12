import { OpenRouter } from '@openrouter/sdk'
import {
  OpenAICompatibleResponsesTextAdapter,
  convertFunctionToolToResponsesFormat,
} from '@tanstack/openai-base'
import { isWebSearchTool } from '../tools/web-search-tool'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import type { SDKOptions } from '@openrouter/sdk'
import type {
  InputsUnion,
  ResponsesRequest,
  StreamEvents,
} from '@openrouter/sdk/models'
import type {
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInputContent,
  ResponseStreamEvent,
  ResponsesFunctionTool,
  ResponsesResponse,
} from '@tanstack/openai-base'
import type { ContentPart, ModelMessage, TextOptions, Tool } from '@tanstack/ai'
import type { ExternalResponsesProviderOptions } from '../text/responses-provider-options'
import type {
  OPENROUTER_CHAT_MODELS,
  OpenRouterChatModelToolCapabilitiesByName,
  OpenRouterModelInputModalitiesByName,
} from '../model-meta'
import type { OpenRouterMessageMetadataByModality } from '../message-types'

/** Element type of `ResponsesRequest.input` when it's the array form (the
 *  SDK union also allows a bare string). Pinning to the array element lets
 *  the convertMessagesToInput override narrow to the per-item discriminated
 *  union so a TS rename surfaces here. */
type InputsItem = Extract<InputsUnion, ReadonlyArray<unknown>>[number]

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
 * OpenRouter Responses (beta) Adapter.
 *
 * Extends the OpenAI Responses base so the streaming event lifecycle,
 * structured-output flow, tool-call accumulator, and RUN_ERROR taxonomy are
 * shared with the rest of the OpenAI-Responses-compatible providers (OpenAI,
 * Azure, …).
 *
 * The wire format is OpenAI-Responses-compatible, but the `@openrouter/sdk`
 * SDK exposes a different call shape — `client.beta.responses.send
 * ({ responsesRequest })` with camelCase fields. We override the two
 * SDK-call hooks (`callResponse` / `callResponseStream`) to bridge that,
 * plus chunk and result shape adapters on the way back.
 *
 * Behaviour preserved from the chat-completions migration:
 *   - Provider routing surface (`provider`, `models`, `plugins`,
 *     `variant`) passes through `modelOptions`.
 *   - App attribution headers (`httpReferer`, `appTitle`) and base URL
 *     overrides flow through the SDK `SDKOptions` constructor.
 *   - Model variant suffixing (e.g. `:thinking`, `:free`) via
 *     `modelOptions.variant`.
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
> extends OpenAICompatibleResponsesTextAdapter<
  TModel,
  OpenRouterResponsesTextProviderOptions,
  ResolveInputModalities<TModel>,
  OpenRouterMessageMetadataByModality,
  TToolCapabilities
> {
  readonly kind = 'text' as const
  readonly name = 'openrouter-responses' as const

  /** OpenRouter SDK client. The base's `this.client` (an OpenAI client) is
   *  unused because we override the SDK-call hooks below. */
  protected orClient: OpenRouter

  constructor(config: OpenRouterResponsesConfig, model: TModel) {
    // The base needs an OpenAICompatibleClientConfig to construct an OpenAI
    // client we never use. The OpenRouter SDK supports a Promise-returning
    // apiKey getter; the OpenAI SDK's constructor here is a no-op for our
    // purposes, so any string suffices.
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey : 'unused'
    super(
      { apiKey, baseURL: 'https://openrouter.ai/api/v1' },
      model,
      'openrouter-responses',
    )
    this.orClient = new OpenRouter(config)
  }

  // ────────────────────────────────────────────────────────────────────────
  // SDK call hooks — the params we get here were built by our overridden
  // mapOptionsToRequest / convertMessagesToInput / convertContentPartToInput
  // already in OpenRouter's camelCase TS shape, so only a type cast bridges
  // the base's static snake_case signature. The inbound result/stream still
  // needs camel → snake reshaping because the base's processStreamChunks /
  // extractTextFromResponse read documented snake_case fields like
  // `response.usage.input_tokens` and `chunk.item_id`.
  // ────────────────────────────────────────────────────────────────────────

  protected override async callResponseStream(
    params: ResponseCreateParamsStreaming,
    requestOptions: { signal?: AbortSignal | null; headers?: HeadersInit },
  ): Promise<AsyncIterable<ResponseStreamEvent>> {
    const responsesRequest = params as unknown as Omit<
      ResponsesRequest,
      'stream'
    >
    // The SDK's EventStream is an AsyncIterable<StreamEvents>; treat it
    // structurally so we don't need to depend on the SDK's class export.
    const stream = (await this.orClient.beta.responses.send(
      { responsesRequest: { ...responsesRequest, stream: true } },
      { signal: requestOptions.signal ?? undefined },
    )) as unknown as AsyncIterable<StreamEvents>
    return adaptOpenRouterResponsesStreamEvents(stream)
  }

  protected override async callResponse(
    params: ResponseCreateParamsNonStreaming,
    requestOptions: { signal?: AbortSignal | null; headers?: HeadersInit },
  ): Promise<ResponsesResponse> {
    const responsesRequest = params as unknown as Omit<
      ResponsesRequest,
      'stream'
    >
    const result = await this.orClient.beta.responses.send(
      { responsesRequest: { ...responsesRequest, stream: false } },
      { signal: requestOptions.signal ?? undefined },
    )
    return adaptOpenRouterResponsesResult(result)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Request construction — emit OpenRouter's camelCase TS shape directly so
  // a `Pick<ResponsesRequest, …>` annotation catches any field-name drift at
  // compile time. Returned via `unknown as Omit<ResponseCreateParams, 'stream'>`
  // because the base's signature is the OpenAI snake_case type; the SDK call
  // hooks above just pass the value through.
  // ────────────────────────────────────────────────────────────────────────

  protected override mapOptionsToRequest(
    options: TextOptions<OpenRouterResponsesTextProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
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

    // Apply the same modelOptions/variant precedence as the chat adapter.
    const modelOptions = options.modelOptions as
      | (Partial<ResponsesRequest> & { variant?: string })
      | undefined
    const variantSuffix = modelOptions?.variant
      ? `:${modelOptions.variant}`
      : ''

    // The override below returns Array<InputsUnion> — re-cast through the
    // base's documented shape so this local has the type a Pick<…> expects.
    const input = this.convertMessagesToInput(options.messages) as unknown as
      | ResponsesRequest['input']
      | undefined

    // Reuse the openai-base function-tool converter. ResponsesFunctionTool
    // already matches OpenRouter's ResponsesRequestToolFunction shape:
    // `{ type:'function', name, parameters, description, strict }`.
    const tools: Array<ResponsesFunctionTool> | undefined = options.tools
      ? options.tools.map((tool) =>
          convertFunctionToolToResponsesFormat(
            tool,
            this.makeStructuredOutputCompatible.bind(this),
          ),
        )
      : undefined

    // `Pick<ResponsesRequest, …>` is the static gate — if the SDK renames any
    // of these keys in a future version this annotation breaks the build
    // instead of silently producing a request the wire schema drops.
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
      input,
      ...(tools &&
        tools.length > 0 && {
          tools: tools as unknown as ResponsesRequest['tools'],
        }),
    }

    return built as unknown as Omit<ResponseCreateParams, 'stream'>
  }

  // ────────────────────────────────────────────────────────────────────────
  // Message + content converters — emit OpenRouter's camelCase TS shape
  // (`callId`, `imageUrl`, `inputAudio`, `videoUrl`, `fileData`, `fileUrl`)
  // directly. The return-type cast through `unknown` bridges to the base's
  // signature without giving up the OpenRouter-shape return inside.
  // ────────────────────────────────────────────────────────────────────────

  protected override convertMessagesToInput(
    messages: Array<ModelMessage>,
  ): ReturnType<
    OpenAICompatibleResponsesTextAdapter<TModel>['convertMessagesToInput']
  > {
    const result: Array<InputsItem> = []

    for (const message of messages) {
      if (message.role === 'tool') {
        // For structured (Array<ContentPart>) tool results, extract the text
        // content rather than JSON-stringifying the parts — sending the raw
        // ContentPart shape (e.g. `[{"type":"text","content":"…"}]`) into the
        // `output` field would feed the literal JSON of the parts back to the
        // model instead of the tool's textual result.
        result.push({
          type: 'function_call_output',
          callId: message.toolCallId || '',
          output:
            typeof message.content === 'string'
              ? message.content
              : this.extractTextContent(message.content),
        } as unknown as InputsItem)
        continue
      }

      if (message.role === 'assistant') {
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            // Stringify object-shaped args to match the SDK's `arguments:
            // string` contract — mirrors the chat adapter's fix (see
            // commit 0171b18e).
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
            } as unknown as InputsItem)
          }
        }

        if (message.content) {
          const contentStr = this.extractTextContent(message.content)
          if (contentStr) {
            result.push({
              type: 'message',
              role: 'assistant',
              content: contentStr,
            } as unknown as InputsItem)
          }
        }
        continue
      }

      // user — fail loud on empty / unsupported content (mirrors the base).
      const contentParts = this.normalizeContent(message.content)
      const inputContent: Array<ResponseInputContent> = []
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
      } as unknown as InputsItem)
    }

    return result as unknown as ReturnType<
      OpenAICompatibleResponsesTextAdapter<TModel>['convertMessagesToInput']
    >
  }

  protected override convertContentPartToInput(
    part: ContentPart,
  ): ResponseInputContent {
    switch (part.type) {
      case 'text':
        return {
          type: 'input_text',
          text: part.content,
        } as ResponseInputContent
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
        } as unknown as ResponseInputContent
      }
      case 'audio': {
        if (part.source.type === 'url') {
          // OpenRouter's `input_audio` carries `{ data, format }` not a URL —
          // fall back to `input_file` for URLs so we don't silently drop the
          // audio reference.
          return {
            type: 'input_file',
            fileUrl: part.source.value,
          } as unknown as ResponseInputContent
        }
        return {
          type: 'input_audio',
          inputAudio: { data: part.source.value, format: 'mp3' },
        } as unknown as ResponseInputContent
      }
      case 'video':
        return {
          type: 'input_video',
          videoUrl: part.source.value,
        } as unknown as ResponseInputContent
      case 'document': {
        if (part.source.type === 'url') {
          return {
            type: 'input_file',
            fileUrl: part.source.value,
          } as unknown as ResponseInputContent
        }
        const mime = part.source.mimeType || 'application/octet-stream'
        const data = part.source.value.startsWith('data:')
          ? part.source.value
          : `data:${mime};base64,${part.source.value}`
        return {
          type: 'input_file',
          fileData: data,
        } as unknown as ResponseInputContent
      }
      default:
        throw new Error(
          `Unsupported content part type for ${this.name}: ${(part as { type: string }).type}`,
        )
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Inbound stream-event bridge: OpenRouter SDK camelCase → OpenAI snake_case
// so the base's `processStreamChunks` reads documented fields unchanged.
// (Outbound conversion is no longer needed — the adapter overrides above
// emit OpenRouter camelCase directly.)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Adapt OpenRouter's streaming events (camelCase, with extended event types)
 * into the OpenAI Responses event shape the base's `processStreamChunks`
 * reads. Reshapes the nested `response` payload for terminal events
 * (`response.completed`, `response.failed`, `response.incomplete`,
 * `response.created`) into snake_case so reads like
 * `chunk.response.incomplete_details?.reason` and
 * `chunk.response.usage.input_tokens` work unchanged.
 */
async function* adaptOpenRouterResponsesStreamEvents(
  stream: AsyncIterable<StreamEvents>,
): AsyncIterable<ResponseStreamEvent> {
  for await (const event of stream) {
    const e = event as Record<string, any>

    // Speakeasy's discriminated-union parser falls back to `{ raw, type:
    // 'UNKNOWN', isUnknown: true }` when an event's strict per-variant schema
    // rejects (missing optional-ish fields like `sequence_number`/`logprobs`
    // that some upstreams — including aimock — omit). The `raw` payload is
    // the original wire-shape event in snake_case, which is exactly what the
    // base's `processStreamChunks` reads. Re-emit it verbatim.
    if (e.isUnknown && e.raw && typeof e.raw === 'object') {
      yield e.raw as ResponseStreamEvent
      continue
    }

    switch (e.type) {
      case 'response.created':
      case 'response.in_progress':
      case 'response.completed':
      case 'response.failed':
      case 'response.incomplete': {
        yield {
          type: e.type,
          response: toSnakeResponseResult(e.response),
          sequence_number: e.sequenceNumber,
        } as unknown as ResponseStreamEvent
        break
      }
      case 'response.output_text.delta':
      case 'response.output_text.done':
      case 'response.reasoning_text.delta':
      case 'response.reasoning_text.done':
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_summary_text.done': {
        yield {
          type: e.type,
          item_id: e.itemId,
          output_index: e.outputIndex,
          content_index: e.contentIndex,
          delta: e.delta,
          text: e.text,
          sequence_number: e.sequenceNumber,
        } as unknown as ResponseStreamEvent
        break
      }
      case 'response.content_part.added':
      case 'response.content_part.done': {
        yield {
          type: e.type,
          item_id: e.itemId,
          output_index: e.outputIndex,
          content_index: e.contentIndex,
          part: toSnakeContentPart(e.part),
          sequence_number: e.sequenceNumber,
        } as unknown as ResponseStreamEvent
        break
      }
      case 'response.output_item.added':
      case 'response.output_item.done': {
        yield {
          type: e.type,
          item: toSnakeOutputItem(e.item),
          output_index: e.outputIndex,
          sequence_number: e.sequenceNumber,
        } as unknown as ResponseStreamEvent
        break
      }
      case 'response.function_call_arguments.delta':
      case 'response.function_call_arguments.done': {
        yield {
          type: e.type,
          item_id: e.itemId,
          output_index: e.outputIndex,
          delta: e.delta,
          arguments: e.arguments,
          sequence_number: e.sequenceNumber,
        } as unknown as ResponseStreamEvent
        break
      }
      case 'error': {
        // Stringify code so provider codes (401/429/500/…) survive
        // `toRunErrorPayload`, mirroring the chat-completions fix in
        // commit 0171b18e.
        yield {
          type: 'error',
          message: e.message,
          code: e.code != null ? String(e.code) : undefined,
          param: e.param,
          sequence_number: e.sequenceNumber,
        } as unknown as ResponseStreamEvent
        break
      }
      default: {
        // Pass through unknown event types with sequenceNumber renamed so
        // the base's debug logging still sees a usable `type`. Forwarding
        // verbatim is safer than dropping silently — a new event type
        // OpenRouter ships shouldn't be discarded by us.
        const { sequenceNumber, ...rest } = e
        yield {
          ...rest,
          ...(sequenceNumber !== undefined && {
            sequence_number: sequenceNumber,
          }),
        } as unknown as ResponseStreamEvent
      }
    }
  }
}

/** Convert a non-streaming `OpenResponsesResult` so the base's
 *  `extractTextFromResponse` (which iterates `response.output[].content` for
 *  `type === 'output_text'`) reads it unchanged. */
function adaptOpenRouterResponsesResult(result: unknown): ResponsesResponse {
  return toSnakeResponseResult(result) as ResponsesResponse
}

function toSnakeResponseResult(r: any): Record<string, any> {
  if (!r || typeof r !== 'object') return r
  return {
    ...r,
    model: r.model,
    incomplete_details: r.incompleteDetails ?? null,
    ...(r.usage && {
      usage: {
        input_tokens: r.usage.inputTokens ?? 0,
        output_tokens: r.usage.outputTokens ?? 0,
        total_tokens: r.usage.totalTokens ?? 0,
        ...(r.usage.inputTokensDetails && {
          input_tokens_details: r.usage.inputTokensDetails,
        }),
        ...(r.usage.outputTokensDetails && {
          output_tokens_details: r.usage.outputTokensDetails,
        }),
      },
    }),
    output: Array.isArray(r.output)
      ? r.output.map((it: any) => toSnakeOutputItem(it))
      : r.output,
    ...(r.error && {
      error: { message: r.error.message, code: r.error.code },
    }),
  }
}

function toSnakeOutputItem(item: any): any {
  if (!item || typeof item !== 'object') return item
  switch (item.type) {
    case 'function_call':
      return {
        type: 'function_call',
        id: item.id,
        call_id: item.callId,
        name: item.name,
        arguments: item.arguments,
        ...(item.status !== undefined && { status: item.status }),
      }
    case 'message':
      return {
        ...item,
        // content parts already use { type:'output_text', text } — no rename
        // needed; refusal has `refusal` either way.
      }
    default:
      return item
  }
}

function toSnakeContentPart(part: any): any {
  if (!part || typeof part !== 'object') return part
  // Both output_text and refusal already share the same key names across
  // SDKs (`text`, `refusal`, `type`). Pass through.
  return part
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
