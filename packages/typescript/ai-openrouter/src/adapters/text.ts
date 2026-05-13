import { OpenRouter } from '@openrouter/sdk'
import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/ai-openai-compatible'
import { convertToolsToProviderFormat } from '../tools'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import type { SDKOptions } from '@openrouter/sdk'
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from '@tanstack/ai-openai-compatible'
import type {
  ChatContentItems,
  ChatMessages,
  ChatRequest,
  ChatStreamChoice,
  ChatStreamChunk,
} from '@openrouter/sdk/models'
import type {
  OPENROUTER_CHAT_MODELS,
  OpenRouterChatModelToolCapabilitiesByName,
  OpenRouterModelInputModalitiesByName,
  OpenRouterModelOptionsByName,
} from '../model-meta'
import type { ContentPart, ModelMessage, TextOptions } from '@tanstack/ai'
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
 * OpenRouter Text (Chat) Adapter.
 *
 * Why this extends `OpenAICompatibleChatCompletionsTextAdapter` from
 * `@tanstack/ai-openai-compatible`:
 *
 * OpenRouter's `/v1/chat/completions` endpoint implements OpenAI's Chat
 * Completions wire format verbatim (it's how OpenRouter routes a single
 * client request to GPT, Claude, Gemini, Llama, etc.). Extending the shared
 * compatible base means we inherit ~1k LOC of stream accumulation,
 * partial-JSON tool-call buffering, AG-UI lifecycle emission, RUN_ERROR
 * taxonomy, and structured-output coercion that every OpenAI-compatible
 * provider needs — without copy-pasting it. The compatible package is
 * deliberately not "the OpenAI adapter"; it is the shared implementation of
 * the wire-format protocol that OpenAI, OpenRouter, Groq, Grok, vLLM,
 * SGLang, and others all speak.
 *
 * What's different about OpenRouter (and why we still need overrides):
 *
 * The wire format is identical to OpenAI's Chat Completions, but the
 * `@openrouter/sdk` SDK exposes a different call shape — `client.chat.send
 * ({ chatRequest })` with camelCase fields. We override the two SDK-call
 * hooks (`callChatCompletion` / `callChatCompletionStream`) to bridge that,
 * plus a small chunk-shape adapter on the way back, and `extractReasoning`
 * to surface OpenRouter's reasoning deltas through the shared REASONING_*
 * lifecycle.
 *
 * Behaviour preserved from the pre-migration implementation:
 *   - Provider routing surface (`provider`, `models`, `plugins`, `variant`,
 *     `transforms`) passes through `modelOptions`.
 *   - App attribution headers (`httpReferer`, `appTitle`) and base URL
 *     overrides flow through the SDK `SDKOptions` constructor.
 *   - `RequestAbortedError` from the SDK propagates up — the base's
 *     `chatStream` wraps unknown errors into a single RUN_ERROR event via
 *     `toRunErrorPayload`, so the abort lifecycle is unchanged.
 *   - Model variant suffixing (e.g. `:thinking`, `:free`) via
 *     `modelOptions.variant`.
 */
