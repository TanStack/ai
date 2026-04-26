import type { ModelMessage, StreamChunk, UIMessage } from '@tanstack/ai'

/**
 * Merge custom headers into request headers
 */
function mergeHeaders(
  customHeaders?: Record<string, string> | Headers,
): Record<string, string> {
  if (!customHeaders) {
    return {}
  }
  if (customHeaders instanceof Headers) {
    const result: Record<string, string> = {}
    customHeaders.forEach((value, key) => {
      result[key] = value
    })
    return result
  }
  return customHeaders
}

/**
 * Parse SSE-formatted lines into StreamChunks.
 * Handles both `data: {...}` lines and bare JSON lines, and skips `[DONE]`.
 */
async function* parseSSEChunks(
  lines: AsyncIterable<string>,
): AsyncGenerator<StreamChunk> {
  for await (const line of lines) {
    const data = line.startsWith('data: ') ? line.slice(6) : line
    if (data === '[DONE]') continue
    try {
      yield JSON.parse(data) as StreamChunk
    } catch {
      console.warn('Failed to parse SSE chunk:', data)
    }
  }
}

/**
 * Yield StreamChunks from a Response body parsed as SSE.
 */
async function* responseToSSEChunks(
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status} ${response.statusText}`,
    )
  }
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }
  yield* parseSSEChunks(readStreamLines(reader, abortSignal))
}

/**
 * Read lines from a stream (newline-delimited)
 */
async function* readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  try {
    const decoder = new TextDecoder()
    let buffer = ''

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      // Check if aborted before reading
      if (abortSignal?.aborted) {
        break
      }

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          yield line
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      yield buffer
    }
  } finally {
    reader.releaseLock()
  }
}

export interface ConnectConnectionAdapter {
  /**
   * Connect and return an async iterable of StreamChunks.
   */
  connect: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>
}

export interface SubscribeConnectionAdapter {
  /**
   * Subscribe to stream chunks.
   */
  subscribe: (abortSignal?: AbortSignal) => AsyncIterable<StreamChunk>
  /**
   * Send a request; chunks arrive through subscribe().
   */
  send: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
  ) => Promise<void>
}

/**
 * Connection adapter union.
 * Provide either `connect`, or `subscribe` + `send`.
 */
export type ConnectionAdapter =
  | ConnectConnectionAdapter
  | SubscribeConnectionAdapter

/**
 * Normalize a ConnectionAdapter to subscribe/send operations.
 *
 * If a connection provides native subscribe/send, that mode is used.
 * Otherwise, connect() is wrapped using an async queue.
 */
export function normalizeConnectionAdapter(
  connection: ConnectionAdapter | undefined,
): SubscribeConnectionAdapter {
  if (!connection) {
    throw new Error('Connection adapter is required')
  }

  const hasConnect = 'connect' in connection
  const hasSubscribe = 'subscribe' in connection
  const hasSend = 'send' in connection

  if (hasConnect && (hasSubscribe || hasSend)) {
    throw new Error(
      'Connection adapter must provide either connect or both subscribe and send, not both modes',
    )
  }

  if (hasSubscribe && hasSend) {
    return {
      subscribe: connection.subscribe.bind(connection),
      send: connection.send.bind(connection),
    }
  }

  if (!hasConnect) {
    throw new Error(
      'Connection adapter must provide either connect or both subscribe and send',
    )
  }

  // Legacy connect() wrapper
  let activeBuffer: Array<StreamChunk> = []
  let activeWaiters: Array<(chunk: StreamChunk | null) => void> = []

  function push(chunk: StreamChunk): void {
    const waiter = activeWaiters.shift()
    if (waiter) {
      waiter(chunk)
    } else {
      activeBuffer.push(chunk)
    }
  }

  return {
    subscribe(abortSignal?: AbortSignal): AsyncIterable<StreamChunk> {
      // Transfer ownership to the latest subscriber so only one active
      // subscribe() call receives chunks from the shared connect-wrapper queue.
      const myBuffer: Array<StreamChunk> = activeBuffer.splice(0)
      const myWaiters: Array<(chunk: StreamChunk | null) => void> = []
      activeBuffer = myBuffer
      activeWaiters = myWaiters

      return (async function* () {
        while (!abortSignal?.aborted) {
          let chunk: StreamChunk | null
          if (myBuffer.length > 0) {
            chunk = myBuffer.shift()!
          } else {
            chunk = await new Promise<StreamChunk | null>((resolve) => {
              const onAbort = () => resolve(null)
              myWaiters.push((c) => {
                abortSignal?.removeEventListener('abort', onAbort)
                resolve(c)
              })
              abortSignal?.addEventListener('abort', onAbort, { once: true })
            })
          }
          if (chunk !== null) yield chunk
        }
      })()
    },
    async send(messages, data, abortSignal) {
      let hasTerminalEvent = false
      try {
        const stream = connection.connect(messages, data, abortSignal)
        for await (const chunk of stream) {
          if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
            hasTerminalEvent = true
          }
          push(chunk)
        }

        // If the connect stream ended cleanly without a terminal event,
        // synthesize RUN_FINISHED so request-scoped consumers can complete.
        if (!abortSignal?.aborted && !hasTerminalEvent) {
          push({
            type: 'RUN_FINISHED',
            runId: `run-${Date.now()}`,
            model: 'connect-wrapper',
            timestamp: Date.now(),
            finishReason: 'stop',
          })
        }
      } catch (err) {
        if (!abortSignal?.aborted && !hasTerminalEvent) {
          push({
            type: 'RUN_ERROR',
            timestamp: Date.now(),
            error: {
              message:
                err instanceof Error
                  ? err.message
                  : 'Unknown error in connect()',
            },
          })
        }
        throw err
      }
    },
  }
}

/**
 * Options for fetch-based connection adapters
 */
export interface FetchConnectionOptions {
  headers?: Record<string, string> | Headers
  credentials?: RequestCredentials
  signal?: AbortSignal
  body?: Record<string, any>
  fetchClient?: typeof globalThis.fetch
}

/**
 * Create a Server-Sent Events connection adapter
 *
 * @param url - The API endpoint URL (or a function that returns the URL)
 * @param options - Fetch options (headers, credentials, body, etc.) or a function that returns options (can be async)
 * @returns A connection adapter for SSE streams
 *
 * @example
 * ```typescript
 * // Static URL
 * const connection = fetchServerSentEvents('/api/chat');
 *
 * // Dynamic URL
 * const connection = fetchServerSentEvents(() => `/api/chat?user=${userId}`);
 *
 * // With options
 * const connection = fetchServerSentEvents('/api/chat', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 *
 * // With dynamic options
 * const connection = fetchServerSentEvents('/api/chat', () => ({
 *   headers: { 'Authorization': `Bearer ${getToken()}` }
 * }));
 *
 * // With additional body data
 * const connection = fetchServerSentEvents('/api/chat', async () => ({
 *   body: {
 *     provider: 'openai',
 *     model: 'gpt-4o',
 *   }
 * }));
 * ```
 */
export function fetchServerSentEvents(
  url: string | (() => string),
  options:
    | FetchConnectionOptions
    | (() => FetchConnectionOptions | Promise<FetchConnectionOptions>) = {},
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      // Resolve URL and options if they are functions
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...mergeHeaders(resolvedOptions.headers),
      }

      // Send messages as-is (UIMessages with parts preserved)
      // Server-side TextEngine handles conversion to ModelMessages
      const requestBody = {
        messages,
        data,
        ...resolvedOptions.body,
      }

      const fetchClient = resolvedOptions.fetchClient ?? fetch
      const response = await fetchClient(resolvedUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        credentials: resolvedOptions.credentials || 'same-origin',
        signal: abortSignal || resolvedOptions.signal,
      })

      yield* responseToSSEChunks(response, abortSignal)
    },
  }
}

/**
 * Create an HTTP streaming connection adapter (for raw streaming without SSE format)
 *
 * @param url - The API endpoint URL (or a function that returns the URL)
 * @param options - Fetch options (headers, credentials, body, etc.) or a function that returns options (can be async)
 * @returns A connection adapter for HTTP streams
 *
 * @example
 * ```typescript
 * // Static URL
 * const connection = fetchHttpStream('/api/chat');
 *
 * // Dynamic URL
 * const connection = fetchHttpStream(() => `/api/chat?user=${userId}`);
 *
 * // With options
 * const connection = fetchHttpStream('/api/chat', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 *
 * // With dynamic options
 * const connection = fetchHttpStream('/api/chat', () => ({
 *   headers: { 'Authorization': `Bearer ${getToken()}` }
 * }));
 *
 * // With additional body data
 * const connection = fetchHttpStream('/api/chat', async () => ({
 *   body: {
 *     provider: 'openai',
 *     model: 'gpt-4o',
 *   }
 * }));
 * ```
 */
export function fetchHttpStream(
  url: string | (() => string),
  options:
    | FetchConnectionOptions
    | (() => FetchConnectionOptions | Promise<FetchConnectionOptions>) = {},
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      // Resolve URL and options if they are functions
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...mergeHeaders(resolvedOptions.headers),
      }

      // Send messages as-is (UIMessages with parts preserved)
      // Server-side TextEngine handles conversion to ModelMessages
      const requestBody = {
        messages,
        data,
        ...resolvedOptions.body,
      }

      const fetchClient = resolvedOptions.fetchClient ?? fetch
      const response = await fetchClient(resolvedUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        credentials: resolvedOptions.credentials || 'same-origin',
        signal: abortSignal || resolvedOptions.signal,
      })

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`,
        )
      }

      // Parse raw HTTP stream (newline-delimited JSON)
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Response body is not readable')
      }

      for await (const line of readStreamLines(reader, abortSignal)) {
        try {
          const parsed: StreamChunk = JSON.parse(line)
          yield parsed
        } catch (parseError) {
          console.warn('Failed to parse HTTP stream chunk:', line)
        }
      }
    },
  }
}

