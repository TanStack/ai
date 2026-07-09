import { EventType, uiMessagesToWire } from '@tanstack/ai/client'
import {
  createResponseStreamTextDecoder,
  getResponseStreamReader,
} from './response-stream'
import { parseSseDataLine } from './sse-utils'
import type {
  ModelMessage,
  RunAgentResumeItem,
  RunErrorEvent,
  RunFinishedEvent,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai/client'
import type { ChatFetcher } from './types'

/**
 * Associates connect-wrapped chunks with the run they were produced under.
 * Content events (TEXT_MESSAGE_CONTENT, TOOL_CALL_*, …) carry no `runId` of
 * their own, so the connect wrapper stamps the caller's run id here. Lets
 * run-scoped consumers (e.g. clear-during-stream suppression) attribute those
 * otherwise-runless chunks to their originating request.
 */
const chunkRunIds = new WeakMap<StreamChunk, string>()

/**
 * Resolve a chunk's run id, preferring the value on the chunk itself
 * (RUN_STARTED / RUN_FINISHED / RUN_ERROR carry one) and falling back to the
 * run the connect wrapper stamped it with.
 */
export function getChunkRunId(chunk: StreamChunk): string | undefined {
  return 'runId' in chunk && typeof chunk.runId === 'string'
    ? chunk.runId
    : chunkRunIds.get(chunk)
}

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

/**
 * Thrown when a durable (id-tagged) run's stream ends with no terminal event
 * and a reconnect makes no forward progress — the run cannot complete, so the
 * consumer must not be left silently hanging on a stream that just stops.
 */
export class DurableStreamIncompleteError extends Error {
  constructor() {
    super(
      'Durable run ended without a terminal event and could not resume — the run did not complete.',
    )
    this.name = 'DurableStreamIncompleteError'
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
    const decoder = createResponseStreamTextDecoder()
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
/**
 * Yield StreamChunks parsed from an SSE Response body, each paired with the
 * `id:` offset of the SSE event it arrived on (if any). Delivery durability
 * tags every event with `id: <runId@seq>`; carrying that id up lets the
 * resumable adapter track the last offset (for reconnect) and de-dupe replays.
 */
async function* responseToSSEEvents(
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<{ chunk: StreamChunk; id?: string }> {
  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status} ${response.statusText}`,
    )
  }
  const reader = getResponseStreamReader(response)
  let lastThreadId: string | undefined
  let lastRunId: string | undefined
  let lastModel: string | undefined
  let pendingId: string | undefined
  for await (const line of readStreamLines(reader, abortSignal)) {
    if (line.startsWith('id:')) {
      pendingId = line.slice(3).trim()
      continue
    }
    if (
      line.startsWith(':') ||
      line.startsWith('event:') ||
      line.startsWith('retry:')
    ) {
      continue
    }
    const data = parseSseDataLine(line)
    if (data === '[DONE]') {
      const synthetic: RunFinishedEvent = {
        type: EventType.RUN_FINISHED,
        threadId: lastThreadId ?? '',
        runId: lastRunId ?? '',
        model: lastModel ?? '',
        timestamp: Date.now(),
        finishReason: 'stop',
      }
      yield { chunk: synthetic }
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
    const id = pendingId
    pendingId = undefined
    yield { chunk, ...(id !== undefined ? { id } : {}) }
  }
}

async function* responseToSSEChunks(
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  for await (const { chunk } of responseToSSEEvents(response, abortSignal)) {
    yield chunk
  }
}

/**
 * Iterate an SSE endpoint with native-style resumability. Each SSE event's
 * `id:` (a `runId@seq` delivery-durability offset) is remembered; if the
 * connection drops or ends before a terminal event, the request is re-issued
 * with a `Last-Event-ID` header so the server replays strictly after the last
 * offset. Already-seen offsets are de-duped, so an overlapping replay is safe.
 *
 * When the server does NOT tag events (no durability), no offset is ever seen,
 * so no reconnect happens — behaviour is identical to a plain single fetch.
 */
async function* resumableServerSentEvents(
  fetchClient: typeof globalThis.fetch,
  url: string,
  requestInit: RequestInit,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const seen = new Set<string>()
  let lastEventId: string | undefined

  for (;;) {
    if (abortSignal?.aborted) return
    const headers: Record<string, string> = {
      ...(requestInit.headers as Record<string, string> | undefined),
    }
    if (lastEventId !== undefined) {
      headers['Last-Event-ID'] = lastEventId
    }
    const response = await fetchClient(url, {
      ...requestInit,
      headers,
      ...(abortSignal ? { signal: abortSignal } : {}),
    })

    let sawTerminal = false
    let progressed = false
    try {
      for await (const { chunk, id } of responseToSSEEvents(
        response,
        abortSignal,
      )) {
        if (id !== undefined) {
          if (seen.has(id)) continue
          seen.add(id)
          lastEventId = id
        }
        progressed = true
        if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
          sawTerminal = true
        }
        yield chunk
        if (sawTerminal) return
      }
    } catch (error) {
      if (abortSignal?.aborted) return
      // A truncated connection is resumable only if we have an offset and made
      // forward progress; otherwise surface the failure.
      if (
        error instanceof StreamTruncatedError &&
        lastEventId !== undefined &&
        progressed
      ) {
        continue
      }
      throw error
    }

    if (abortSignal?.aborted) return

    if (lastEventId !== undefined) {
      // A durable (id-tagged) run.
      if (progressed) {
        // Clean end WITHOUT a terminal event but we advanced — the producer is
        // still going (or the socket rolled over). Reconnect from the last
        // offset.
        continue
      }
      // Ended without a terminal event AND made no forward progress on this
      // pass: the run cannot complete. Surface an error rather than returning
      // silently, which would leave the consumer with neither a terminal event
      // nor a failure.
      throw new DurableStreamIncompleteError()
    }

    // A non-durable (untagged) stream that ended cleanly. Legitimate — the
    // upper layer synthesizes a terminal event. Stop.
    return
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
  /** AG-UI interrupt resume entries returned to the server on a follow-up run. */
  resume?: Array<RunAgentResumeItem>
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

/**
 * A {@link ConnectConnectionAdapter} that also supports joining an existing run
 * (a second tab, or re-attaching after a full reload) via `joinRun`, replaying
 * the ordered stream from the start off the server's delivery-durability sink.
 */
export interface ResumableConnectConnectionAdapter extends ConnectConnectionAdapter {
  /**
   * Join an in-flight or finished run by id, replaying from the start
   * (`?offset=-1`). Read-only — sends no messages.
   */
  joinRun: (
    runId: string,
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

  function push(chunk: StreamChunk, runId?: string): void {
    if (runId) {
      chunkRunIds.set(chunk, runId)
    }
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
          push(chunk, runContext?.runId)
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
 * Options for XHR-based connection adapters.
 */
export interface XhrConnectionOptions {
  headers?: Record<string, string> | Headers
  withCredentials?: boolean
  signal?: AbortSignal
  body?: Record<string, any>
  xhrFactory?: () => XMLHttpRequest
}

type ResolvedConnectionOptions = Pick<
  FetchConnectionOptions,
  'body' | 'headers'
>

function buildRunAgentInputBody(
  messages: Array<UIMessage> | Array<ModelMessage>,
  data: Record<string, any> | undefined,
  runContext: RunAgentInputContext | undefined,
  options: ResolvedConnectionOptions,
): Record<string, unknown> {
  // Precedence (later spreads win): static adapter `body` is the base,
  // overridden by `runContext.forwardedProps`, overridden by per-message `data`.
  const wireMessages = uiMessagesToWire(messages as Array<UIMessage>)
  const forwardedProps = {
    ...options.body,
    ...(runContext?.forwardedProps ?? {}),
    ...data,
  }

  return {
    threadId: runContext?.threadId ?? generateRunId('thread'),
    runId: runContext?.runId ?? generateRunId('run'),
    ...(runContext?.parentRunId !== undefined && {
      parentRunId: runContext.parentRunId,
    }),
    ...(runContext?.resume !== undefined && { resume: runContext.resume }),
    state: {},
    messages: wireMessages,
    tools: runContext?.clientTools ?? [],
    context: [],
    forwardedProps,
    // Backward-compat mirror of `forwardedProps` under the legacy field name.
    data: { ...forwardedProps },
  }
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
 *     model: 'gpt-5.5',
 *   }
 * }));
 * ```
 */
export function fetchServerSentEvents(
  url: string | (() => string),
  options:
    | FetchConnectionOptions
    | (() => FetchConnectionOptions | Promise<FetchConnectionOptions>) = {},
): ResumableConnectConnectionAdapter {
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
      const requestBody = buildRunAgentInputBody(
        messages,
        data,
        runContext,
        resolvedOptions,
      )

      const fetchClient = resolvedOptions.fetchClient ?? fetch
      // `RequestInit.signal` is typed `AbortSignal | null` (no `undefined`
      // under `exactOptionalPropertyTypes`), so spread it conditionally
      // rather than passing `undefined` explicitly.
      const signal = abortSignal || resolvedOptions.signal

      // Resumable SSE: if the server tags events with `id:` offsets (delivery
      // durability), a dropped/rolled-over connection auto-reconnects with a
      // `Last-Event-ID` header and de-dupes the replayed prefix. With no tags,
      // this is a single plain fetch.
      yield* resumableServerSentEvents(
        fetchClient,
        resolvedUrl,
        {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(requestBody),
          credentials: resolvedOptions.credentials || 'same-origin',
        },
        signal,
      )
    },
    async *joinRun(runId, abortSignal) {
      // Read an in-flight or finished run from the start. `?offset=-1` tells the
      // server's delivery-durability sink to replay from the beginning; `runId`
      // identifies which run. This is a read-only GET — no messages are sent.
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options

      const separator = resolvedUrl.includes('?') ? '&' : '?'
      const joinUrl = `${resolvedUrl}${separator}offset=-1&runId=${encodeURIComponent(
        runId,
      )}`

      const requestHeaders: Record<string, string> = {
        ...mergeHeaders(resolvedOptions.headers),
      }
      const fetchClient = resolvedOptions.fetchClient ?? fetch
      const signal = abortSignal || resolvedOptions.signal

      yield* resumableServerSentEvents(
        fetchClient,
        joinUrl,
        {
          method: 'GET',
          headers: requestHeaders,
          credentials: resolvedOptions.credentials || 'same-origin',
        },
        signal,
      )
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
 *     model: 'gpt-5.5',
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
      const requestBody = buildRunAgentInputBody(
        messages,
        data,
        runContext,
        resolvedOptions,
      )

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
      const reader = getResponseStreamReader(response)

      for await (const line of readStreamLines(reader, abortSignal)) {
        yield JSON.parse(line) as StreamChunk
      }
    },
  }
}

type XhrConnectionOptionsResolver =
  | XhrConnectionOptions
  | (() => XhrConnectionOptions | Promise<XhrConnectionOptions>)

function createDefaultXMLHttpRequest(): XMLHttpRequest {
  if (typeof globalThis.XMLHttpRequest !== 'function') {
    throw new Error('XMLHttpRequest is not available in this runtime')
  }

  return new globalThis.XMLHttpRequest()
}

function cleanupXhr(
  xhr: XMLHttpRequest,
  abortSignal: AbortSignal | undefined,
  onAbort: (() => void) | undefined,
): void {
  xhr.onprogress = null
  xhr.onload = null
  xhr.onerror = null
  xhr.onabort = null
  xhr.onloadend = null

  if (abortSignal && onAbort) {
    abortSignal.removeEventListener('abort', onAbort)
  }
}

function readXhrLines(
  xhr: XMLHttpRequest,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  let offset = 0
  let buffer = ''
  const lines: Array<string> = []
  const waiters: Array<() => void> = []
  let done = false
  let aborted = false
  let error: unknown
  let onAbort: (() => void) | undefined

  const wake = () => {
    const waiter = waiters.shift()
    waiter?.()
  }

  const enqueueDelta = () => {
    if (xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 300)) {
      error = new Error(`XHR error! status: ${xhr.status} ${xhr.statusText}`)
      done = true
      return
    }

    const responseText = xhr.responseText
    if (responseText.length <= offset) {
      return
    }

    buffer += responseText.slice(offset)
    offset = responseText.length
    const splitLines = buffer.split('\n')
    buffer = splitLines.pop() ?? ''

    for (const line of splitLines) {
      const normalized = line.endsWith('\r') ? line.slice(0, -1) : line
      if (normalized.trim()) {
        lines.push(normalized)
      }
    }
  }

  const finish = () => {
    enqueueDelta()
    if (xhr.status < 200 || xhr.status >= 300) {
      error = new Error(`XHR error! status: ${xhr.status} ${xhr.statusText}`)
    } else if (buffer.trim() && !aborted) {
      error = new StreamTruncatedError()
    }
    done = true
    wake()
  }

  xhr.onprogress = () => {
    enqueueDelta()
    wake()
  }
  xhr.onload = finish
  xhr.onerror = () => {
    error = new Error('XHR request failed')
    done = true
    wake()
  }
  xhr.onabort = () => {
    aborted = true
    done = true
    wake()
  }
  xhr.onloadend = () => {
    if (!done) {
      finish()
    }
  }

  if (abortSignal) {
    onAbort = () => {
      aborted = true
      xhr.abort()
    }
    if (abortSignal.aborted) {
      onAbort()
    } else {
      abortSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  return (async function* () {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const line = lines.shift()
        if (line !== undefined) {
          yield line
          continue
        }

        if (error) {
          throw error
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (done || abortSignal?.aborted) {
          return
        }

        await new Promise<void>((resolve) => {
          waiters.push(resolve)
        })
      }
    } finally {
      cleanupXhr(xhr, abortSignal, onAbort)
    }
  })()
}

interface ConfiguredXhrRequest {
  xhr: XMLHttpRequest
  body: string
}

function createConfiguredXhrRequest(
  url: string,
  options: XhrConnectionOptions,
  messages: Array<UIMessage> | Array<ModelMessage>,
  data: Record<string, any> | undefined,
  runContext: RunAgentInputContext | undefined,
): ConfiguredXhrRequest {
  const xhr = options.xhrFactory?.() ?? createDefaultXMLHttpRequest()
  xhr.open('POST', url)
  if (options.withCredentials !== undefined) {
    xhr.withCredentials = options.withCredentials
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...mergeHeaders(options.headers),
  }

  for (const [name, value] of Object.entries(requestHeaders)) {
    xhr.setRequestHeader(name, value)
  }

  const requestBody = buildRunAgentInputBody(
    messages,
    data,
    runContext,
    options,
  )

  return { xhr, body: JSON.stringify(requestBody) }
}

async function resolveXhrConnectionOptions(
  options: XhrConnectionOptionsResolver,
): Promise<XhrConnectionOptions> {
  return typeof options === 'function' ? await options() : options
}

/**
 * Create an XMLHttpRequest-backed Server-Sent Events connection adapter.
 */
export function xhrServerSentEvents(
  url: string | (() => string),
  options: XhrConnectionOptionsResolver = {},
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      const signal = abortSignal || resolvedOptions.signal
      const request = createConfiguredXhrRequest(
        resolvedUrl,
        resolvedOptions,
        messages,
        data,
        runContext,
      )
      const lines = readXhrLines(request.xhr, signal)
      if (signal?.aborted) {
        await lines.next()
        return
      }
      request.xhr.send(request.body)
      let lastThreadId: string | undefined
      let lastRunId: string | undefined
      let lastModel: string | undefined

      for await (const line of lines) {
        if (
          line.startsWith(':') ||
          line.startsWith('event:') ||
          line.startsWith('id:') ||
          line.startsWith('retry:')
        ) {
          continue
        }

        const chunkData = parseSseDataLine(line)
        if (chunkData === '[DONE]') {
          const synthetic: RunFinishedEvent = {
            type: EventType.RUN_FINISHED,
            threadId: lastThreadId ?? runContext?.threadId ?? '',
            runId: lastRunId ?? runContext?.runId ?? '',
            model: lastModel ?? '',
            timestamp: Date.now(),
            finishReason: 'stop',
          }
          request.xhr.abort()
          yield synthetic
          return
        }

        const chunk = JSON.parse(chunkData) as StreamChunk
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
    },
  }
}

/**
 * Create an XMLHttpRequest-backed newline-delimited JSON stream adapter.
 */
export function xhrHttpStream(
  url: string | (() => string),
  options: XhrConnectionOptionsResolver = {},
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      const signal = abortSignal || resolvedOptions.signal
      const request = createConfiguredXhrRequest(
        resolvedUrl,
        resolvedOptions,
        messages,
        data,
        runContext,
      )
      const lines = readXhrLines(request.xhr, signal)
      if (signal?.aborted) {
        await lines.next()
        return
      }
      request.xhr.send(request.body)

      for await (const line of lines) {
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
    runContext?: RunAgentInputContext,
  ) => AsyncIterable<StreamChunk>,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      // Pass messages as-is (UIMessages with parts preserved)
      // Server-side chat() handles conversion to ModelMessages
      yield* streamFactory(messages, data, abortSignal, runContext)
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
          ...(runContext.resume !== undefined && { resume: runContext.resume }),
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
    runContext?: RunAgentInputContext,
  ) => AsyncIterable<StreamChunk>,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      // Pass messages as-is (UIMessages with parts preserved)
      // Server-side chat() handles conversion to ModelMessages
      yield* rpcCall(messages, data, abortSignal, runContext)
    },
  }
}
