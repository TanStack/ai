import {
  EventType,
  getChunkRunId as getNormalizedChunkRunId,
  restoreInboundChunk,
  tanstackMetadata,
  uiMessagesToWire,
  withTanstackMetadata,
} from '@tanstack/ai/client'
import { ByokMissingError, isByokMissingBody } from '@tanstack/ai/byok'
import {
  createResponseStreamTextDecoder,
  getResponseStreamReader,
} from './response-stream'
import { parseSseDataLine } from './sse-utils'
import type {
  ModelMessage,
  RunAgentResumeItem,
  RunErrorEvent,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai/client'
import type { ChatFetcher, ChatPendingInterrupt } from './types'
import { normalizeMessagesDates } from './message-date-normalizer'

const chunkRunIds = new WeakMap<StreamChunk, string>()

export function getChunkRunId(chunk: StreamChunk): string | undefined {
  const requestRunId = chunkRunIds.get(chunk)
  return requestRunId ?? getNormalizedChunkRunId(chunk)
}

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

export class DurableStreamIncompleteError extends Error {
  constructor() {
    super(
      'Durable run ended without a terminal event and could not resume — the run did not complete.',
    )
    this.name = 'DurableStreamIncompleteError'
  }
}

export class StreamReconnectLimitError extends Error {
  constructor(attempts: number) {
    super(
      `Durable run exceeded its reconnect ceiling of ${attempts} attempts — giving up.`,
    )
    this.name = 'StreamReconnectLimitError'
  }
}

export interface ReconnectOptions {
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
  const isNotMaxAttemptsIsIntegerOrMaxAttemptsCompared =
    !Number.isInteger(maxAttempts) || maxAttempts < 0
  if (isNotMaxAttemptsIsIntegerOrMaxAttemptsCompared) {
    throw new Error(
      `Invalid reconnect.maxAttempts: ${maxAttempts}. Must be a non-negative integer.`,
    )
  }
  const isNotDelayMsIsFiniteOrDelayMsCompared =
    !Number.isFinite(delayMs) || delayMs < 0
  if (isNotDelayMsIsFiniteOrDelayMsCompared) {
    throw new Error(
      `Invalid reconnect.delayMs: ${delayMs}. Must be a non-negative finite number.`,
    )
  }
  return { maxAttempts, delayMs }
}

export interface ReconnectTracker {
  /** The most recently accepted (non-duplicate, non-empty) offset, if any. */
  readonly lastEventId: string | undefined
  note: (id: string | undefined) => 'new' | 'duplicate' | 'reset'
  waitBeforeReconnect: (
    madeProgress: boolean,
    signal?: AbortSignal,
  ) => Promise<void>
}

/** Create a {@link ReconnectTracker} bound to the given reconnect bounds. */
export function createReconnectTracker(
  options?: ReconnectOptions,
): ReconnectTracker {
  const reconnect = resolveReconnectOptions(options)
  const seen = new Set<string>()
  let lastEventId: string | undefined
  let reconnectAttempts = 0
  return {
    get lastEventId() {
      return lastEventId
    },
    note(id) {
      if (id === undefined) return 'new'
      if (id === '') {
        // SSE spec: an empty `id:` resets the resume cursor. Drop the last
        // offset and clear the de-dupe set; the chunk itself still delivers.
        lastEventId = undefined
        seen.clear()
        return 'reset'
      }
      if (seen.has(id)) return 'duplicate'
      seen.add(id)
      lastEventId = id
      return 'new'
    },
    async waitBeforeReconnect(madeProgress, signal) {
      if (madeProgress) {
        reconnectAttempts = 0
      } else {
        reconnectAttempts += 1
        if (reconnectAttempts > reconnect.maxAttempts) {
          throw new StreamReconnectLimitError(reconnect.maxAttempts)
        }
      }
      await abortableDelay(reconnect.delayMs, signal)
    },
  }
}

/** Resolve after `ms`, or immediately once `signal` aborts. Never rejects. */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  const isMsComparedOrAborted = ms <= 0 || signal?.aborted
  if (isMsComparedOrAborted) return Promise.resolve()
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

const RUN_ID_HEADER = 'X-Run-Id'

function runIdHeader(runId: string | undefined): Record<string, string> {
  return runId === undefined ? {} : { [RUN_ID_HEADER]: runId }
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
  const objectEntries = Object.entries(values)
  for (const [key, value] of objectEntries) search.set(key, value)
  const query = search.toString()
  return `${base}${query.length === 0 ? '' : `?${query}`}${hash}`
}

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
        const normalized = line.endsWith('\r') ? line.slice(0, -1) : line
        if (normalized.trim()) {
          yield normalized
        }
      }
    }

    buffer += decoder.decode()

    const isTrimAndNotAborted = buffer.trim() && !abortSignal?.aborted
    if (isTrimAndNotAborted) {
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

/** Rebuild pre-wire extras after SSE/NDJSON ingest. */
function restoreInboundUsage(chunk: StreamChunk): StreamChunk {
  return restoreInboundChunk(chunk)
}

function sseChunkModel(chunk: StreamChunk): string | undefined {
  const tanstackModel = tanstackMetadata(chunk)?.model
  if (typeof tanstackModel === 'string') return tanstackModel
  const usage = 'usage' in chunk ? chunk.usage : undefined
  if (Array.isArray(usage)) {
    const model = (usage[0] as { model?: unknown } | undefined)?.model
    if (typeof model === 'string') return model
  }
  return undefined
}

interface SseEventParseState {
  lastThreadId?: string
  lastRunId?: string
  lastModel?: string
  pendingId?: string
}

function readSseIdLine(line: string): string | false {
  const isLineIsNotIdAndNotLineStartsWithId =
    line !== 'id' && !line.startsWith('id:')
  if (isLineIsNotIdAndNotLineStartsWithId) return false
  const rawId = line === 'id' ? '' : line.slice(3)
  return rawId.startsWith(' ') ? rawId.slice(1) : rawId
}

function isSseControlLine(line: string): boolean {
  return (
    line.startsWith(':') ||
    line.startsWith('event:') ||
    line.startsWith('retry:')
  )
}

function createDoneStreamChunk(
  state: SseEventParseState,
  fallbackIds?: { threadId?: string; runId?: string },
): StreamChunk {
  return withTanstackMetadata(
    {
      type: EventType.RUN_FINISHED,
      threadId: state.lastThreadId ?? fallbackIds?.threadId ?? '',
      runId: state.lastRunId ?? fallbackIds?.runId ?? '',
      timestamp: Date.now(),
    },
    {
      finishReason: 'stop',
      ...(state.lastModel !== undefined ? { model: state.lastModel } : {}),
    },
  ) as StreamChunk
}

function recordSseChunkIds(
  chunk: StreamChunk,
  state: SseEventParseState,
): void {
  const isChunkHasThreadIdAndTypeofThreadIdIsString =
    'threadId' in chunk && typeof chunk.threadId === 'string'
  if (isChunkHasThreadIdAndTypeofThreadIdIsString) {
    state.lastThreadId = chunk.threadId
  }
  const isChunkHasRunIdAndTypeofRunIdIsString =
    'runId' in chunk && typeof chunk.runId === 'string'
  if (isChunkHasRunIdAndTypeofRunIdIsString) {
    state.lastRunId = chunk.runId
  }
  const model = sseChunkModel(chunk)
  if (model !== undefined) state.lastModel = model
}

async function* linesToSSEEvents(
  lines: AsyncIterable<string>,
  fallbackIds?: { threadId?: string; runId?: string },
): AsyncGenerator<StreamEvent> {
  const state: SseEventParseState = {}
  for await (const line of lines) {
    const idValue = readSseIdLine(line)
    if (idValue !== false) {
      state.pendingId = idValue
      continue
    }
    if (isSseControlLine(line)) {
      continue
    }
    const data = parseSseDataLine(line)
    if (data === '[DONE]') {
      yield { chunk: createDoneStreamChunk(state, fallbackIds) }
      return
    }
    const chunk = restoreInboundUsage(JSON.parse(data) as StreamChunk)
    recordSseChunkIds(chunk, state)
    const id = state.pendingId
    state.pendingId = undefined
    yield { chunk, ...(id !== undefined ? { id } : {}) }
  }
}

async function* linesToNdjsonEvents(
  lines: AsyncIterable<string>,
): AsyncGenerator<StreamEvent> {
  for await (const line of lines) {
    const parsed = JSON.parse(line) as unknown
    if (isNdjsonEnvelope(parsed)) {
      yield { chunk: restoreInboundUsage(parsed.chunk), id: parsed.id }
    } else {
      yield { chunk: restoreInboundUsage(parsed as StreamChunk) }
    }
  }
}

async function assertResponseOk(response: Response): Promise<void> {
  if (response.ok) return
  if (response.status === 401) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => null)
    if (isByokMissingBody(body)) {
      throw new ByokMissingError(body.error.provider)
    }
  }
  throw new Error(
    `HTTP error! status: ${response.status} ${response.statusText}`,
  )
}