export class OpenRouterTextAdapter<
  TModel extends OpenRouterTextModels,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends OpenAICompatibleChatCompletionsTextAdapter<
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
    super(model, 'openrouter')
    this.orClient = new OpenRouter(config)
  }

  // ────────────────────────────────────────────────────────────────────────
  // SDK call hooks — adapt OpenAI snake_case params to OpenRouter camelCase
  // and adapt the returned shape back to the OpenAI structural contract the
  // base's processStreamChunks reads.
  // ────────────────────────────────────────────────────────────────────────

  protected override async callChatCompletionStream(
    params: ChatCompletionCreateParamsStreaming,
    requestOptions: { signal?: AbortSignal | null; headers?: HeadersInit },
  ): Promise<AsyncIterable<ChatCompletionChunk>> {
    const chatRequest = toOpenRouterRequest(params, true)
    const stream = (await this.orClient.chat.send(
      { chatRequest: { ...chatRequest, stream: true } },
      {
        signal: requestOptions.signal ?? undefined,
        ...(requestOptions.headers && { headers: requestOptions.headers }),
      },
    )) as AsyncIterable<ChatStreamChunk>
    return adaptOpenRouterStreamChunks(stream)
  }

  protected override async callChatCompletion(
    params: ChatCompletionCreateParamsNonStreaming,
    requestOptions: { signal?: AbortSignal | null; headers?: HeadersInit },
  ): Promise<ChatCompletion> {
    const chatRequest = toOpenRouterRequest(params, false)
    const response = await this.orClient.chat.send(
      { chatRequest: { ...chatRequest, stream: false } },
      {
        signal: requestOptions.signal ?? undefined,
        ...(requestOptions.headers && { headers: requestOptions.headers }),
      },
    )
    // The base only reads `response.choices[0]?.message.content`. The SDK's
    // non-streaming response carries that under the same path.
    return response as unknown as ChatCompletion
  }

  // ────────────────────────────────────────────────────────────────────────
  // Reasoning hook — surface OpenRouter's `delta.reasoningDetails` through
  // the base's REASONING_* lifecycle.
  // ────────────────────────────────────────────────────────────────────────

  /** OpenRouter historically returns nulls in structured-output results as
   *  literal nulls rather than absent fields; preserve that behaviour. */
  protected override transformStructuredOutput(parsed: unknown): unknown {
    return parsed
  }

  protected override extractReasoning(
    chunk: unknown,
  ): { text: string } | undefined {
    // The chunk-adapter stashes the raw reasoning deltas on a non-standard
    // field so we don't need to round-trip them through camelCase ↔
    // snake_case on the OpenAI Chat Completions chunk schema.
    const reasoning = (chunk as { _reasoningText?: string })._reasoningText
    return reasoning ? { text: reasoning } : undefined
  }

  // ────────────────────────────────────────────────────────────────────────
  // Message conversion — OpenRouter uses camelCase (`toolCallId`,
  // `toolCalls`, `imageUrl`, `inputAudio`, `videoUrl`). We override
  // `convertMessage` and `convertContentPart` so the base's
  // `mapOptionsToRequest` flows through to the SDK without a second pass.
  // ────────────────────────────────────────────────────────────────────────

  protected override convertMessage(message: ModelMessage): any {
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
      } satisfies ChatMessages
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
      } satisfies ChatMessages
    }

    // user — mirror the base's fail-loud behaviour on empty and unsupported
    // content. Silently sending an empty string would mask a real caller bug
    // and produce a paid request with no input.
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
      } satisfies ChatMessages
    }

    const parts: Array<ChatContentItems> = []
    for (const part of contentParts) {
      const converted = this.convertContentPartToOpenRouter(part)
      if (!converted) {
        throw new Error(
          `Unsupported content part type for ${this.name}: ${part.type}. ` +
            `Override convertContentPartToOpenRouter to handle this type, ` +
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
    } satisfies ChatMessages
  }

  /** OpenRouter content-part converter (camelCase imageUrl/inputAudio/videoUrl). */
  private convertContentPartToOpenRouter(
    part: ContentPart,
  ): ChatContentItems | null {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.content }
      case 'image': {
        const meta = part.metadata as OpenRouterImageMetadata | undefined
        const value = part.source.value
        // Default to `application/octet-stream` when the source didn't
        // provide a MIME type — interpolating `undefined` into the URI
        // ("data:undefined;base64,...") produces an invalid data URI the
        // API rejects. Mirrors the base's defaulting in
        // `OpenAICompatibleChatCompletionsTextAdapter.convertContentPart`.
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
        // base64 slot (which would either be rejected upstream or
        // silently misinterpreted as garbage audio bytes). The
        // Responses adapter does have an `input_file` URL variant and
        // routes URLs there directly — see `responses-text.ts`.
        if (part.source.type === 'url') {
          return { type: 'text', text: `[Audio: ${part.source.value}]` }
        }
        return {
          type: 'input_audio',
          inputAudio: { data: part.source.value, format: 'mp3' },
        }
      case 'video':
        return { type: 'video_url', videoUrl: { url: part.source.value } }
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
        return { type: 'text', text: `[Document: ${part.source.value}]` }
      default:
        return null
    }
  }

  /** Override request mapping to apply OpenRouter's `:variant` model suffix
   *  and route tools through OpenRouter's converter (function tools +
   *  branded web_search tool). The base writes snake_case fields here; the
   *  SDK-call hooks convert them just before sending. */
  protected override mapOptionsToRequest(
    options: TextOptions,
  ): ChatCompletionCreateParamsStreaming {
    const modelOptions = options.modelOptions as
      | (Record<string, any> & { variant?: string })
      | undefined
    const variantSuffix = modelOptions?.variant
      ? `:${modelOptions.variant}`
      : ''

    const messages: Array<any> = []
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

    // Keep modelOptions first so explicit top-level options (set below) win
    // when defined but `undefined` doesn't clobber values the caller set in
    // modelOptions. Fixes the same merge-order regression openai/grok handle.
    return {
      ...(modelOptions as Record<string, any>),
      model: options.model + variantSuffix,
      messages,
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.maxTokens !== undefined && {
        max_tokens: options.maxTokens,
      }),
      ...(options.topP !== undefined && { top_p: options.topP }),
      ...(tools && tools.length > 0 && { tools }),
      stream: true,
    } as ChatCompletionCreateParamsStreaming
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers: convert OpenAI Chat Completions params ↔ OpenRouter ChatRequest
// ──────────────────────────────────────────────────────────────────────────

