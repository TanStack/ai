import { MistralError } from '@mistralai/mistralai/models/errors/mistralerror.js'
import { SDKError } from '@mistralai/mistralai/models/errors/sdkerror.js'
import {
  ConnectionError,
  RequestAbortedError,
  RequestTimeoutError,
  UnexpectedClientError,
} from '@mistralai/mistralai/models/errors/httpclienterrors.js'
import type {
  AssistantMessage,
  AssistantMessage$Outbound,
  ChatCompletionChoice,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ContentChunk,
  ContentChunk$Outbound,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingResponseData,
  ImageURLChunk,
  ThinkChunk,
  Thinking$Outbound,
  ToolCall,
  UsageInfo,
  UsageInfo$Outbound,
  ValidationError,
} from '@mistralai/mistralai/models/components'
import type { MistralClientConfig } from '../utils/client'

/**
 * The part of the Mistral SDK client that the adapters call. A real
 * `Mistral` instance fits this type.
 */
export interface MistralClient {
  chat: {
    complete: (
      request: ChatCompletionRequest,
      options?: MistralRequestOptions,
    ) => Promise<ChatCompletionResponse>
  }
  embeddings: {
    create: (
      request: EmbeddingRequest,
      options?: MistralRequestOptions,
    ) => Promise<EmbeddingResponse>
  }
}

/**
 * The part of the SDK `RequestOptions` that the adapters pass. Same as the
 * SDK: a signal replaces the default timeout.
 */
export interface MistralRequestOptions {
  signal?: AbortSignal | null
  fetchOptions?: { signal?: AbortSignal | null }
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

// ===========================
// Outbound: SDK camelCase -> wire snake_case (the SDK `$outboundSchema`s)
// ===========================

function chunkToWire(chunk: ContentChunk) {
  switch (chunk.type) {
    case 'image_url':
      return { type: chunk.type, image_url: chunk.imageUrl }
    case 'document_url':
      return {
        type: chunk.type,
        document_url: chunk.documentUrl,
        document_name: chunk.documentName,
      }
    case 'text':
      return { type: chunk.type, text: chunk.text }
    case 'reference':
      return { type: chunk.type, reference_ids: chunk.referenceIds }
    case 'file':
      return { type: chunk.type, file_id: chunk.fileId }
    case 'thinking':
      return thinkChunkToWire(chunk)
    case 'input_audio':
      return { type: chunk.type, input_audio: chunk.inputAudio }
    case 'UNKNOWN':
      // An unknown chunk read from a response. Send what came in.
      return chunk.raw
  }
}

function thinkChunkToWire(chunk: ThinkChunk) {
  return {
    type: 'thinking',
    thinking: chunk.thinking.map((part) => {
      if ('referenceIds' in part) {
        return { type: 'reference', reference_ids: part.referenceIds }
      }
      if ('title' in part) {
        const { tool, title, url, favicon, description } = part
        return {
          type: 'tool_reference',
          tool,
          title,
          url,
          favicon,
          description,
        }
      }
      return { type: 'text', text: part.text }
    }),
    closed: chunk.closed,
  }
}

function contentToWire(
  content: string | Array<ContentChunk> | null | undefined,
) {
  return Array.isArray(content) ? content.map(chunkToWire) : content
}

function messageToWire(message: ChatCompletionRequest['messages'][number]) {
  switch (message.role) {
    case 'assistant':
      return {
        role: message.role,
        content: contentToWire(message.content),
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id ?? 'null',
          type: call.type,
          function: call.function,
          index: call.index ?? 0,
        })),
        prefix: message.prefix ?? false,
      }
    case 'system':
      return { role: message.role, content: contentToWire(message.content) }
    case 'tool':
      return {
        role: message.role,
        content: contentToWire(message.content),
        tool_call_id: message.toolCallId,
        name: message.name,
      }
    case 'user':
      return { role: message.role, content: contentToWire(message.content) }
  }
}