function errorFromXhrStatus(xhr: XMLHttpRequest): Error {
  if (xhr.status === 401) {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(xhr.responseText)
    } catch {
      parsed = null
    }
    if (isByokMissingBody(parsed)) {
      return new ByokMissingError(parsed.error.provider)
    }
  }
  return new Error(`XHR error! status: ${xhr.status} ${xhr.statusText}`)
}

async function fetchThreadHydration(
  fetchClient: typeof globalThis.fetch,
  url: string,
  headers: Record<string, string>,
  credentials: RequestCredentials,
  threadId: string,
): Promise<ChatHydrationResult> {
  const response = await fetchClient(withSearchParams(url, { threadId }), {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
    credentials,
  })
  await assertResponseOk(response)
  const data = (await response.json()) as {
    messages?: Array<UIMessage>
    activeRun?: { runId?: unknown } | null
    interrupts?: {
      runId?: unknown
      pending?: unknown
    } | null
  }
  const activeRun =
    data.activeRun && typeof data.activeRun.runId === 'string'
      ? { runId: data.activeRun.runId }
      : null
  const interrupts =
    data.interrupts &&
    typeof data.interrupts.runId === 'string' &&
    Array.isArray(data.interrupts.pending) &&
    data.interrupts.pending.length > 0
      ? {
          runId: data.interrupts.runId,
          pending: data.interrupts.pending as Array<ChatPendingInterrupt>,
        }
      : null
  return {
    messages: Array.isArray(data.messages)
      ? normalizeMessagesDates(data.messages)
      : [],
    activeRun,
    interrupts,
  }
}

