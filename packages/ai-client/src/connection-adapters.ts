import { EventType, uiMessagesToWire } from '@tanstack/ai/client'
import {
  createResponseStreamTextDecoder,
  getResponseStreamReader,
} from './response-stream'
import { parseSseDataLine } from './sse-utils'
import type {
  ModelMessage,
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

class StreamReadError extends Error {
  constructor(cause: unknown) {
    super('Stream response body read failed', { cause })
    this.name = 'StreamReadError'
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

/**
 * Thrown when a durable run exceeds its reconnect ceiling. Bounds the
 * otherwise-unbounded reconnect loop so a flapping producer (or a proxy that
 * rolls the socket after every event) surfaces a failure instead of
 * reconnecting without end.
 */
export class StreamReconnectLimitError extends Error {
  constructor(attempts: number) {
    super(
      `Durable run exceeded its reconnect ceiling of ${attempts} attempts — giving up.`,
    )
    this.name = 'StreamReconnectLimitError'
  }
}

/**
 * Reconnect bounding for resumable streams. A constant throttle delay prevents a
 * hot loop against the origin, and the ceiling bounds a pathologically failing
 * run — but only counts CONSECUTIVE reconnects that made no forward progress.
 */
export interface ReconnectOptions {
  /**
   * Ceiling on the number of CONSECUTIVE reconnects that deliver no new events,
   * before failing with {@link StreamReconnectLimitError}. The counter resets to
   * zero whenever a reconnect makes forward progress, so a healthy long run —
   * even one behind a proxy that rolls the socket after every event — never
   * approaches it; the ceiling only fires when the run is genuinely stuck
   * (reconnecting repeatedly without receiving anything new). Default 5.
   */
  maxAttempts?: number
  /** Delay between reconnect attempts, in ms, to avoid hammering. Default 250. */
  delayMs?: number
}

interface ResolvedReconnectOptions {
  maxAttempts: number
  delayMs: number
}

function resolveReconnectOptions(
  options: ReconnectOptions | undefined,
): ResolvedReconnectOptions {
  const maxAttempts = options?.maxAttempts ?? 5
  const delayMs = options?.delayMs ?? 250
  // Reject non-finite / negative bounds up front: a NaN or Infinity maxAttempts
  // would make the ceiling ineffective (unbounded reconnects), and a non-finite
  // delayMs would remove throttling. Fail loudly on misconfiguration.
  if (!Number.isInteger(maxAttempts) || maxAttempts < 0) {
    throw new Error(
      `Invalid reconnect.maxAttempts: ${maxAttempts}. Must be a non-negative integer.`,
    )
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error(
      `Invalid reconnect.delayMs: ${delayMs}. Must be a non-negative finite number.`,
    )
  }
  return { maxAttempts, delayMs }
}

/** Resolve after `ms`, or immediately once `signal` aborts. Never rejects. */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
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

function withSearchParams(url: string, values: Record<string, string>): string {
  const hashIndex = url.indexOf('#')
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex)
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const queryIndex = withoutHash.indexOf('?')
  const base =
    queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex)
  const search = new URLSearchParams(
    queryIndex === -1 ? '' : withoutHash.slice(queryIndex + 1),
  )
  for (const [key, value] of Object.entries(values)) search.set(key, value)
  const query = search.toString()
  return `${base}${query.length === 0 ? '' : `?${query}`}${hash}`
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
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch (error) {
        if (abortSignal?.aborted) return
        throw new StreamReadError(error)
      }
      const { done, value } = result
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || ''

      for (const line of lines) {
        // Strip a trailing CR so a CRLF stream matches the LF path (and the
        // XHR reader). Without this an exact-equality check like the `[DONE]`
        // sentinel in linesToSSEEvents would miss `data: [DONE]\r`.
        const normalized = line.endsWith('\r') ? line.slice(0, -1) : line
        if (normalized.trim()) {
          yield normalized
        }
      }
    }

    // Flush the decoder: a connection cut mid-multibyte-character leaves bytes
    // held inside the streaming TextDecoder. Draining them here (as U+FFFD)
    // makes the trailing-buffer check below see the incomplete tail and report
    // truncation instead of silently swallowing it.
    buffer += decoder.decode()

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

/** A parsed stream chunk paired with its adapter-owned delivery offset (if any). */
interface StreamEvent {
  chunk: StreamChunk
  id?: string
}

/**
 * Type guard for a durable NDJSON envelope `{ id, chunk }`. NDJSON has no
 * native event-id field, so durability rides the offset inside the payload.
 * A bare `StreamChunk` always has a top-level `type`, and the envelope never
 * does, so the two forms are unambiguous — a non-durable line stays bare.
 */
function isNdjsonEnvelope(
  value: unknown,
): value is { id: string; chunk: StreamChunk } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'chunk' in value &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string' &&
    !('type' in value)
  )
}