/**
 * Result shapes a `stream()` factory may return.
 *
 * - `AsyncIterable<StreamChunk>` — a direct in-process stream (e.g. `chat()`).
 * - `Promise<AsyncIterable<StreamChunk>>` — a TanStack Start server function
 *   whose handler returns the chat stream directly.
 * - `Promise<Response>` — a server function whose handler returns
 *   `toServerSentEventsResponse(stream)` (or any HTTP endpoint returning SSE).
 */
export type StreamFactoryResult =
  | AsyncIterable<StreamChunk>
  | Promise<AsyncIterable<StreamChunk> | Response>

/**
 * Create a direct stream connection adapter.
 *
 * Accepts any of:
 *
 * 1. An in-process async iterable factory (returns `AsyncIterable<StreamChunk>`).
 * 2. A TanStack Start server function whose handler returns the chat stream
 *    (returns `Promise<AsyncIterable<StreamChunk>>`).
 * 3. A TanStack Start server function whose handler returns an SSE `Response`
 *    via `toServerSentEventsResponse(stream)` (returns `Promise<Response>`).
 *
 * Server functions are just async API endpoints — the third shape is the
 * recommended pattern when you want to keep network bytes small (SSE) and
 * still get end-to-end type safety from the server function call.
 *
 * @param streamFactory - Function called per request; returns one of the shapes above.
 *
 * @example
 * ```typescript
 * // 1. In-process async iterable (e.g. tests, in-memory loop)
 * useChat({ connection: stream(async function* () { yield ... }) })
 *
 * // 2. Server function returning the chat stream directly
 * const chatFn = createServerFn({ method: 'POST' })
 *   .inputValidator((data: { messages: UIMessage[] }) => data)
 *   .handler(({ data }) => chat({ adapter, messages: data.messages }))
 *
 * useChat({ connection: stream((messages) => chatFn({ data: { messages } })) })
 *
 * // 3. Server function returning an SSE Response (recommended)
 * const chatFn = createServerFn({ method: 'POST' })
 *   .inputValidator((data: { messages: UIMessage[] }) => data)
 *   .handler(({ data }) =>
 *     toServerSentEventsResponse(chat({ adapter, messages: data.messages })),
 *   )
 *
 * useChat({ connection: stream((messages) => chatFn({ data: { messages } })) })
 * ```
 */
export function stream(
  streamFactory: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
  ) => StreamFactoryResult,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      const result = await streamFactory(messages, data)
      if (result instanceof Response) {
        yield* responseToSSEChunks(result, abortSignal)
      } else {
        yield* result
      }
    },
  }
}

/**
 * Create an RPC stream connection adapter (for RPC-based streaming like Cap'n Web RPC).
 *
 * The RPC call may return the async iterable synchronously or as a Promise.
 *
 * @param rpcCall - A function that accepts messages and returns an async iterable of StreamChunks
 * @returns A connection adapter for RPC streams
 *
 * @example
 * ```typescript
 * // With Cap'n Web RPC
 * const connection = rpcStream((messages, data) =>
 *   api.streamMurfResponse(messages, data)
 * );
 *
 * const client = new ChatClient({ connection });
 * ```
 */
export function rpcStream(
  rpcCall: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
  ) => AsyncIterable<StreamChunk> | Promise<AsyncIterable<StreamChunk>>,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data) {
      const iterable = await rpcCall(messages, data)
      yield* iterable
    },
  }
}