async function fetchGenerationHydration(
  fetchClient: typeof globalThis.fetch,
  url: string,
  headers: Record<string, string>,
  credentials: RequestCredentials,
  threadId: string,
): Promise<GenerationHydrationResult> {
  const response = await fetchClient(withSearchParams(url, { threadId }), {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
    credentials,
  })
  await assertResponseOk(response)
  const raw: unknown = await response.json()
  // A 200 carrying `null` is a legitimate hydration miss — the server has no
  // record for this thread — and reading `.activeRun` off `null` would throw.
  if (raw === null) {
    return { resumeSnapshot: null, activeRun: null }
  }
  const isTypeofRawIsNotObjectOrRawIsArray =
    typeof raw !== 'object' || Array.isArray(raw)
  if (isTypeofRawIsNotObjectOrRawIsArray) {
    throw new Error(
      `Generation hydration expected a JSON object from ${url}, received ${Array.isArray(raw) ? 'an array' : typeof raw}.`,
    )
  }
  const data = raw as {
    resumeSnapshot?: GenerationHydrationResult['resumeSnapshot']
    activeRun?: { runId?: unknown } | null
  }
  const activeRun =
    data.activeRun && typeof data.activeRun.runId === 'string'
      ? { runId: data.activeRun.runId }
      : null
  return {
    resumeSnapshot: data.resumeSnapshot ?? null,
    activeRun,
  }
}

/** Yield SSE stream events (chunk + offset) from a fetch Response body. */
async function* responseToSSEEvents(
  response: Response,
  abortSignal?: AbortSignal,
  fallbackIds?: { threadId?: string; runId?: string },
): AsyncGenerator<StreamEvent> {
  await assertResponseOk(response)
  const reader = getResponseStreamReader(response)
  yield* linesToSSEEvents(readStreamLines(reader, abortSignal), fallbackIds)
}

/** Yield NDJSON stream events (chunk + offset) from a fetch Response body. */
async function* responseToNdjsonEvents(
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  await assertResponseOk(response)
  const reader = getResponseStreamReader(response)
  yield* linesToNdjsonEvents(readStreamLines(reader, abortSignal))
}

async function* responseToSSEChunks(
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const sseEvents = responseToSSEEvents(response, abortSignal)
  for await (const { chunk } of sseEvents) {
    yield chunk
  }
}

type StreamEventSource = (
  extraHeaders: Record<string, string>,
  abortSignal?: AbortSignal,
) => AsyncIterable<StreamEvent>

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
      throw new StreamReadError(error)
    }
    yield* parseResponse(response, abortSignal)
  }
}

async function* resumableStream(
  openEventSource: StreamEventSource,
  abortSignal?: AbortSignal,
  reconnectOptions?: ReconnectOptions,
): AsyncGenerator<StreamChunk> {
  const tracker = createReconnectTracker(reconnectOptions)

  for (;;) {
    if (abortSignal?.aborted) return
    const extraHeaders: Record<string, string> =
      tracker.lastEventId !== undefined
        ? { 'Last-Event-ID': tracker.lastEventId }
        : {}

    let sawTerminal = false
    let progressed = false
    try {
      const sourceEvents = openEventSource(extraHeaders, abortSignal)
      for await (const { chunk, id } of sourceEvents) {
        if (tracker.note(id) === 'duplicate') continue
        progressed = true
        const isTypeIsRUNFINISHEDOrTypeIsRUNERROR =
          chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
        if (isTypeIsRUNFINISHEDOrTypeIsRUNERROR) {
          sawTerminal = true
        }
        yield chunk
      }
    } catch (error) {
      if (abortSignal?.aborted) return
      const isErrorIsStreamTruncatedErrorOrErrorIsStreamReadError =
        (error instanceof StreamTruncatedError ||
          error instanceof StreamReadError) &&
        tracker.lastEventId !== undefined
      if (isErrorIsStreamTruncatedErrorOrErrorIsStreamReadError) {
        await tracker.waitBeforeReconnect(progressed, abortSignal)
        continue
      }
      throw error
    }

    if (abortSignal?.aborted) return

    if (sawTerminal) return

    if (tracker.lastEventId !== undefined) {
      // A durable (id-tagged) run.
      if (progressed) {
        await tracker.waitBeforeReconnect(true, abortSignal)
        continue
      }
      throw new DurableStreamIncompleteError()
    }

    // A non-durable (untagged) stream that ended cleanly. Legitimate — the
    // upper layer synthesizes a terminal event. Stop.
    return
  }
}

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
  /** Extra request headers for this run (e.g. BYOK keys). POST only. */
  headers?: Record<string, string>
}

