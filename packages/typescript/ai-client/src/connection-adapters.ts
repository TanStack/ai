import { EventType, uiMessagesToWire } from '@tanstack/ai'
import type {
  ModelMessage,
  RunErrorEvent,
  RunFinishedEvent,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai'
import type { ChatFetcher } from './types'

/**
 * Thrown when an SSE/HTTP stream ends with a non-empty unterminated buffer.
 * Indicates the connection was cut mid-line (server crash, dropped TCP, proxy
 * timeout) so the partial content cannot be safely parsed.
 */
export class StreamTruncatedError extends Error {
  constructor() {
    super(
      'Stream ended with unterminated trailing data — connection was likely cut short.',
    )
    this.name = 'StreamTruncatedError'
  }
}

function generateRunId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Asserts an id is present when synthesizing a terminal event. The chat
 * client always supplies `runContext.threadId` / `runContext.runId`, so an
 * absent id at this layer indicates the adapter was wired up by a caller
 * that bypassed that contract — surface it rather than fabricating one.
 */
function requireSyntheticId(
  value: string | undefined,
  field: 'threadId' | 'runId',
): string {
  if (!value) {
    throw new Error(
      `Cannot synthesize terminal event: ${field} not supplied via runContext and not observed in the upstream stream.`,
    )
  }
  return value
}

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
 * Read lines from a stream (newline-delimited)
 */
async function* readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  try {
    const decoder = new TextDecoder()
    let buffer = ''

    while (!abortSignal?.aborted) {
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

    // A non-empty trailing buffer means the connection was cut mid-line.
    // Surface this as an error so the chat client transitions to 'error'
    // state instead of silently presenting a partial stream as success.
    // Skip when the consumer aborted — a user-initiated stop() interrupting
    // mid-line is expected, not a truncation bug.
    if (buffer.trim() && !abortSignal?.aborted) {
      throw new StreamTruncatedError()
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Yield StreamChunks parsed from an SSE Response body.
 *
 * Accepts either `data: {...}` lines or bare JSON lines. Skips comments
 * starting with `:` (proxies and CDNs inject these as keepalives) and the
 * `event:` / `id:` / `retry:` SSE control fields. A `[DONE]` sentinel is
 * treated as a terminal event: a synthesized RUN_FINISHED is yielded using
 * the most recent upstream `threadId` / `runId`, ensuring the consumer sees
 * a clean terminal event with real correlation ids.
 *
 * A JSON parse failure throws — the consumer surfaces it as an error.
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
  let lastThreadId: string | undefined
  let lastRunId: string | undefined
  let lastModel: string | undefined
  for await (const line of readStreamLines(reader, abortSignal)) {
    if (
      line.startsWith(':') ||
      line.startsWith('event:') ||
      line.startsWith('id:') ||
      line.startsWith('retry:')
    ) {
      continue
    }
    const data = line.startsWith('data: ') ? line.slice(6) : line
    if (data === '[DONE]') {
      const synthetic: RunFinishedEvent = {
        type: EventType.RUN_FINISHED,
        threadId: lastThreadId ?? '',
        runId: lastRunId ?? '',
        model: lastModel ?? '',
        timestamp: Date.now(),
        finishReason: 'stop',
      }
      yield synthetic
      return
    }
    const chunk = JSON.parse(data) as StreamChunk
    if ('threadId' in chunk && typeof chunk.threadId === 'string') {
      lastThreadId = chunk.threadId
    }
    if ('runId' in chunk && typeof chunk.runId === 'string') {
      lastRunId = chunk.runId
    }
    if ('model' in chunk && typeof chunk.model === 'string') {
      lastModel = chunk.model
    }
    yield chunk
  }
}

/**
 * Per-send context provided by the chat client to the connection adapter.
 * The adapter combines this with serialized messages to build a full
 * AG-UI `RunAgentInput` payload.
 */
export interface RunAgentInputContext {
  threadId: string
  runId: string
  parentRunId?: string
  /** Client-declared tools to advertise in the request payload. */
  clientTools?: Array<{
    name: string
    description: string
    parameters: unknown
  }>
  /** Arbitrary user-controlled passthrough data. */
  forwardedProps?: Record<string, unknown>
}

export interface ConnectConnectionAdapter {
  /**
   * Connect and return an async iterable of StreamChunks.
   */
  connect: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
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
    runContext?: RunAgentInputContext,
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
          const buffered = myBuffer.shift()
          if (buffered !== undefined) {
            chunk = buffered
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
    async send(messages, data, abortSignal, runContext) {
      let hasTerminalEvent = false
      let upstreamThreadId: string | undefined
      let upstreamRunId: string | undefined
      try {
        const stream = connection.connect(
          messages,
          data,
          abortSignal,
          runContext,
        )
        for await (const chunk of stream) {
          if ('threadId' in chunk && typeof chunk.threadId === 'string') {
            upstreamThreadId = chunk.threadId
          }
          if ('runId' in chunk && typeof chunk.runId === 'string') {
            upstreamRunId = chunk.runId
          }
          if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
            hasTerminalEvent = true
          }
          push(chunk)
        }

        // If the connect stream ended cleanly without a terminal event,
        // synthesize RUN_FINISHED so request-scoped consumers can complete.
        // Reuse the caller's threadId/runId so client-side activeRunIds tracking matches.
        if (!abortSignal?.aborted && !hasTerminalEvent) {
          const synthetic: RunFinishedEvent = {
            type: EventType.RUN_FINISHED,
            threadId: requireSyntheticId(
              upstreamThreadId ?? runContext?.threadId,
              'threadId',
            ),
            runId: requireSyntheticId(
              upstreamRunId ?? runContext?.runId,
              'runId',
            ),
            model: 'connect-wrapper',
            timestamp: Date.now(),
            finishReason: 'stop',
          }
          push(synthetic)
        }
      } catch (err) {
        if (!abortSignal?.aborted && !hasTerminalEvent) {
          const message =
            err instanceof Error ? err.message : 'Unknown error in connect()'
          const synthetic: RunErrorEvent = {
            type: EventType.RUN_ERROR,
            threadId: requireSyntheticId(
              upstreamThreadId ?? runContext?.threadId,
              'threadId',
            ),
            runId: requireSyntheticId(
              upstreamRunId ?? runContext?.runId,
              'runId',
            ),
            timestamp: Date.now(),
            message,
          }
          push(synthetic)
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
    async *connect(messages, data, abortSignal, runContext) {
      // Resolve URL and options if they are functions
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...mergeHeaders(resolvedOptions.headers),
      }

      // Build AG-UI RunAgentInput payload.
      //
      // Precedence (later spreads win): static adapter `body` is the base,
      // overridden by `runContext.forwardedProps` (constructor body /
      // forwardedProps options), overridden by per-message `data` passed
      // to `connection.send`. Runtime values win over static config —
      // this matches the documented "forwardedProps wins" semantic.
      const wireMessages = uiMessagesToWire(messages as Array<UIMessage>)
      const forwardedProps = {
        ...resolvedOptions.body,
        ...(runContext?.forwardedProps ?? {}),
        ...data,
      }
      const requestBody = {
        threadId: runContext?.threadId ?? generateRunId('thread'),
        runId: runContext?.runId ?? generateRunId('run'),
        ...(runContext?.parentRunId !== undefined && {
          parentRunId: runContext.parentRunId,
        }),
        state: {},
        messages: wireMessages,
        tools: runContext?.clientTools ?? [],
        context: [],
        forwardedProps,
        // Backward-compat mirror of `forwardedProps` under the legacy
        // field name `data`. Server endpoints that have not migrated
        // off the pre-AG-UI shape (`{ messages, data }`) keep working.
        // AG-UI strict consumers strip this via `RunAgentInputSchema`
        // (see `chatParamsFromRequestBody`). Will be removed when the
        // legacy `body` client option is dropped.
        // Shallow-cloned so that downstream mutation of `data` (e.g.
        // by a logging interceptor or fetch wrapper) cannot corrupt
        // `forwardedProps` and vice versa.
        data: { ...forwardedProps },
      }

      const fetchClient = resolvedOptions.fetchClient ?? fetch
      // `RequestInit.signal` is typed `AbortSignal | null` (no `undefined`
      // under `exactOptionalPropertyTypes`), so spread it conditionally
      // rather than passing `undefined` explicitly.
      const signal = abortSignal || resolvedOptions.signal
      const response = await fetchClient(resolvedUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        credentials: resolvedOptions.credentials || 'same-origin',
        ...(signal ? { signal } : {}),
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
    async *connect(messages, data, abortSignal, runContext) {
      // Resolve URL and options if they are functions
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options

      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...mergeHeaders(resolvedOptions.headers),
      }

      // Build AG-UI RunAgentInput payload.
      //
      // Precedence (later spreads win): static adapter `body` is the base,
      // overridden by `runContext.forwardedProps` (constructor body /
      // forwardedProps options), overridden by per-message `data` passed
      // to `connection.send`. Runtime values win over static config —
      // this matches the documented "forwardedProps wins" semantic.
      const wireMessages = uiMessagesToWire(messages as Array<UIMessage>)
      const forwardedProps = {
        ...resolvedOptions.body,
        ...(runContext?.forwardedProps ?? {}),
        ...data,
      }
      const requestBody = {
        threadId: runContext?.threadId ?? generateRunId('thread'),
        runId: runContext?.runId ?? generateRunId('run'),
        ...(runContext?.parentRunId !== undefined && {
          parentRunId: runContext.parentRunId,
        }),
        state: {},
        messages: wireMessages,
        tools: runContext?.clientTools ?? [],
        context: [],
        forwardedProps,
        // Backward-compat mirror of `forwardedProps` under the legacy
        // field name `data`. Server endpoints that have not migrated
        // off the pre-AG-UI shape (`{ messages, data }`) keep working.
        // AG-UI strict consumers strip this via `RunAgentInputSchema`
        // (see `chatParamsFromRequestBody`). Will be removed when the
        // legacy `body` client option is dropped.
        // Shallow-cloned so that downstream mutation of `data` (e.g.
        // by a logging interceptor or fetch wrapper) cannot corrupt
        // `forwardedProps` and vice versa.
        data: { ...forwardedProps },
      }

      const fetchClient = resolvedOptions.fetchClient ?? fetch
      // `RequestInit.signal` is typed `AbortSignal | null` (no `undefined`
      // under `exactOptionalPropertyTypes`), so spread it conditionally
      // rather than passing `undefined` explicitly.
      const signal = abortSignal || resolvedOptions.signal
      const response = await fetchClient(resolvedUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        credentials: resolvedOptions.credentials || 'same-origin',
        ...(signal ? { signal } : {}),
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
        yield JSON.parse(line) as StreamChunk
      }
    },
  }
}

/**
 * Create a direct stream connection adapter (for server functions or direct streams)
 *
 * @param streamFactory - A function that returns an async iterable of StreamChunks
 * @returns A connection adapter for direct streams
 *
 * @example
 * ```typescript
 * // With TanStack Start server function
 * const connection = stream(() => serverFunction({ messages }));
 *
 * const client = new ChatClient({ connection });
 * ```
 */
export function stream(
  streamFactory: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      // Pass messages as-is (UIMessages with parts preserved)
      // Server-side chat() handles conversion to ModelMessages
      yield* streamFactory(messages, data, abortSignal)
    },
  }
}

/**
 * Wrap a `ChatFetcher` as a `ConnectConnectionAdapter` so the chat client can
 * consume it through the same `subscribe`/`send` plumbing used for SSE /
 * HTTP-stream / RPC connections. May return either a `Response` (parsed as
 * SSE) or an `AsyncIterable<StreamChunk>` (yielded directly).
 *
 * @internal
 */
export function fetcherToConnectionAdapter(
  fetcher: ChatFetcher,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      if (!abortSignal) {
        throw new Error(
          'fetcherToConnectionAdapter requires an AbortSignal — the chat client always supplies one.',
        )
      }
      if (!runContext) {
        throw new Error(
          'fetcherToConnectionAdapter requires a RunAgentInputContext — the chat client always supplies one.',
        )
      }
      const uiMessages = messages as Array<UIMessage>
      const result = await fetcher(
        {
          messages: uiMessages,
          data,
          threadId: runContext.threadId,
          runId: runContext.runId,
        },
        { signal: abortSignal },
      )
      if (result instanceof Response) {
        yield* responseToSSEChunks(result, abortSignal)
      } else {
        yield* abortableIterable(result, abortSignal)
      }
    },
  }
}

/**
 * Wrap an AsyncIterable so iteration aborts when `signal` fires. Without
 * this, a fetcher that returns a generator ignoring its signal would leave
 * the for-await loop hanging until the iterable naturally ends.
 */
async function* abortableIterable<T>(
  iterable: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  if (signal.aborted) return
  const iterator = iterable[Symbol.asyncIterator]()
  const abortPromise = new Promise<{ done: true; value: undefined }>(
    (resolve) => {
      signal.addEventListener(
        'abort',
        () => resolve({ done: true, value: undefined }),
        { once: true },
      )
    },
  )
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const result = await Promise.race([iterator.next(), abortPromise])
      if (result.done) return
      yield result.value
    }
  } finally {
    await iterator.return?.()
  }
}

/**
 * Create an RPC stream connection adapter (for RPC-based streaming like Cap'n Web RPC)
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
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      // Pass messages as-is (UIMessages with parts preserved)
      // Server-side chat() handles conversion to ModelMessages
      yield* rpcCall(messages, data, abortSignal)
    },
  }
}