/**
 * Convert the base's snake_case params shape to the OpenRouter SDK's
 * camelCase ChatRequest. Only the fields the base actually writes need
 * mapping — modelOptions already flows through in OpenRouter (camelCase)
 * shape because the public option types derive from `ChatRequest`.
 */
function toOpenRouterRequest(
  params:
    | ChatCompletionCreateParamsStreaming
    | ChatCompletionCreateParamsNonStreaming,
  isStreaming: boolean,
): ChatRequest {
  const p = params as Record<string, any>
  const out: Record<string, any> = { ...p }

  // The base injects these snake_case fields. Rewrite to camelCase.
  if ('max_tokens' in p) {
    out.maxCompletionTokens = p.max_tokens
    delete out.max_tokens
  }
  if ('top_p' in p) {
    out.topP = p.top_p
    delete out.top_p
  }
  if ('stream_options' in p) {
    const so = p.stream_options as Record<string, any> | undefined
    if (so && typeof so === 'object') {
      // The SDK's ChatStreamOptions schema uses camelCase keys and Zod
      // strips unknowns at parse time — without this rename the base's
      // include_usage flag would be silently dropped and RUN_FINISHED.usage
      // would always be undefined for streaming OpenRouter calls.
      const { include_usage, ...rest } = so
      out.streamOptions = {
        ...rest,
        ...(include_usage !== undefined && { includeUsage: include_usage }),
      }
    } else {
      out.streamOptions = so
    }
    delete out.stream_options
  }
  if ('response_format' in p && p.response_format) {
    const rf = p.response_format
    out.responseFormat =
      rf.type === 'json_schema' && rf.json_schema
        ? {
            type: 'json_schema',
            jsonSchema: rf.json_schema,
          }
        : rf
    delete out.response_format
  }

  // Streaming flag is set per-call by the SDK call hook, not here.
  delete out.stream
  if (!isStreaming) delete out.streamOptions

  return out as ChatRequest
}

/**
 * Adapt OpenRouter's stream chunks (camelCase, with `reasoningDetails`) into
 * the OpenAI Chat Completions chunk shape the base's `processStreamChunks`
 * reads. Reasoning text is stashed on `_reasoningText` for the
 * `extractReasoning` override to consume.
 */
async function* adaptOpenRouterStreamChunks(
  stream: AsyncIterable<ChatStreamChunk>,
): AsyncIterable<ChatCompletionChunk> {
  for await (const chunk of stream) {
    // Flatten any reasoning deltas in the chunk into a single string.
    let reasoningText = ''
    const adaptedChoices = chunk.choices.map((c: ChatStreamChoice) => {
      const delta = c.delta as Record<string, any>
      if (Array.isArray(delta.reasoningDetails)) {
        for (const d of delta.reasoningDetails) {
          if (d?.type === 'reasoning.text' && typeof d.text === 'string') {
            reasoningText += d.text
          } else if (
            d?.type === 'reasoning.summary' &&
            typeof d.summary === 'string'
          ) {
            reasoningText += d.summary
          }
        }
      }
      return {
        index: (c as { index?: number }).index ?? 0,
        delta: {
          content: delta.content,
          tool_calls: delta.toolCalls?.map((tc: any) => ({
            index: tc.index,
            id: tc.id,
            type: tc.type ?? 'function',
            function: tc.function,
          })),
          refusal: delta.refusal,
          role: delta.role,
        },
        finish_reason: c.finishReason,
      }
    })

    const usage = (chunk as any).usage
    const adapted: any = {
      id: chunk.id || '',
      object: 'chat.completion.chunk',
      created: 0,
      model: chunk.model || '',
      choices: adaptedChoices,
      ...(usage && {
        usage: {
          prompt_tokens: usage.promptTokens || 0,
          completion_tokens: usage.completionTokens || 0,
          total_tokens: usage.totalTokens || 0,
        },
      }),
      // Stash reasoning text for the extractReasoning hook. The base only
      // reads documented Chat Completions fields, so an additional field is
      // safe to pass alongside.
      _reasoningText: reasoningText || undefined,
    }

    // Surface upstream errors so the base can route them to RUN_ERROR.
    // `toRunErrorPayload` handles both string and finite-number codes; any
    // other shape (object/array/symbol/NaN) falls through to undefined
    // rather than serialising to "[object Object]".
    if ((chunk as any).error) {
      const errObj = (chunk as any).error
      throw Object.assign(
        new Error(errObj.message || 'OpenRouter stream error'),
        { code: errObj.code },
      )
    }

    yield adapted as ChatCompletionChunk
  }
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