export interface ConnectConnectionAdapter {
  connect: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ) => AsyncIterable<StreamChunk>
  hydrateGeneration?: (threadId: string) => Promise<GenerationHydrationResult>
  joinRun?: (
    runId: string,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>
  hydrate?: (threadId: string) => Promise<ChatHydrationResult>
}

export interface GenerationHydrationResult {
  resumeSnapshot: {
    schemaVersion?: 1
    resumeState: { threadId: string; runId: string } | null
    status: 'idle' | 'running' | 'complete' | 'error'
    result?: unknown
    error?: { message: string; code?: string }
    activity?: string
  } | null
  activeRun: { runId: string } | null
}

export interface ChatHydrationResult {
  messages: Array<UIMessage>
  activeRun: { runId: string } | null
  interrupts: {
    runId: string
    pending: Array<ChatPendingInterrupt>
  } | null
}

export interface ResumableConnectConnectionAdapter extends ConnectConnectionAdapter {
  joinRun: (
    runId: string,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>
  hydrate?: (threadId: string) => Promise<ChatHydrationResult>
}

export interface SubscribeConnectionAdapter {
  subscribe: (abortSignal?: AbortSignal) => AsyncIterable<StreamChunk>
  send: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ) => Promise<void>
  joinRun?: (
    runId: string,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>
  hydrate?: (threadId: string) => Promise<ChatHydrationResult>
}

export type ConnectionAdapter =
  | ConnectConnectionAdapter
  | SubscribeConnectionAdapter

interface ConnectSendState {
  hasTerminalEvent: boolean
  upstreamThreadId?: string
  upstreamRunId?: string
}

function noteConnectChunk(chunk: StreamChunk, state: ConnectSendState): void {
  const isChunkHasThreadIdAndTypeofThreadIdIsString =
    'threadId' in chunk && typeof chunk.threadId === 'string'
  if (isChunkHasThreadIdAndTypeofThreadIdIsString) {
    state.upstreamThreadId = chunk.threadId
  }
  const isChunkHasRunIdAndTypeofRunIdIsString =
    'runId' in chunk && typeof chunk.runId === 'string'
  if (isChunkHasRunIdAndTypeofRunIdIsString) {
    state.upstreamRunId = chunk.runId
  }
  const isTypeIsRUNFINISHEDOrTypeIsRUNERROR =
    chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
  if (isTypeIsRUNFINISHEDOrTypeIsRUNERROR) {
    state.hasTerminalEvent = true
  }
}

function pushSyntheticRunFinished(
  state: ConnectSendState,
  abortSignal: AbortSignal | undefined,
  runContext: RunAgentInputContext | undefined,
  push: (chunk: StreamChunk, runId?: string) => void,
): void {
  const isAbortedOrHasTerminalEvent =
    abortSignal?.aborted || state.hasTerminalEvent
  if (isAbortedOrHasTerminalEvent) return
  push(
    withTanstackMetadata(
      {
        type: EventType.RUN_FINISHED,
        threadId: requireSyntheticId(
          state.upstreamThreadId ?? runContext?.threadId,
          'threadId',
        ),
        runId: requireSyntheticId(
          state.upstreamRunId ?? runContext?.runId,
          'runId',
        ),
        timestamp: Date.now(),
      },
      { finishReason: 'stop', model: 'connect-wrapper' },
    ) as StreamChunk,
    runContext?.runId,
  )
}

function pushSyntheticRunError(
  state: ConnectSendState,
  abortSignal: AbortSignal | undefined,
  runContext: RunAgentInputContext | undefined,
  err: unknown,
  push: (chunk: StreamChunk, runId?: string) => void,
): void {
  const isAbortedOrHasTerminalEvent =
    abortSignal?.aborted || state.hasTerminalEvent
  if (isAbortedOrHasTerminalEvent) return
  try {
    const message =
      err instanceof Error ? err.message : 'Unknown error in connect()'
    const synthetic: RunErrorEvent = {
      type: EventType.RUN_ERROR,
      threadId: requireSyntheticId(
        state.upstreamThreadId ?? runContext?.threadId,
        'threadId',
      ),
      runId: requireSyntheticId(
        state.upstreamRunId ?? runContext?.runId,
        'runId',
      ),
      timestamp: Date.now(),
      message,
    }
    push(synthetic, runContext?.runId)
  } catch {
    // fall through to rethrow the original error
  }
}

export function normalizeConnectionAdapter(
  connection: ConnectionAdapter | undefined,
): SubscribeConnectionAdapter {
  if (!connection) {
    throw new Error('Connection adapter is required')
  }

  const hasConnect = 'connect' in connection
  const hasSubscribe = 'subscribe' in connection
  const hasSend = 'send' in connection

  const hasConnectAndHasSubscribeOrHasSend =
    hasConnect && (hasSubscribe || hasSend)
  if (hasConnectAndHasSubscribeOrHasSend) {
    throw new Error(
      'Connection adapter must provide either connect or both subscribe and send, not both modes',
    )
  }

  const hasSubscribeAndHasSend = hasSubscribe && hasSend
  if (hasSubscribeAndHasSend) {
    const joinRun = (connection as SubscribeConnectionAdapter).joinRun?.bind(
      connection,
    )
    const hydrate = (connection as SubscribeConnectionAdapter).hydrate?.bind(
      connection,
    )
    return {
      subscribe: connection.subscribe.bind(connection),
      send: connection.send.bind(connection),
      ...(joinRun ? { joinRun } : {}),
      ...(hydrate ? { hydrate } : {}),
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

  async function waitUntilSubscriberIdle(
    abortSignal?: AbortSignal,
  ): Promise<void> {
    // Idle means the subscriber is waiting for the next chunk, so the
    // previous chunk has left processIncomingChunk. Empty waiters with an
    // empty buffer is in-flight delivery, not idle.
    const idle = () =>
      activeBuffer.length === 0 &&
      (activeWaiters.length > 0 || abortSignal?.aborted)
    for (let i = 0; i < 16 && !abortSignal?.aborted; i++) {
      if (idle()) return
      await Promise.resolve()
    }
    let macrotaskWaits = 0
    while (!abortSignal?.aborted) {
      if (idle()) return
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      macrotaskWaits++
      if (activeWaiters.length === 0 && macrotaskWaits >= 32) return
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
      const state: ConnectSendState = { hasTerminalEvent: false }
      try {
        const stream = connection.connect(
          messages,
          data,
          abortSignal,
          runContext,
        )
        for await (const chunk of stream) {
          noteConnectChunk(chunk, state)
          push(chunk, runContext?.runId)
        }

        pushSyntheticRunFinished(state, abortSignal, runContext, push)
      } catch (err) {
        pushSyntheticRunError(state, abortSignal, runContext, err, push)
        throw err
      }
      await waitUntilSubscriberIdle(abortSignal)
    },
    ...(typeof (connection as ResumableConnectConnectionAdapter).joinRun ===
    'function'
      ? {
          joinRun: (runId: string, abortSignal?: AbortSignal) =>
            (connection as ResumableConnectConnectionAdapter).joinRun(
              runId,
              abortSignal,
            ),
        }
      : {}),
    ...(() => {
      // Capture under the typeof guard so `hydrate` narrows to the function type
      // (no non-null assertion). Present only when the connection supports it.
      const hydrate = (connection as ResumableConnectConnectionAdapter).hydrate
      return typeof hydrate === 'function'
        ? { hydrate: (threadId: string) => hydrate(threadId) }
        : {}
    })(),
  }
}

export interface FetchConnectionOptions {
  headers?: Record<string, string> | Headers
  credentials?: RequestCredentials
  signal?: AbortSignal
  body?: Record<string, any>
  fetchClient?: typeof globalThis.fetch
  /** Bounding for resumable-SSE reconnection (throttle delay + attempt ceiling). */
  reconnect?: ReconnectOptions
}

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
  const wireMessages = uiMessagesToWire(messages)
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
        ...mergeHeaders(runContext?.headers),
        ...runIdHeader(runContext?.runId),
      }

      const requestBody = buildRunAgentInputBody(
        messages,
        data,
        runContext,
        resolvedOptions,
      )

      const fetchClient = resolvedOptions.fetchClient ?? fetch
      const signal = abortSignal || resolvedOptions.signal
      const requestUrl = resolvedUrl

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
    async hydrate(threadId) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options
      return fetchThreadHydration(
        resolvedOptions.fetchClient ?? fetch,
        resolvedUrl,
        mergeHeaders(resolvedOptions.headers),
        resolvedOptions.credentials || 'same-origin',
        threadId,
      )
    },
    async hydrateGeneration(threadId) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options
      return fetchGenerationHydration(
        resolvedOptions.fetchClient ?? fetch,
        resolvedUrl,
        mergeHeaders(resolvedOptions.headers),
        resolvedOptions.credentials || 'same-origin',
        threadId,
      )
    },
  }
}

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
        ...mergeHeaders(runContext?.headers),
        ...runIdHeader(runContext?.runId),
      }

      const requestBody = buildRunAgentInputBody(
        messages,
        data,
        runContext,
        resolvedOptions,
      )

      const fetchClient = resolvedOptions.fetchClient ?? fetch
      const signal = abortSignal || resolvedOptions.signal
      const requestUrl = resolvedUrl

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
    async hydrate(threadId) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options
      return fetchThreadHydration(
        resolvedOptions.fetchClient ?? fetch,
        resolvedUrl,
        mergeHeaders(resolvedOptions.headers),
        resolvedOptions.credentials || 'same-origin',
        threadId,
      )
    },
    async hydrateGeneration(threadId) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions =
        typeof options === 'function' ? await options() : options
      return fetchGenerationHydration(
        resolvedOptions.fetchClient ?? fetch,
        resolvedUrl,
        mergeHeaders(resolvedOptions.headers),
        resolvedOptions.credentials || 'same-origin',
        threadId,
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

  const isAbortSignalAndOnAbort = abortSignal && onAbort
  if (isAbortSignalAndOnAbort) {
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
    const isStatusIsNot0AndStatusComparedOrStatusCompared =
      xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 300)
    if (isStatusIsNot0AndStatusComparedOrStatusCompared) {
      error = errorFromXhrStatus(xhr)
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
    const isStatusIsNot0AndStatusComparedOrStatusCompared =
      xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 300)
    if (isStatusIsNot0AndStatusComparedOrStatusCompared) {
      error = errorFromXhrStatus(xhr)
    } else {
      const isTrimAndNotAborted = buffer.trim() && !aborted
      if (isTrimAndNotAborted) {
        error = new StreamTruncatedError()
      }
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
        const isDoneOrAborted = done || abortSignal?.aborted
        if (isDoneOrAborted) {
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
    ...mergeHeaders(method === 'POST' ? runContext?.headers : undefined),
    // Client-chosen run id for durability (POST only; the GET join carries it
    // in the query instead).
    ...(method === 'POST' ? runIdHeader(runContext?.runId) : {}),
    // Reconnect offset (`Last-Event-ID`) wins over static headers.
    ...extraHeaders,
  }

  const objectEntries = Object.entries(requestHeaders)
  for (const [name, value] of objectEntries) {
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

export function xhrServerSentEvents(
  url: string | (() => string),
  options: XhrConnectionOptionsResolver = {},
): ResumableConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      const signal = abortSignal || resolvedOptions.signal
      const requestUrl = resolvedUrl
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
    async hydrate(threadId) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      // Hydration is a non-streaming JSON GET, so fetch is fine even for the
      // XHR-backed streaming adapter.
      return fetchThreadHydration(
        fetch,
        resolvedUrl,
        mergeHeaders(resolvedOptions.headers),
        resolvedOptions.withCredentials ? 'include' : 'same-origin',
        threadId,
      )
    },
    async hydrateGeneration(threadId) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      // Hydration is a non-streaming JSON GET, so fetch is fine even for the
      // XHR-backed streaming adapter.
      return fetchGenerationHydration(
        fetch,
        resolvedUrl,
        mergeHeaders(resolvedOptions.headers),
        resolvedOptions.withCredentials ? 'include' : 'same-origin',
        threadId,
      )
    },
  }
}