/**
 * Parse SSE-format lines into stream events, pairing each chunk with the `id:`
 * offset of the event it arrived on. Shared by the fetch- and XHR-backed SSE
 * adapters so both track delivery offsets identically.
 *
 * Accepts either `data: {...}` lines or bare JSON lines. Skips comments
 * starting with `:` (proxies and CDNs inject these as keepalives) and the
 * `event:` / `retry:` SSE control fields. A `[DONE]` sentinel is treated as a
 * terminal event: a synthesized RUN_FINISHED is yielded using the most recent
 * upstream `threadId` / `runId` (falling back to `fallbackIds`), so the
 * consumer sees a clean terminal event with real correlation ids.
 *
 * A JSON parse failure throws — the consumer surfaces it as an error.
 */
async function* linesToSSEEvents(
  lines: AsyncIterable<string>,
  fallbackIds?: { threadId?: string; runId?: string },
): AsyncGenerator<StreamEvent> {
  let lastThreadId: string | undefined
  let lastRunId: string | undefined
  let lastModel: string | undefined
  let pendingId: string | undefined
  for await (const line of lines) {
    if (line === 'id' || line.startsWith('id:')) {
      // SSE spec: strip a single leading space after the colon, preserve the
      // rest verbatim so an opaque adapter offset round-trips exactly (do NOT
      // trim, which would mangle a legitimate offset). An empty value is kept as
      // '' and resets the resume cursor downstream (see resumableStream).
      const rawId = line === 'id' ? '' : line.slice(3)
      pendingId = rawId.startsWith(' ') ? rawId.slice(1) : rawId
      continue
    }
    // Assumes the durability wire emits one `id:` immediately followed by one
    // `data:` per event (both shipped sinks do). `pendingId` attaches to the
    // next data line and is cleared after it; blank-line event boundaries are
    // stripped upstream, so a hand-rolled server that emits an id-only event or
    // a persistent `id:` across events is not supported here.
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
        threadId: lastThreadId ?? fallbackIds?.threadId ?? '',
        runId: lastRunId ?? fallbackIds?.runId ?? '',
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

/**
 * Parse NDJSON-format lines into stream events. Durable streams emit each line
 * as an `{ id, chunk }` envelope carrying the delivery offset; non-durable
 * streams emit bare chunks. Both are auto-detected (see {@link isNdjsonEnvelope}),
 * so an untagged stream behaves exactly as a plain single fetch used to.
 */
async function* linesToNdjsonEvents(
  lines: AsyncIterable<string>,
): AsyncGenerator<StreamEvent> {
  for await (const line of lines) {
    const parsed = JSON.parse(line) as unknown
    if (isNdjsonEnvelope(parsed)) {
      yield { chunk: parsed.chunk, id: parsed.id }
    } else {
      yield { chunk: parsed as StreamChunk }
    }
  }
}

function assertResponseOk(response: Response): void {
  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status} ${response.statusText}`,
    )
  }
}

/** Yield SSE stream events (chunk + offset) from a fetch Response body. */
async function* responseToSSEEvents(
  response: Response,
  abortSignal?: AbortSignal,
  fallbackIds?: { threadId?: string; runId?: string },
): AsyncGenerator<StreamEvent> {
  assertResponseOk(response)
  const reader = getResponseStreamReader(response)
  yield* linesToSSEEvents(readStreamLines(reader, abortSignal), fallbackIds)
}

/** Yield NDJSON stream events (chunk + offset) from a fetch Response body. */
async function* responseToNdjsonEvents(
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  assertResponseOk(response)
  const reader = getResponseStreamReader(response)
  yield* linesToNdjsonEvents(readStreamLines(reader, abortSignal))
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
 * A re-issuable event source. Given extra headers (a `Last-Event-ID` on a
 * reconnect) and an abort signal, it opens the transport and yields stream
 * events. {@link resumableStream} calls it once per attempt, so each call MUST
 * open a fresh underlying request (a new fetch or a new XHR).
 */
type StreamEventSource = (
  extraHeaders: Record<string, string>,
  abortSignal?: AbortSignal,
) => AsyncIterable<StreamEvent>

/**
 * Build a fetch-backed {@link StreamEventSource}. `parseResponse` decodes the
 * body into events (SSE or NDJSON) — the reconnect engine is identical for both.
 */
function fetchEventSource(
  fetchClient: typeof globalThis.fetch,
  url: string,
  requestInit: RequestInit,
  parseResponse: (
    response: Response,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamEvent>,
): StreamEventSource {
  return async function* (extraHeaders, abortSignal) {
    let response: Response
    try {
      response = await fetchClient(url, {
        ...requestInit,
        headers: {
          ...(requestInit.headers as Record<string, string> | undefined),
          ...extraHeaders,
        },
        ...(abortSignal ? { signal: abortSignal } : {}),
      })
    } catch (error) {
      // A fetch REJECTION (device offline, DNS blip, connection refused) is a
      // recoverable transport failure, not a fatal one — surface it as
      // StreamReadError so resumableStream retries from the last offset, mirroring
      // the XHR path (whose onerror wraps the same way). On a genuine abort this
      // wraps the AbortError too, but that's harmless: resumableStream checks
      // `abortSignal.aborted` first and returns, so the wrapped error's type is
      // never inspected. Without an offset (initial connect / non-durable), it
      // still surfaces as a hard failure.
      throw new StreamReadError(error)
    }
    yield* parseResponse(response, abortSignal)
  }
}

/**
 * Drive a {@link StreamEventSource} with native-style resumability. Each event's
 * adapter-owned delivery offset (its `id`) is remembered; if the connection
 * drops or ends before a terminal event, the source is re-opened with a
 * `Last-Event-ID` header so the server replays strictly after the last offset.
 * Already-seen offsets are de-duped, so an overlapping replay is safe.
 *
 * When the server does NOT tag events (no durability), no offset is ever seen,
 * so no reconnect happens — behaviour is identical to a plain single request.
 * This engine is transport-agnostic: fetch/XHR × SSE/NDJSON all share it, the
 * only difference being the {@link StreamEventSource} they pass in.
 */
async function* resumableStream(
  openEventSource: StreamEventSource,
  abortSignal?: AbortSignal,
  reconnectOptions?: ReconnectOptions,
): AsyncGenerator<StreamChunk> {
  // Retains every delivered offset for the run's lifetime. Intentionally bounded
  // by run length (not evicted): a conforming server replays strictly after the
  // acknowledged offset, so this only needs to catch the single boundary event
  // on reconnect, but keeping the full set keeps de-dup correct even if a server
  // replays a wider overlap.
  const seen = new Set<string>()
  let lastEventId: string | undefined
  const reconnect = resolveReconnectOptions(reconnectOptions)
  let reconnectAttempts = 0

  // Throttle before re-issuing the request, and enforce the total ceiling so a
  // producer that keeps dropping after each event is bounded rather than
  // reconnecting forever.
  // Bound only CONSECUTIVE no-progress reconnects. A reconnect that made forward
  // progress resets the counter, so a healthy long run (even one whose socket
  // rolls after every event) never approaches the ceiling; it fires only when
  // the run is genuinely stuck — reconnecting repeatedly with nothing new.
  async function waitBeforeReconnect(madeProgress: boolean): Promise<void> {
    if (madeProgress) {
      reconnectAttempts = 0
    } else {
      reconnectAttempts += 1
      if (reconnectAttempts > reconnect.maxAttempts) {
        throw new StreamReconnectLimitError(reconnect.maxAttempts)
      }
    }
    await abortableDelay(reconnect.delayMs, abortSignal)
  }

  for (;;) {
    if (abortSignal?.aborted) return
    const extraHeaders: Record<string, string> =
      lastEventId !== undefined ? { 'Last-Event-ID': lastEventId } : {}

    let sawTerminal = false
    let progressed = false
    try {
      for await (const { chunk, id } of openEventSource(
        extraHeaders,
        abortSignal,
      )) {
        if (id !== undefined) {
          if (id === '') {
            // SSE spec: an empty `id:` resets the resume cursor. Drop the last
            // offset and clear the de-dupe set; the chunk itself still delivers.
            lastEventId = undefined
            seen.clear()
          } else {
            if (seen.has(id)) continue
            seen.add(id)
            lastEventId = id
          }
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
      // A transport drop is resumable once we hold an offset — retry from it,
      // even if THIS attempt made no new progress. A caught-up run whose parked
      // long-poll socket drops (or a proxy that drops just after replaying the
      // de-duped overlap) is transient, not fatal; the consecutive-no-progress
      // ceiling in waitBeforeReconnect already bounds a genuinely stuck flapper,
      // so a per-attempt progress requirement here would only convert
      // recoverable drops into hard failures on flaky (mobile/edge) networks.
      // Without an offset (a non-durable stream), surface the failure.
      if (
        (error instanceof StreamTruncatedError ||
          error instanceof StreamReadError) &&
        lastEventId !== undefined
      ) {
        await waitBeforeReconnect(progressed)
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
        // offset (backing off to avoid a hot loop against the origin). Progress
        // resets the no-progress ceiling.
        await waitBeforeReconnect(true)
        continue
      }
      // Ended without a terminal event AND made no forward progress on this
      // pass: the run cannot complete. Surface an error rather than returning
      // silently, which would leave the consumer with neither a terminal event
      // nor a failure.
      //
      // Invariant this relies on: a durable transport must never surface an
      // empty long-poll window as a CLEAN end while the producer is still
      // alive. Both shipped backends honor it — memoryStream parks until data
      // or completion, and durableStream keeps one continuous response across
      // windows — so this fires only on a genuinely complete-but-unterminated
      // log. A custom StreamDurability transport that ends a response empty
      // mid-run would trip this; keep the response open until data or terminal.
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
          // Guard synthesis: requireSyntheticId throws when no id is available,
          // and that must not replace the original `err` we are about to
          // rethrow. If we can't synthesize a terminal, the real failure still
          // surfaces below.
          try {
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
          } catch {
            // fall through to rethrow the original error
          }
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
  /** Bounding for resumable-SSE reconnection (throttle delay + attempt ceiling). */
  reconnect?: ReconnectOptions
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
  /** Bounding for resumable reconnection (throttle delay + attempt ceiling). */
  reconnect?: ReconnectOptions
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
      const requestUrl = runContext?.runId
        ? withSearchParams(resolvedUrl, { runId: runContext.runId })
        : resolvedUrl

      // Resumable SSE: if the server tags events with `id:` offsets (delivery
      // durability), a dropped/rolled-over connection auto-reconnects with a
      // `Last-Event-ID` header and de-dupes the replayed prefix. With no tags,
      // this is a single plain fetch.
      yield* resumableStream(
        fetchEventSource(
          fetchClient,
          requestUrl,
          {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
            credentials: resolvedOptions.credentials || 'same-origin',
          },
          // Thread the run's ids so a `[DONE]`-terminating server that doesn't
          // stamp them onto events still yields a correlated terminal (parity
          // with the XHR adapter's xhrSSEParser).
          (response, sseSignal) =>
            responseToSSEEvents(response, sseSignal, {
              ...(runContext?.threadId !== undefined
                ? { threadId: runContext.threadId }
                : {}),
              ...(runContext?.runId !== undefined
                ? { runId: runContext.runId }
                : {}),
            }),
        ),
        signal,
        resolvedOptions.reconnect,
      )
    },
    async *joinRun(runId, abortSignal) {
      // Read an in-flight or finished run from the start. `?offset=-1` tells the
      // server's delivery-durability sink to replay from the beginning; `runId`
      // identifies which run. This is a read-only GET — no messages are sent.
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options

      const joinUrl = withSearchParams(resolvedUrl, {
        offset: '-1',
        runId,
      })

      const requestHeaders: Record<string, string> = {
        ...mergeHeaders(resolvedOptions.headers),
      }
      const fetchClient = resolvedOptions.fetchClient ?? fetch
      const signal = abortSignal || resolvedOptions.signal

      yield* resumableStream(
        fetchEventSource(
          fetchClient,
          joinUrl,
          {
            method: 'GET',
            headers: requestHeaders,
            credentials: resolvedOptions.credentials || 'same-origin',
          },
          // A `[DONE]` during a join correlates to the joined run id.
          (response, sseSignal) =>
            responseToSSEEvents(response, sseSignal, { runId }),
        ),
        signal,
        resolvedOptions.reconnect,
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
      const requestUrl = runContext?.runId
        ? withSearchParams(resolvedUrl, { runId: runContext.runId })
        : resolvedUrl

      // Resumable NDJSON: if the server envelopes each line with an
      // `{ id, chunk }` offset (delivery durability), a dropped/rolled-over
      // connection auto-reconnects with a `Last-Event-ID` header and de-dupes
      // the replayed prefix. With bare lines (no durability), this is a single
      // plain fetch — identical to before.
      yield* resumableStream(
        fetchEventSource(
          fetchClient,
          requestUrl,
          {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
            credentials: resolvedOptions.credentials || 'same-origin',
          },
          responseToNdjsonEvents,
        ),
        signal,
        resolvedOptions.reconnect,
      )
    },
    async *joinRun(runId, abortSignal) {
      // Read an in-flight or finished run from the start. `?offset=-1` tells the
      // server's delivery-durability sink to replay from the beginning; `runId`
      // identifies which run. This is a read-only GET — no messages are sent.
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options

      const joinUrl = withSearchParams(resolvedUrl, { offset: '-1', runId })
      const requestHeaders: Record<string, string> = {
        ...mergeHeaders(resolvedOptions.headers),
      }
      const fetchClient = resolvedOptions.fetchClient ?? fetch
      const signal = abortSignal || resolvedOptions.signal

      yield* resumableStream(
        fetchEventSource(
          fetchClient,
          joinUrl,
          {
            method: 'GET',
            headers: requestHeaders,
            credentials: resolvedOptions.credentials || 'same-origin',
          },
          responseToNdjsonEvents,
        ),
        signal,
        resolvedOptions.reconnect,
      )
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
    // Tolerate a transient status === 0 (matches enqueueDelta): a real non-2xx
    // is an error, but status 0 here is not — treat the trailing buffer as a
    // truncation check instead of fabricating a bogus "status: 0" error.
    if (xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 300)) {
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
    // Surface as StreamReadError so a durable (id-tagged) run whose socket
    // drops mid-stream is eligible for auto-reconnect, matching the fetch path.
    // A non-durable run has no offset, so resumableStream rethrows it as-is.
    error = new StreamReadError(new Error('XHR request failed'))
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
  method: string = 'POST',
  extraHeaders: Record<string, string> = {},
): ConfiguredXhrRequest {
  const xhr = options.xhrFactory?.() ?? createDefaultXMLHttpRequest()
  xhr.open(method, url)
  if (options.withCredentials !== undefined) {
    xhr.withCredentials = options.withCredentials
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...mergeHeaders(options.headers),
    // Reconnect offset (`Last-Event-ID`) wins over static headers.
    ...extraHeaders,
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
 * Build an XHR-backed {@link StreamEventSource}. `parseLines` decodes the raw
 * newline-delimited body into events (SSE or NDJSON); the reconnect engine is
 * shared with the fetch adapters. A fresh XHR is opened per attempt, so a
 * `Last-Event-ID` reconnect header (via `extraHeaders`) is applied at open time.
 */
function xhrEventSource(
  url: string,
  options: XhrConnectionOptions,
  method: string,
  messages: Array<UIMessage> | Array<ModelMessage>,
  data: Record<string, any> | undefined,
  runContext: RunAgentInputContext | undefined,
  parseLines: (lines: AsyncIterable<string>) => AsyncIterable<StreamEvent>,
): StreamEventSource {
  return async function* (extraHeaders, abortSignal) {
    const request = createConfiguredXhrRequest(
      url,
      options,
      messages,
      data,
      runContext,
      method,
      extraHeaders,
    )
    const lines = readXhrLines(request.xhr, abortSignal)
    if (abortSignal?.aborted) {
      await lines.next()
      return
    }
    // A read-only join is a bodyless GET; a run POSTs the RunAgentInput payload.
    request.xhr.send(method === 'GET' ? null : request.body)
    try {
      yield* parseLines(lines)
    } finally {
      // Tear the socket down on an early exit (terminal reached or reconnect
      // break) so late bytes stop downloading. When the abort signal fired,
      // `readXhrLines` already aborted — skip here to avoid a double abort().
      if (!abortSignal?.aborted) request.xhr.abort()
    }
  }
}

/** SSE line parser bound to the run's ids for a `[DONE]` fallback. */
function xhrSSEParser(runContext: RunAgentInputContext | undefined) {
  const fallbackIds: { threadId?: string; runId?: string } = {
    ...(runContext?.threadId !== undefined
      ? { threadId: runContext.threadId }
      : {}),
    ...(runContext?.runId !== undefined ? { runId: runContext.runId } : {}),
  }
  return (lines: AsyncIterable<string>) => linesToSSEEvents(lines, fallbackIds)
}

/**
 * Create an XMLHttpRequest-backed Server-Sent Events connection adapter.
 *
 * Resumable: against a durable (`id:`-tagged) server response, a dropped socket
 * auto-reconnects with `Last-Event-ID` and de-dupes the replayed prefix, and
 * `joinRun` attaches to an existing run from the start. A non-durable response
 * is a single plain request, exactly as before.
 */
export function xhrServerSentEvents(
  url: string | (() => string),
  options: XhrConnectionOptionsResolver = {},
): ResumableConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      const signal = abortSignal || resolvedOptions.signal
      const requestUrl = runContext?.runId
        ? withSearchParams(resolvedUrl, { runId: runContext.runId })
        : resolvedUrl
      yield* resumableStream(
        xhrEventSource(
          requestUrl,
          resolvedOptions,
          'POST',
          messages,
          data,
          runContext,
          xhrSSEParser(runContext),
        ),
        signal,
        resolvedOptions.reconnect,
      )
    },
    async *joinRun(runId, abortSignal) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      const signal = abortSignal || resolvedOptions.signal
      const joinUrl = withSearchParams(resolvedUrl, { offset: '-1', runId })
      yield* resumableStream(
        xhrEventSource(
          joinUrl,
          resolvedOptions,
          'GET',
          [],
          undefined,
          undefined,
          // A `[DONE]` during a join correlates to the joined run id (parity
          // with fetchServerSentEvents.joinRun).
          (lines) => linesToSSEEvents(lines, { runId }),
        ),
        signal,
        resolvedOptions.reconnect,
      )
    },
  }
}

/**
 * Create an XMLHttpRequest-backed newline-delimited JSON stream adapter.
 *
 * Resumable: against a durable (envelope-tagged) server response, a dropped
 * socket auto-reconnects with `Last-Event-ID` and de-dupes the replayed prefix,
 * and `joinRun` attaches to an existing run from the start. A non-durable
 * (bare-line) response is a single plain request, exactly as before.
 */
export function xhrHttpStream(
  url: string | (() => string),
  options: XhrConnectionOptionsResolver = {},
): ResumableConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      const signal = abortSignal || resolvedOptions.signal
      const requestUrl = runContext?.runId
        ? withSearchParams(resolvedUrl, { runId: runContext.runId })
        : resolvedUrl
      yield* resumableStream(
        xhrEventSource(
          requestUrl,
          resolvedOptions,
          'POST',
          messages,
          data,
          runContext,
          linesToNdjsonEvents,
        ),
        signal,
        resolvedOptions.reconnect,
      )
    },
    async *joinRun(runId, abortSignal) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      const signal = abortSignal || resolvedOptions.signal
      const joinUrl = withSearchParams(resolvedUrl, { offset: '-1', runId })
      yield* resumableStream(
        xhrEventSource(
          joinUrl,
          resolvedOptions,
          'GET',
          [],
          undefined,
          undefined,
          linesToNdjsonEvents,
        ),
        signal,
        resolvedOptions.reconnect,
      )
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
