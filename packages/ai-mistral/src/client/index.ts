import { MistralError } from '@mistralai/mistralai/models/errors/mistralerror.js'
import { SDKError } from '@mistralai/mistralai/models/errors/sdkerror.js'
import {
  ConnectionError,
  RequestAbortedError,
  RequestTimeoutError,
  UnexpectedClientError,
} from '@mistralai/mistralai/models/errors/httpclienterrors.js'
import { sendWith } from '@tanstack/ai-utils/kubb'
import {
  mistralPostV1ChatCompletions,
  mistralPostV1Embeddings,
} from '../generated/client/sdk'
import type { ClientInstance, GeneratedRequest } from '@tanstack/ai-utils/kubb'
import type {
  MistralPostV1ChatCompletionsBody,
  MistralPostV1EmbeddingsBody,
} from '../generated/client/types'
import type {
  AssistantMessage,
  AssistantMessage$Outbound,
  ChatCompletionChoice,
  ChatCompletionResponse,
  ContentChunk,
  ContentChunk$Outbound,
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
 * The Mistral client the adapters call. Requests are the generated wire
 * bodies; responses are the SDK types.
 */
export interface MistralClient {
  chat: {
    complete: (
      body: MistralPostV1ChatCompletionsBody,
      options?: MistralRequestOptions,
    ) => Promise<ChatCompletionResponse>
  }
  embeddings: {
    create: (
      body: MistralPostV1EmbeddingsBody,
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
  body: WireChatCompletion,
): ChatCompletionResponse {
  return {
    id: body.id,
    object: body.object,
    model: body.model,
    usage: usageFromWire(body.usage),
    created: body.created,
    choices: body.choices.map((choice) => ({
      index: choice.index,
      message: choice.message && assistantFromWire(choice.message),
      messages: choice.messages?.map(assistantFromWire),
      finishReason: choice.finish_reason,
    })),
  }
}

/** The SDK `EmbeddingResponse` for a wire response. */
export function embeddingResponseFromWire(
  body: WireEmbedding,
): EmbeddingResponse {
  return {
    id: body.id,
    object: body.object,
    model: body.model,
    usage: usageFromWire(body.usage),
    data: body.data.map((item) => ({
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

  // Sends one generated request. It resolves to a 200 JSON response, else
  // throws the SDK error.
  async function send(
    built: GeneratedRequest,
    requestOptions?: MistralRequestOptions,
  ) {
    // The generated path starts with `/v1/`. Relative to `baseURL`, it keeps a
    // path prefix of a custom base URL.
    const url = new URL(built.path.replace(/^\/+/, ''), baseURL)
    url.hash = ''
    // The generated body headers (its content type) go first, so the client
    // headers win.
    const headers = new Headers({
      ...built.headers,
      Accept: 'application/json',
    })
    if (apiKey) {
      const isBearer = apiKey.slice(0, 7).toLowerCase() === 'bearer '
      headers.set('Authorization', isBearer ? apiKey : `Bearer ${apiKey}`)
    }
    const init: RequestInit = {
      method: built.method,
      headers,
      body: built.body,
      signal:
        requestOptions?.signal ??
        requestOptions?.fetchOptions?.signal ??
        (timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined),
    }
    const doFetch =
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
      response = await doFetch(requestURL, init)
    } catch (err) {
      throw toClientError(err)
    }

    const isJSON = isJSONResponse(response)
    if (response.status === 200 && isJSON) return response

    const request = new Request(requestURL, {
      method: built.method,
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

  // Runs a generated operation through `send` and parses the JSON body.
  async function post(
    operation: (client: ClientInstance) => Promise<{ response: Response }>,
    requestOptions?: MistralRequestOptions,
  ) {
    const { response } = await operation(
      sendWith((built) => send(built, requestOptions)),
    )
    const body = JSON.parse(await response.text())
    const deprecation = response.headers.get('x-model-deprecation-timestamp')
    if (deprecation !== null) {
      console.warn(
        `WARNING: The model ${body.model} is deprecated and will be removed on ${deprecation}. Please refer to https://docs.mistral.ai/getting-started/models/#api-versioning for more information.`,
      )
    }
    return body
  }

  return {
    chat: {
      complete: async (body, options) =>
        chatCompletionResponseFromWire(
          await post(
            (client) =>
              mistralPostV1ChatCompletions({
                client,
                body,
              }),
            options,
          ),
        ),
    },
    embeddings: {
      create: async (body, options) =>
        embeddingResponseFromWire(
          await post(
            (client) =>
              mistralPostV1Embeddings({
                client,
                body,
              }),
            options,
          ),
        ),
    },
  }
}