export function xhrHttpStream(
  url: string | (() => string),
  options: XhrConnectionOptionsResolver = {},
): ResumableConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      const signal = abortSignal || resolvedOptions.signal
      const requestUrl = resolvedUrl
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
    async hydrate(threadId) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      // Hydration is a non-streaming JSON GET, so fetch is fine even for the
      // XHR-backed streaming adapter.
      return fetchThreadHydration(
        fetch,
        resolvedUrl,
        mergeHeaders(resolvedOptions.headers),
        resolvedOptions.withCredentials ? 'include' : 'same-origin',
        threadId,
      )
    },
    async hydrateGeneration(threadId) {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const resolvedOptions = await resolveXhrConnectionOptions(options)
      // Hydration is a non-streaming JSON GET, so fetch is fine even for the
      // XHR-backed streaming adapter.
      return fetchGenerationHydration(
        fetch,
        resolvedUrl,
        mergeHeaders(resolvedOptions.headers),
        resolvedOptions.withCredentials ? 'include' : 'same-origin',
        threadId,
      )
    },
  }
}

export interface WebSocketConnectionOptions {
  protocols?: string | Array<string>
  body?: Record<string, unknown>
  reconnect?: ReconnectOptions
  /** Override the WebSocket implementation (tests / non-browser runtimes). */
  WebSocketImpl?: typeof WebSocket
}