/** The JSON body the SDK sends for `chat.complete`. */
export function chatCompletionRequestToWire(request: ChatCompletionRequest) {
  const { responseFormat, prediction } = request
  const jsonSchema = responseFormat?.jsonSchema
  return {
    model: request.model,
    temperature: request.temperature,
    top_p: request.topP,
    max_tokens: request.maxTokens,
    stream: request.stream ?? false,
    stop: request.stop,
    random_seed: request.randomSeed,
    metadata: request.metadata,
    messages: request.messages.map(messageToWire),
    response_format: responseFormat && {
      type: responseFormat.type,
      json_schema: jsonSchema && {
        name: jsonSchema.name,
        description: jsonSchema.description,
        schema: jsonSchema.schemaDefinition,
        strict: jsonSchema.strict,
      },
    },
    // ponytail: function tools and tool choice need no renames. Built-in
    // connector tools and `guardrails` go out as given; the adapters never
    // send them. Port their rename tables when an adapter does.
    tools: request.tools,
    tool_choice: request.toolChoice,
    presence_penalty: request.presencePenalty,
    frequency_penalty: request.frequencyPenalty,
    n: request.n,
    prediction: prediction && {
      type: prediction.type ?? 'content',
      content: prediction.content ?? '',
    },
    parallel_tool_calls: request.parallelToolCalls,
    reasoning_effort: request.reasoningEffort,
    prompt_mode: request.promptMode,
    guardrails: request.guardrails,
    safe_prompt: request.safePrompt,
  }
}

/** The JSON body the SDK sends for `embeddings.create`. */
export function embeddingRequestToWire(request: EmbeddingRequest) {
  return {
    model: request.model,
    metadata: request.metadata,
    input: request.inputs,
    output_dimension: request.outputDimension,
    output_dtype: request.outputDtype,
    encoding_format: request.encodingFormat,
  }
}

// ===========================
// Inbound: wire snake_case -> SDK camelCase (the SDK `$inboundSchema`s)
// ===========================

/** An assistant message on the wire. The SDK fills `role` and `prefix`. */
type WireAssistant = Omit<
  AssistantMessage$Outbound,
  'role' | 'prefix' | 'tool_calls' | 'content'
> & {
  role?: 'assistant'
  content?: string | Array<WireContentChunk> | null
  prefix?: boolean
  tool_calls?: Array<ToolCall> | null
}

/** A content chunk on the wire. `image_url` keeps the SDK value as is. */
type WireContentChunk =
  | Exclude<ContentChunk$Outbound, { type: 'image_url' }>
  | { type: 'image_url'; image_url: ImageURLChunk['imageUrl'] }

/** Usage on the wire. The SDK fills missing token counts with 0. */
type WireUsage = Partial<UsageInfo$Outbound>

interface WireChoice {
  index: number
  message?: WireAssistant
  messages?: Array<WireAssistant>
  finish_reason: ChatCompletionChoice['finishReason']
}

interface WireChatCompletion {
  id: string
  object: string
  model: string
  usage: WireUsage
  created: number
  choices: Array<WireChoice>
}

interface WireEmbedding {
  id: string
  object: string
  model: string
  usage: WireUsage
  data: Array<EmbeddingResponseData>
}

function usageFromWire(usage: WireUsage): UsageInfo {
  // Unknown keys (`prompt_tokens_details`, `num_cached_tokens`) stay as they
  // are, like the SDK's catchall.
  const {
    prompt_tokens = 0,
    completion_tokens = 0,
    total_tokens = 0,
    prompt_audio_seconds,
    ...rest
  } = usage
  return {
    ...rest,
    promptTokens: prompt_tokens,
    completionTokens: completion_tokens,
    totalTokens: total_tokens,
    ...('prompt_audio_seconds' in usage && {
      promptAudioSeconds: prompt_audio_seconds,
    }),
  }
}

function thinkingFromWire(
  part: Thinking$Outbound,
): ThinkChunk['thinking'][number] {
  switch (part.type) {
    case 'reference':
      return { type: part.type, referenceIds: part.reference_ids }
    case 'tool_reference':
      return part
    case 'text':
      return { type: part.type, text: part.text }
  }
}

function chunkFromWire(chunk: WireContentChunk): ContentChunk {
  switch (chunk.type) {
    case 'image_url':
      return { type: chunk.type, imageUrl: chunk.image_url }
    case 'document_url':
      return {
        type: chunk.type,
        documentUrl: chunk.document_url,
        documentName: chunk.document_name,
      }
    case 'text':
      return { type: chunk.type, text: chunk.text }
    case 'reference':
      return { type: chunk.type, referenceIds: chunk.reference_ids }
    case 'file':
      return { type: chunk.type, fileId: chunk.file_id }
    case 'thinking':
      return {
        type: chunk.type,
        thinking: chunk.thinking.map(thinkingFromWire),
        closed: chunk.closed,
      }
    case 'input_audio':
      return { type: chunk.type, inputAudio: chunk.input_audio }
    default:
      return { raw: chunk, type: 'UNKNOWN', isUnknown: true }
  }
}

