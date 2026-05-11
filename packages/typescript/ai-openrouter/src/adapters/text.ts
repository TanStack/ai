import { OpenRouter } from '@openrouter/sdk'
import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { convertToolsToProviderFormat } from '../tools'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import type { SDKOptions } from '@openrouter/sdk'
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from '@tanstack/openai-base'
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
 * Extends the OpenAI Chat Completions base so it shares the stream
 * accumulator, partial-JSON tool-call buffer, RUN_ERROR taxonomy, and
 * lifecycle gates with the rest of the OpenAI-compatible providers.
 *
 * The wire format is identical to OpenAI's Chat Completions, but the
 * `@openrouter/sdk` SDK exposes a different call shape — `client.chat.send
 * ({ chatRequest })` with camelCase fields. We override the two SDK-call
 * hooks (`callChatCompletion` / `callChatCompletionStream`) to bridge that,
 * plus a small chunk-shape adapter on the way back, and `extractReasoning`
 * to surface OpenRouter's reasoning deltas through the base's REASONING_*
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

  /** OpenRouter SDK client. The base's `this.client` (an OpenAI client) is
   *  unused because we override the SDK-call hooks below. */
  protected orClient: OpenRouter

  constructor(config: OpenRouterConfig, model: TModel) {
    // The base needs an OpenAICompatibleClientConfig to construct an OpenAI
    // client we never use. The OpenRouter SDK supports a Promise-returning
    // apiKey getter; the OpenAI SDK's constructor here is a no-op for our
    // purposes, so any string suffices.
    const apiKey =
      typeof config.apiKey === 'string' ? config.apiKey : 'unused'
    super(
      { apiKey, baseURL: 'https://openrouter.ai/api/v1' },
      model,
      'openrouter',
    )
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
      { signal: requestOptions.signal ?? undefined },
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
      { signal: requestOptions.signal ?? undefined },
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
    chunk: ChatCompletionChunk,
  ): { text: string } | undefined {
    // The chunk-adapter stashes the raw reasoning deltas on a non-standard
    // field so we don't need to round-trip them through camelCase ↔
    // snake_case on the OpenAI Chat Completions chunk schema.
    const reasoning = (chunk as unknown as { _reasoningText?: string })
      ._reasoningText
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
      return {
        role: 'tool',
        content:
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content),
        toolCallId: message.toolCallId || '',
      } satisfies ChatMessages
    }

    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content
              ? JSON.stringify(message.content)
              : undefined,
        toolCalls: message.toolCalls,
      } satisfies ChatMessages
    }

    // user
    const contentParts = this.normalizeContent(message.content)
    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
      return {
        role: 'user',
        content: contentParts[0].content,
      } satisfies ChatMessages
    }

    const parts: Array<ChatContentItems> = []
    for (const part of contentParts) {
      const converted = this.convertContentPartToOpenRouter(part)
      if (converted) parts.push(converted)
    }
    return {
      role: 'user',
      content: parts.length ? parts : [{ type: 'text', text: '' }],
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
        const url =
          part.source.type === 'data' && !value.startsWith('data:')
            ? `data:${part.source.mimeType};base64,${value}`
            : value
        return {
          type: 'image_url',
          imageUrl: { url, detail: meta?.detail || 'auto' },
        }
      }
      case 'audio':
        return {
          type: 'input_audio',
          inputAudio: { data: part.source.value, format: 'mp3' },
        }
      case 'video':
        return { type: 'video_url', videoUrl: { url: part.source.value } }
      case 'document':
        // SDK doesn't have a document_url type — surface as text so the
        // model at least sees the URL rather than dropping the part.
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
    const variantSuffix = modelOptions?.variant ? `:${modelOptions.variant}` : ''

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
    out.streamOptions = p.stream_options
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
    if ((chunk as any).error) {
      throw Object.assign(new Error((chunk as any).error.message || 'OpenRouter stream error'), {
        code: (chunk as any).error.code,
      })
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