function runIdQuery(url: string, runId: string | undefined): string {
  return runId ? withSearchParams(url, { runId }) : url
}

function isPingFrame(parsed: unknown): boolean {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { type?: unknown }).type === 'ping'
  )
}

/** A subscribe() consumer's registration: receives chunks or a fatal error. */
interface WebSocketChunkSink {
  push: (chunk: StreamChunk) => void
  fail: (error: unknown) => void
}

function createChunkPipe(
  abortSignal: AbortSignal | undefined,
  onFinally: () => void,
): {
  push: (chunk: StreamChunk) => void
  fail: (error: unknown) => void
  end: () => void
  iterable: AsyncIterable<StreamChunk>
} {
  const queue: Array<StreamChunk> = []
  const waiters: Array<(c: StreamChunk | null) => void> = []
  let failure: unknown
  let ended = false
  const wake = () => waiters.shift()?.(null)
  const push = (chunk: StreamChunk) => {
    const w = waiters.shift()
    if (w) w(chunk)
    else queue.push(chunk)
  }
  const fail = (error: unknown) => {
    failure = error
    wake()
  }
  const end = () => {
    ended = true
    wake()
  }
  const onAbort = () => wake()
  abortSignal?.addEventListener('abort', onAbort)
  const iterable = (async function* () {
    try {
      while (!abortSignal?.aborted) {
        const buffered = queue.shift()
        if (buffered !== undefined) {
          yield buffered
          continue
        }
        if (failure !== undefined) throw failure
        if (ended) return
        const chunk = await new Promise<StreamChunk | null>((r) =>
          waiters.push(r),
        )
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (failure !== undefined) throw failure
        if (chunk === null) return
        yield chunk
      }
    } finally {
      abortSignal?.removeEventListener('abort', onAbort)
      onFinally()
    }
  })()
  return { push, fail, end, iterable }
}