function toolCallFromWire(call: ToolCall): ToolCall {
  return {
    id: call.id ?? 'null',
    type: call.type,
    function: { name: call.function.name, arguments: call.function.arguments },
    index: call.index ?? 0,
  }
}

function assistantFromWire(message: WireAssistant): AssistantMessage {
  const { content, tool_calls: toolCalls } = message
  return {
    role: message.role ?? 'assistant',
    content: Array.isArray(content) ? content.map(chunkFromWire) : content,
    toolCalls: toolCalls && toolCalls.map(toolCallFromWire),
    prefix: message.prefix ?? false,
  }
}

/** The SDK `ChatCompletionResponse` for a wire response. */
export function chatCompletionResponseFromWire(
  wire: WireChatCompletion,
): ChatCompletionResponse {
  return {
    id: wire.id,
    object: wire.object,
    model: wire.model,
    usage: usageFromWire(wire.usage),
    created: wire.created,
    choices: wire.choices.map((choice) => ({
      index: choice.index,
      message: choice.message && assistantFromWire(choice.message),
      messages: choice.messages?.map(assistantFromWire),
      finishReason: choice.finish_reason,
    })),
  }
}

/** The SDK `EmbeddingResponse` for a wire response. */
export function embeddingResponseFromWire(
  wire: WireEmbedding,
): EmbeddingResponse {
  return {
    id: wire.id,
    object: wire.object,
    model: wire.model,
    usage: usageFromWire(wire.usage),
    data: wire.data.map((item) => ({
      object: item.object,
      embedding: item.embedding,
      index: item.index,
    })),
  }
}

// ===========================
// Errors
// ===========================

/**
 * The SDK's `HTTPValidationError` (422), with the same name, message, and
 * fields. The SDK class module loads zod, so this copy stands in for it.
 * It extends the real `MistralError`.
 */
export class HTTPValidationError extends MistralError {
  detail?: Array<ValidationError>
  data$: {
    detail?: Array<ValidationError>
    request$: Request
    response$: Response
    body$: string
  }

  constructor(
    err: HTTPValidationError['data$'],
    httpMeta: { request: Request; response: Response; body: string },
  ) {
    // The SDK schema strips `message`, so the SDK always builds this text.
    super(`API error occurred: ${JSON.stringify(err)}`, httpMeta)
    this.data$ = err
    if (err.detail != null) this.detail = err.detail
    this.name = 'HTTPValidationError'
  }
}

const hasCode = (err: object, test: (code: unknown) => boolean) =>
  'code' in err && test(err.code)

const isEconn = (suffix: string) => (code: unknown) =>
  typeof code === 'string' && code.toLowerCase() === `econn${suffix}`

/** The SDK `_do` error mapping for a failed fetch. */
function toClientError(err: unknown) {
  if (typeof err !== 'object' || err === null) {
    return new UnexpectedClientError('Unexpected HTTP client error', {
      cause: err,
    })
  }
  const name = 'name' in err ? err.name : undefined
  const isAbort =
    name === 'AbortError' ||
    hasCode(err, (code) => code === 20) ||
    hasCode(err, isEconn('aborted'))
  if (isAbort) {
    return new RequestAbortedError('Request aborted by client', { cause: err })
  }
  const isTimeout =
    name === 'TimeoutError' || hasCode(err, (code) => code === 23)
  if (isTimeout) {
    return new RequestTimeoutError('Request timed out', { cause: err })
  }
  const message = err instanceof TypeError ? err.message.toLowerCase() : ''
  const isConnection =
    message.startsWith('failed to fetch') ||
    message.startsWith('fetch failed') ||
    name === 'ConnectionError' ||
    hasCode(err, isEconn('reset'))
  if (isConnection) {
    return new ConnectionError('Unable to make request', { cause: err })
  }
  return new UnexpectedClientError('Unexpected HTTP client error', {
    cause: err,
  })
}

const isJSONResponse = (response: Response) =>
  (response.headers.get('content-type')?.trim() || '')
    .toLowerCase()
    .split(/\s*;\s*/)[0] === 'application/json'