interface WebSocketRunSession {
  runId: string | undefined
  readonly tracker: ReconnectTracker
  sawTerminal: boolean
  /** Made forward progress (a new, non-duplicate chunk) since the last (re)connect. */
  progressed: boolean
  signal: AbortSignal | undefined
}

export function webSocket(
  url: string | (() => string),
  options: WebSocketConnectionOptions = {},
): SubscribeConnectionAdapter & {
  joinRun: (
    runId: string,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>
} {
  const Impl = options.WebSocketImpl ?? WebSocket
  let socket: WebSocket | undefined
  let socketMode: 'run' | 'resume' | undefined
  let openPromise: Promise<void> | undefined
  const listeners = new Set<WebSocketChunkSink>()
  let currentSession: WebSocketRunSession | undefined

  function failAll(error: unknown): void {
    for (const l of listeners) l.fail(error)
  }

  function openOnce(target: string, mode: 'run' | 'resume'): WebSocket {
    const isSocketAndReadyStateComparedAndModeIsRunAndSocketModeIsRun =
      socket && socket.readyState <= 1 && mode === 'run' && socketMode === 'run'
    if (isSocketAndReadyStateComparedAndModeIsRunAndSocketModeIsRun) {
      return socket
    }
    const prior = socket
    const ws = options.protocols
      ? new Impl(target, options.protocols)
      : new Impl(target)
    socket = ws
    socketMode = mode
    openPromise = new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = (e) => reject(new StreamReadError(e))
    })
    // Attach a no-op handler so a socket nobody awaits can't raise an
    // unhandled rejection if it errors. Awaiters of openPromise still see the rejection.
    openPromise.catch(() => {})
    ws.onmessage = (event: MessageEvent) => {
      // A retired socket (a newer connection took over below) must not keep
      // feeding the shared listeners.
      if (ws !== socket) return
      let parsed: unknown
      try {
        parsed = JSON.parse(String(event.data))
      } catch (error) {
        failAll(new StreamReadError(error))
        return
      }
      if (isPingFrame(parsed)) return
      const envelopeId = isNdjsonEnvelope(parsed) ? parsed.id : undefined
      const chunk = restoreInboundUsage(
        isNdjsonEnvelope(parsed) ? parsed.chunk : (parsed as StreamChunk),
      )

      const session = currentSession
      if (session) {
        if (session.tracker.note(envelopeId) === 'duplicate') return
        session.progressed = true
        if (session.runId === undefined) {
          session.runId = getChunkRunId(chunk)
        }
        const isTypeIsRUNFINISHEDOrTypeIsRUNERROR =
          chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
        if (isTypeIsRUNFINISHEDOrTypeIsRUNERROR) {
          session.sawTerminal = true
        }
      }
      for (const l of listeners) l.push(chunk)
    }
    ws.onclose = () => {
      // Retired deliberately in favor of a newer connection — not a drop.
      if (ws !== socket) return
      const session = currentSession
      if (!session) {
        // No run session (never established, or cleared by a prior failure).
        // Surface the drop so subscribers do not stay parked on a dead socket.
        failAll(new StreamReadError(new Error('WebSocket connection closed')))
        return
      }
      const isAbortedOrSawTerminal =
        session.signal?.aborted || session.sawTerminal
      if (isAbortedOrSawTerminal) return
      const lastEventId = session.tracker.lastEventId
      if (lastEventId === undefined) {
        currentSession = undefined
        failAll(new StreamReadError(new Error('WebSocket connection closed')))
        return
      }
      void reconnect(session, lastEventId)
    }
    const isPriorAndReadyStateCompared = prior && prior.readyState <= 1
    if (isPriorAndReadyStateCompared) prior.close()
    return ws
  }

  async function reconnect(
    session: WebSocketRunSession,
    offset: string,
  ): Promise<void> {
    try {
      // Bounded by the shared tracker's consecutive-no-progress ceiling —
      // mirrors resumableStream so a flapping server can't reconnect forever.
      await session.tracker.waitBeforeReconnect(
        session.progressed,
        session.signal,
      )
    } catch (error) {
      if (currentSession === session) currentSession = undefined
      failAll(error)
      return
    }
    if (session.signal?.aborted) return
    if (currentSession !== session) return
    const isSocketAndReadyStateCompared = socket && socket.readyState <= 1
    if (isSocketAndReadyStateCompared) return
    session.progressed = false
    const base = typeof url === 'function' ? url() : url
    const target = withSearchParams(base, {
      ...(session.runId !== undefined ? { runId: session.runId } : {}),
      offset,
    })
    openOnce(target, 'resume')
  }

  function waitOpen(ws: WebSocket): Promise<void> {
    if (ws.readyState === 1) return Promise.resolve()
    return openPromise ?? Promise.resolve()
  }

  return {
    subscribe(abortSignal?: AbortSignal): AsyncIterable<StreamChunk> {
      const pipe = createChunkPipe(abortSignal, () => listeners.delete(sink))
      const sink: WebSocketChunkSink = { push: pipe.push, fail: pipe.fail }
      listeners.add(sink)
      return pipe.iterable
    },
    async send(messages, data, abortSignal, runContext) {
      const target = typeof url === 'function' ? url() : url
      const ws = openOnce(runIdQuery(target, runContext?.runId), 'run')
      await waitOpen(ws)
      const isNotCurrentSessionOrRunIdIsNotRunId =
        !currentSession || currentSession.runId !== runContext?.runId
      if (isNotCurrentSessionOrRunIdIsNotRunId) {
        currentSession = {
          runId: runContext?.runId,
          tracker: createReconnectTracker(options.reconnect),
          sawTerminal: false,
          progressed: false,
          signal: abortSignal,
        }
      } else {
        currentSession.signal = abortSignal
        currentSession.sawTerminal = false
        currentSession.progressed = false
      }
      const session = currentSession
      abortSignal?.addEventListener(
        'abort',
        () => {
          const abortRunId = session.runId
          const live = socket
          const isAbortRunIdIsUndefinedOrSawTerminalOrSocketModeIsNotRun =
            abortRunId === undefined ||
            session.sawTerminal ||
            socketMode !== 'run' ||
            live === undefined ||
            live.readyState !== 1
          if (isAbortRunIdIsUndefinedOrSawTerminalOrSocketModeIsNotRun) {
            return
          }
          try {
            live.send(JSON.stringify({ type: 'abort', runId: abortRunId }))
          } catch {
            // Socket is CLOSING/CLOSED — the server aborts the turn on close.
          }
        },
        { once: true },
      )
      const body = buildRunAgentInputBody(messages, data, runContext, {
        body: options.body,
      })
      ws.send(JSON.stringify(body))
    },
    joinRun(runId, abortSignal): AsyncIterable<StreamChunk> {
      const target = withSearchParams(typeof url === 'function' ? url() : url, {
        offset: '-1',
        runId,
      })
      const ws = options.protocols
        ? new Impl(target, options.protocols)
        : new Impl(target)
      const pipe = createChunkPipe(abortSignal, () => {
        if (ws.readyState <= 1) ws.close()
      })
      ws.onmessage = (event: MessageEvent) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(String(event.data))
        } catch (error) {
          pipe.fail(new StreamReadError(error))
          return
        }
        if (isPingFrame(parsed)) return
        pipe.push(
          restoreInboundUsage(
            isNdjsonEnvelope(parsed) ? parsed.chunk : (parsed as StreamChunk),
          ),
        )
      }
      ws.onclose = (event?: CloseEvent) => {
        if (event?.code === 1000) {
          pipe.end()
          return
        }
        const detail = event
          ? `${event.code}${event.reason ? `: ${event.reason}` : ''}`
          : 'unknown'
        pipe.fail(
          new StreamReadError(
            new Error(`WebSocket connection closed (${detail})`),
          ),
        )
      }
      return pipe.iterable
    },
  }
}

export interface StreamConnectionHandlers {
  hydrate?: (threadId: string) => Promise<ChatHydrationResult>
  hydrateGeneration?: (threadId: string) => Promise<GenerationHydrationResult>
  joinRun?: (
    runId: string,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>
}

export function stream(
  streamFactory: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>,
  handlers?: StreamConnectionHandlers,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      // Pass messages as-is (UIMessages with parts preserved)
      // Server-side chat() handles conversion to ModelMessages
      yield* streamFactory(messages, data, abortSignal)
    },
    ...(handlers?.hydrate ? { hydrate: handlers.hydrate } : {}),
    ...(handlers?.hydrateGeneration
      ? { hydrateGeneration: handlers.hydrateGeneration }
      : {}),
    ...(handlers?.joinRun ? { joinRun: handlers.joinRun } : {}),
  }
}

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
          ...(runContext.parentRunId !== undefined
            ? { parentRunId: runContext.parentRunId }
            : {}),
          ...(runContext.resume !== undefined
            ? { resume: runContext.resume }
            : {}),
        },
        { signal: abortSignal, headers: runContext.headers },
      )
      if (result instanceof Response) {
        yield* responseToSSEChunks(result, abortSignal)
      } else {
        yield* abortableIterable(result, abortSignal)
      }
    },
  }
}

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

export function rpcStream(
  rpcCall: (
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
  ) => AsyncIterable<StreamChunk>,
  handlers?: StreamConnectionHandlers,
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      // Pass messages as-is (UIMessages with parts preserved)
      // Server-side chat() handles conversion to ModelMessages
      yield* rpcCall(messages, data, abortSignal)
    },
    ...(handlers?.hydrate ? { hydrate: handlers.hydrate } : {}),
    ...(handlers?.hydrateGeneration
      ? { hydrateGeneration: handlers.hydrateGeneration }
      : {}),
    ...(handlers?.joinRun ? { joinRun: handlers.joinRun } : {}),
  }
}