const isStatusFamily = (response: Response, family: string) =>
  String(response.status).startsWith(family)

// ===========================
// Client
// ===========================

/**
 * Creates the Mistral client the adapters use. It sends the same requests as
 * the SDK `Mistral` client (no retries, 30 s default timeout) with `fetch`.
 * A `fetcher` replaces `fetch`; it gets `(url, init)`.
 *
 * @throws The SDK error classes: `SDKError` for a 4xx/5xx or an unexpected
 * response, `HTTPValidationError` for a 422 JSON body, and the HTTP client
 * errors (`ConnectionError`, `RequestTimeoutError`, `RequestAbortedError`,
 * `UnexpectedClientError`) when the request fails.
 */
export function createMistralClient(
  config: MistralClientConfig,
  fetcher?: Fetcher,
): MistralClient {
  const { apiKey, defaultHeaders, getAccessToken, resolveRequestUrl } = config
  const baseURL = new URL(
    config.baseURL || config.serverURL || 'https://api.mistral.ai',
  )
  baseURL.pathname = `${baseURL.pathname.replace(/\/+$/, '')}/`
  const timeoutMs = config.timeoutMs || 30000

  async function post(
    path: string,
    body: unknown,
    requestOptions?: MistralRequestOptions,
  ) {
    const url = new URL(path, baseURL)
    url.hash = ''
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    })
    if (apiKey) {
      const isBearer = apiKey.slice(0, 7).toLowerCase() === 'bearer '
      headers.set('Authorization', isBearer ? apiKey : `Bearer ${apiKey}`)
    }
    const init: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal:
        requestOptions?.signal ??
        requestOptions?.fetchOptions?.signal ??
        (timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined),
    }
    const send =
      fetcher ??
      ((input: string, options: RequestInit) => fetch(input, options))

    let requestURL = url.href
    let response: Response
    try {
      // The SDK runs these in its request hook, so their errors map the same.
      if (resolveRequestUrl !== undefined) requestURL = resolveRequestUrl(false)
      for (const [key, value] of Object.entries(defaultHeaders ?? {})) {
        headers.set(key, value)
      }
      if (getAccessToken !== undefined) {
        headers.set('Authorization', `Bearer ${await getAccessToken()}`)
      }
      response = await send(requestURL, init)
    } catch (err) {
      throw toClientError(err)
    }

    const isJSON = isJSONResponse(response)
    if (response.status === 200 && isJSON) {
      const wire = JSON.parse(await response.text())
      const deprecation = response.headers.get('x-model-deprecation-timestamp')
      if (deprecation !== null) {
        console.warn(
          `WARNING: The model ${wire.model} is deprecated and will be removed on ${deprecation}. Please refer to https://docs.mistral.ai/getting-started/models/#api-versioning for more information.`,
        )
      }
      return wire
    }

    const request = new Request(requestURL, {
      method: 'POST',
      headers,
      body: init.body,
    })
    const isAPIError =
      isStatusFamily(response, '4') || isStatusFamily(response, '5')
    if (response.status === 422 && isJSON) {
      const text = await response.text()
      const raw: { detail?: Array<ValidationError> } = JSON.parse(text)
      const detail = raw.detail?.map(({ loc, msg, type, input, ctx }) => ({
        loc,
        msg,
        type,
        input,
        ...(ctx !== undefined && { ctx: {} }),
      }))
      throw new HTTPValidationError(
        {
          ...(detail !== undefined && { detail }),
          request$: request,
          response$: response,
          body$: text,
        },
        { request, response, body: text },
      )
    }
    if (isAPIError) {
      const text = await response.text()
      throw new SDKError('API error occurred', {
        request,
        response,
        body: text,
      })
    }
    const text = await response.text().catch(() => '')
    throw new SDKError('Unexpected Status or Content-Type', {
      request,
      response,
      body: text,
    })
  }

  return {
    chat: {
      complete: async (request, options) =>
        chatCompletionResponseFromWire(
          await post(
            'v1/chat/completions',
            chatCompletionRequestToWire(request),
            options,
          ),
        ),
    },
    embeddings: {
      create: async (request, options) =>
        embeddingResponseFromWire(
          await post('v1/embeddings', embeddingRequestToWire(request), options),
        ),
    },
  }
}
