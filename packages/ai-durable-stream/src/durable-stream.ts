import { resolveResumeRunId } from '@tanstack/ai'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

declare const durableStreamCursorBrand: unique symbol

/** A validated, versioned offset produced by this adapter. */
type DurableStreamCursor = string & {
  readonly [durableStreamCursorBrand]: true
}

/** Adapter offsets also include the Durable Streams protocol sentinels. */
export type DurableStreamOffset = DurableStreamCursor | '-1' | 'now'

export interface DurableStreamOptions {
  /**
     * Base URL of the Durable Streams server (no trailing slash needed).
     * Optional when `fetch` is supplied — e.g. a Cloudflare service binding that
     * ignores the host and dispatches to the bound Worker by path — in which case
     * an internal placeholder base is used and only the `/streams/...` path
     * matters.
     */
  server?: string
  /** Stream-name prefix. Defaults to `runs`. */
  streamPrefix?: string
  /** Fetch implementation. Defaults to the global fetch. */
  fetch?: typeof globalThis.fetch
  /**
     * Headers applied to every create, append, read, and close request. A
     * resolver is called for every request so credentials can rotate.
     */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
  /**
     * Bounding for the read reconnect loop. After a response-body read failure
     * mid-window, `read` retries from the last valid position; these cap
     * consecutive retries and throttle them so a persistently failing backend
     * surfaces the error instead of looping without end. Normal window
     * advancement (long-poll) is never throttled.
     */
  reconnect?: {
    /**
         * Consecutive body-read-failure retries before surfacing the underlying
         * read error. Default 10.
         */
    maxReadFailures?: number
    /** Delay between read retries, in ms. Default 250. */
    delayMs?: number
  }
  /**
     * Timeout (ms) for a single create / append / close request to the backend.
     * A stalled backend would otherwise hang chunk delivery or terminalization
     * indefinitely. Default 30000. Long-poll `read` window advancement is NOT
     * bounded by this — a caught-up reader may legitimately wait. `snapshot`,
     * which must always return, IS bounded by it.
     */
  operationTimeoutMs?: number
  /**
     * Producer fencing epoch sent as `Producer-Epoch` on every append.
     *
     * A backend that fences producers rejects an append whose epoch is below the
     * highest it has seen, so a zombie host that lost its claim cannot keep
     * writing to a run a newer host took over. Callers that track a monotonic
     * per-run driver epoch (`RunRecord.driverEpoch`) should pass it here; the
     * default of `0` makes every producer look equally current to the backend,
     * which leaves fencing entirely to the caller's own run claim.
     */
  producerEpoch?: number
}

/** Resolve after `ms`, or immediately once `signal` aborts. Never rejects. */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  const skipDelay = ms <= 0 || Boolean(signal?.aborted)
  if (skipDelay) return Promise.resolve()
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

export class DurableStreamError extends Error {
  override name = 'DurableStreamError'

  constructor(message: string) {
    super(`durableStream: ${message}`)
  }
}

interface SseEvent {
  event?: string
  data?: string
}

interface WireRecord {
  v: 1
  seq: number
  chunk: StreamChunk
}

interface CursorPayload {
  v: 1
  backendOffset: string
  seq: number
}

interface ControlFrame {
  streamNextOffset: string
  streamCursor?: string
  upToDate?: boolean
  streamClosed?: boolean
}

const CURSOR_PREFIX = 'tanstack-ai-ds:v1:'
const READ_ABORTED = Symbol('read aborted')

/**
 * Hard ceiling on the SSE windows a single `snapshot` will pull before it gives
 * up. A snapshot stops at the first control frame that reports the reader caught
 * up (`upToDate`), so a conforming backend ends it in one or two windows. This
 * only fires for a backend that keeps handing out advancing windows without ever
 * reporting `upToDate`, where the alternative is a read that never returns.
 */
const SNAPSHOT_MAX_WINDOWS = 1000

class ResponseBodyReadFailure extends Error {
  override name = 'ResponseBodyReadFailure'

  constructor(readonly readError: unknown) {
    super('response body read failed')
  }
}

function assertTransportField(value: string, name: string): string {
  const invalidField = value.trim().length === 0 || /[\r\n]/.test(value)
  if (invalidField) {
    throw new DurableStreamError(
      `${name} must be non-empty and contain no CR/LF`,
    )
  }
  return value
}

function assertRunId(value: string): string {
  return assertTransportField(value, 'runId')
}

function isDurableStreamCursor(value: string): value is DurableStreamCursor {
  return value.startsWith(CURSOR_PREFIX)
}

function isCursorPayload(value: unknown): value is CursorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    value.v === 1 &&
    'backendOffset' in value &&
    typeof value.backendOffset === 'string' &&
    'seq' in value &&
    typeof value.seq === 'number' &&
    Number.isSafeInteger(value.seq) &&
    value.seq > 0
  )
}

function encodeCursor(payload: CursorPayload): DurableStreamCursor {
  assertTransportField(payload.backendOffset, 'backend offset')
  if (!Number.isSafeInteger(payload.seq) || payload.seq < 1) {
    throw new DurableStreamError(`invalid record sequence: ${payload.seq}`)
  }
  const cursor = `${CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`
  if (!isDurableStreamCursor(cursor)) {
    throw new DurableStreamError('failed to encode cursor')
  }
  return cursor
}

function decodeCursor(cursor: string): CursorPayload {
  if (!isDurableStreamCursor(cursor)) {
    throw new DurableStreamError('invalid or unsupported resume offset')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(cursor.slice(CURSOR_PREFIX.length)))
  } catch {
    throw new DurableStreamError('invalid or unsupported resume offset')
  }
  if (!isCursorPayload(parsed)) {
    throw new DurableStreamError('invalid or unsupported resume offset')
  }
  assertTransportField(parsed.backendOffset, 'backend offset')
  return parsed
}

function safeSearchParam(request: Request, key: string): string | null {
  try {
    return new URL(request.url).searchParams.get(key)
  } catch {
    return null
  }
}

function parseResumeOffset(raw: string | null): DurableStreamOffset | null {
  if (raw === null || raw === '-1' || raw === 'now') return raw
  decodeCursor(raw)
  if (!isDurableStreamCursor(raw)) {
    throw new DurableStreamError('invalid or unsupported resume offset')
  }
  return raw
}

async function* readLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  let cancelled = false
  let readFailed = false
  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array> | typeof READ_ABORTED
      try {
        result = await readWithAbort(reader, signal)
      } catch (error) {
        readFailed = true
        throw new ResponseBodyReadFailure(error)
      }
      if (result === READ_ABORTED) {
        cancelled = true
        await reader.cancel(signal?.reason)
        return
      }
      if (result.done) {
        completed = true
        break
      }
      buffer += decoder.decode(result.value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const raw of parts) {
        yield raw.endsWith('\r') ? raw.slice(0, -1) : raw
      }
    }
    buffer += decoder.decode()
    if (buffer.length > 0) {
      yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
    }
  } finally {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- readFailed is set in the catch before its throw; CFA can't see that from finally
      const stillOpen = !completed && !cancelled && !readFailed
      if (stillOpen) await reader.cancel()
    } finally {
      reader.releaseLock()
    }
  }
}

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
): Promise<ReadableStreamReadResult<Uint8Array> | typeof READ_ABORTED> {
  if (!signal) return reader.read()
  if (signal.aborted) return Promise.resolve(READ_ABORTED)

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      resolve(READ_ABORTED)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    reader.read().then(
      (result) => {
        signal.removeEventListener('abort', onAbort)
        resolve(result)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

async function* parseSseEvents(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  let current: SseEvent = {}
  let hasField = false

  const lines = readLines(body, signal)
  for await (const line of lines) {
    if (line === '') {
      if (hasField) yield current
      current = {}
      hasField = false
      continue
    }
    if (line.startsWith(':')) continue

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') {
      current.event = value
      hasField = true
    } else if (field === 'data') {
      current.data =
        current.data === undefined ? value : `${current.data}\n${value}`
      hasField = true
    }
  }
  if (hasField) yield current
}

async function* consumeSseWindow(args: {
  body: ReadableStream<Uint8Array>
  signal: AbortSignal | undefined
  dataStartOffset: string
  backendOffset: string
  streamCursor: string | undefined
  deliveredThroughSeq: number
  previousResponseSeq: number
  stopWhenUpToDate: boolean
  /**
     * Raise the append counter past a sequence already present in the log.
     *
     * Called for every record any read observes — including records the reader
     * then dedups away — so both `snapshot` (the alignment path a takeover
     * already runs) and a plain `read` teach this instance the log's tail.
     */
  observeSeq: (seq: number) => void
}): AsyncGenerator<
  { offset: DurableStreamOffset; chunk: StreamChunk },
  {
    dataAwaitingControl: boolean
    sawControl: boolean
    yieldedData: boolean
    backendOffset: string
    streamCursor: string | undefined
    deliveredThroughSeq: number
    done: boolean
  }
> {
  let dataAwaitingControl = false
  let sawControl = false
  let yieldedData = false
  let {
    dataStartOffset,
    backendOffset,
    streamCursor,
    deliveredThroughSeq,
    previousResponseSeq,
  } = args
  const sseEvents = parseSseEvents(args.body, args.signal)
  for await (const event of sseEvents) {
    if (args.signal?.aborted) {
      return {
        dataAwaitingControl,
        sawControl,
        yieldedData,
        backendOffset,
        streamCursor,
        deliveredThroughSeq,
        done: true,
      }
    }
    if (event.event === 'data') {
      dataAwaitingControl = true
      const dataRecords = parseDataRecords(event.data)
      for (const record of dataRecords) {
        if (record.seq <= previousResponseSeq) {
          throw new DurableStreamError(
            'data records must have strictly increasing sequences',
          )
        }
        previousResponseSeq = record.seq
        args.observeSeq(record.seq)
        if (record.seq <= deliveredThroughSeq) continue
        deliveredThroughSeq = record.seq
        yieldedData = true
        yield {
          offset: encodeCursor({
            v: 1,
            backendOffset: dataStartOffset,
            seq: record.seq,
          }),
          chunk: record.chunk,
        }
      }
      continue
    }
    if (event.event === 'control') {
      const control = parseControlFrame(event.data)
      backendOffset = control.streamNextOffset
      streamCursor = control.streamCursor
      dataStartOffset = backendOffset
      sawControl = true
      dataAwaitingControl = false
      const endWindow =
        control.streamClosed === true ||
        (args.stopWhenUpToDate && control.upToDate === true)
      if (endWindow) {
        return {
          dataAwaitingControl,
          sawControl,
          yieldedData,
          backendOffset,
          streamCursor,
          deliveredThroughSeq,
          done: true,
        }
      }
      continue
    }
    throw new DurableStreamError(
      `unexpected SSE event type: ${JSON.stringify(event.event)}`,
    )
  }
  return {
    dataAwaitingControl,
    sawControl,
    yieldedData,
    backendOffset,
    streamCursor,
    deliveredThroughSeq,
    done: false,
  }
}

async function fetchReadWindow(args: {
  streamUrl: string
  backendOffset: string
  streamCursor: string | undefined
  fetchFn: typeof fetch
  resolveHeaders: () => Promise<Headers>
  signal: AbortSignal | undefined
}): Promise<Response | undefined> {
  const url = new URL(args.streamUrl)
  url.searchParams.set('offset', args.backendOffset)
  url.searchParams.set('live', 'sse')
  if (args.streamCursor !== undefined) {
    url.searchParams.set('cursor', args.streamCursor)
  }
  try {
    return await args.fetchFn(url, {
      method: 'GET',
      headers: await args.resolveHeaders(),
      signal: args.signal,
    })
  } catch (error) {
    if (args.signal?.aborted) return undefined
    throw error
  }
}

function assertWindowAdvanced(state: {
  dataAwaitingControl: boolean
  sawControl: boolean
  backendOffset: string
  requestOffset: string
  streamCursor: string | undefined
  requestCursor: string | undefined
}): void {
  const missingControl = state.dataAwaitingControl || !state.sawControl
  if (missingControl) {
    throw new DurableStreamError(
      'read SSE window ended without a matching control event',
    )
  }
  const didNotAdvance =
    state.backendOffset === state.requestOffset &&
    state.streamCursor === state.requestCursor
  if (didNotAdvance) {
    throw new DurableStreamError(
      'read SSE window ended without advancing offset or cursor',
    )
  }
}

function unwrapReadError(error: unknown): unknown {
  if (error instanceof ResponseBodyReadFailure) return error.readError
  return error
}

function shouldRetryReadFailure(
  error: unknown,
  state: {
    signal: AbortSignal | undefined
    yieldedData: boolean
    sawControl: boolean
    backendOffset: string
    requestOffset: string
    streamCursor: string | undefined
    requestCursor: string | undefined
  },
): 'abort' | 'retry' | 'throw' {
  if (state.signal?.aborted) return 'abort'
  if (!(error instanceof ResponseBodyReadFailure)) return 'throw'
  const progressed =
    state.yieldedData ||
    (state.sawControl &&
      (state.backendOffset !== state.requestOffset ||
        state.streamCursor !== state.requestCursor))
  return progressed ? 'retry' : 'throw'
}

function isStreamChunk(value: unknown): value is StreamChunk {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

function isWireRecord(value: unknown): value is WireRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    value.v === 1 &&
    'seq' in value &&
    typeof value.seq === 'number' &&
    Number.isSafeInteger(value.seq) &&
    value.seq > 0 &&
    'chunk' in value &&
    isStreamChunk(value.chunk)
  )
}

function parseDataRecords(data: string | undefined): Array<WireRecord> {
  if (data === undefined) {
    throw new DurableStreamError('data event had no payload')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    throw new DurableStreamError('data event contained invalid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new DurableStreamError('data event payload must be a JSON array')
  }
  const records: Array<WireRecord> = []
  for (const value of parsed) {
    if (!isWireRecord(value)) {
      throw new DurableStreamError('data event contained an invalid record')
    }
    records.push(value)
  }
  return records
}

function optionalBoolean(
  value: object,
  name: 'upToDate' | 'streamClosed',
): boolean | undefined {
  const field =
    name === 'upToDate'
      ? 'upToDate' in value
        ? value.upToDate
        : undefined
      : 'streamClosed' in value
        ? value.streamClosed
        : undefined
  if (field === undefined) return undefined
  if (typeof field !== 'boolean') {
    throw new DurableStreamError(`control field ${name} must be boolean`)
  }
  return field
}

function parseControlFrame(data: string | undefined): ControlFrame {
  if (data === undefined) {
    throw new DurableStreamError('control event had no payload')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    throw new DurableStreamError('control event contained invalid JSON')
  }
  if (typeof parsed !== 'object') {
    throw new DurableStreamError('control event payload must be an object')
  }
  if (parsed === null) {
    throw new DurableStreamError('control event payload must be an object')
  }
  if (!('streamNextOffset' in parsed)) {
    throw new DurableStreamError(
      'control event requires string streamNextOffset',
    )
  }
  if (typeof parsed.streamNextOffset !== 'string') {
    throw new DurableStreamError(
      'control event requires string streamNextOffset',
    )
  }
  const streamNextOffset = assertTransportField(
    parsed.streamNextOffset,
    'control streamNextOffset',
  )
  let streamCursor: string | undefined
  if ('streamCursor' in parsed) {
    if (typeof parsed.streamCursor !== 'string') {
      throw new DurableStreamError('control streamCursor must be a string')
    }
    streamCursor = assertTransportField(
      parsed.streamCursor,
      'control streamCursor',
    )
  }
  const upToDate = optionalBoolean(parsed, 'upToDate')
  const streamClosed = optionalBoolean(parsed, 'streamClosed')
  const missingCursor = streamClosed !== true && streamCursor === undefined
  if (missingCursor) {
    throw new DurableStreamError(
      'open control event requires string streamCursor',
    )
  }
  return {
    streamNextOffset,
    ...(streamCursor === undefined ? {} : { streamCursor }),
    ...(upToDate === undefined ? {} : { upToDate }),
    ...(streamClosed === undefined ? {} : { streamClosed }),
  }
}

function requireNextOffset(response: Response, operation: string): string {
  const offset = response.headers.get('Stream-Next-Offset')
  if (offset === null) {
    throw new DurableStreamError(
      `${operation} response missing non-empty Stream-Next-Offset`,
    )
  }
  if (offset.trim().length === 0) {
    throw new DurableStreamError(
      `${operation} response missing non-empty Stream-Next-Offset`,
    )
  }
  return assertTransportField(offset, `${operation} Stream-Next-Offset`)
}

function httpFailure(
  operation: string,
  response: Response,
): DurableStreamError {
  return new DurableStreamError(
    `failed to ${operation} (${response.status} ${response.statusText})`,
  )
}

/**
 * External-URL Durable Streams protocol adapter.
 *
 * `request` must name a run — `X-Run-Id` header (what a `@tanstack/ai-client`
 * POST sends) or `?runId` (what a GET attach sends), resolved by core's
 * `resolveResumeRunId`. A request that names neither throws rather than
 * silently producing into an unaddressable stream.
 *
 * Returns a plain `StreamDurability`, not an `UpsertableStreamDurability`.
 * This adapter's offsets embed a backend-assigned Next-Offset cursor, so a
 * caller cannot choose them; there is no `upsert` implementation to supply.
 * Omitting `upsert` is the type-level statement that this adapter does not
 * support caller-supplied offsets, so a consumer requiring that capability
 * gets a compile error at the wiring site instead of a runtime failure.
 */
export function durableStream(
  request: Request,
  options: DurableStreamOptions,
): StreamDurability<DurableStreamOffset> {
  const fetchFn = options.fetch ?? globalThis.fetch
  const missingServer =
    options.server === undefined && options.fetch === undefined
  if (missingServer) {
    throw new DurableStreamError(
      'server is required unless a fetch implementation is provided',
    )
  }
  // When a custom fetch routes by path (e.g. a service binding), the host is
  // irrelevant; a reserved `.internal` base parses without ever resolving.
  const rawServer = options.server ?? 'https://durable-streams.internal'
  assertTransportField(rawServer, 'server URL')
  try {
    void new URL(rawServer)
  } catch {
    throw new DurableStreamError(
      `invalid server URL: ${JSON.stringify(rawServer)}`,
    )
  }
  const server = rawServer.replace(/\/+$/, '')
  const maxReadFailures = options.reconnect?.maxReadFailures ?? 10
  const readRetryDelayMs = options.reconnect?.delayMs ?? 250
  const operationTimeoutMs = options.operationTimeoutMs ?? 30_000

  const fetchWithTimeout = async (
    url: string | URL,
    init: RequestInit,
  ): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort(
        new DurableStreamError(
          `request exceeded operationTimeoutMs (${operationTimeoutMs}ms)`,
        ),
      )
    }, operationTimeoutMs)
    try {
      return await fetchFn(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
  const prefix = assertTransportField(
    options.streamPrefix ?? 'runs',
    'streamPrefix',
  )
  const rawResumeOffset =
    request.headers.get('Last-Event-ID') ?? safeSearchParam(request, 'offset')
  const resumeOffset = parseResumeOffset(rawResumeOffset)
  const requestedRunId = resolveResumeRunId(request)
  if (requestedRunId === null) {
    throw new DurableStreamError(
      resumeOffset === null
        ? 'a runId is required: send it as an X-Run-Id header or a ?runId query param'
        : 'resume offset requires a runId',
    )
  }
  const runId = assertRunId(requestedRunId)

  const streamUrl = `${server}/streams/${encodeURIComponent(`${prefix}/${runId}`)}`
  let createPromise: Promise<string> | undefined
  let createdHere = false
  let appendTailOffset: string | undefined
  let nextSeq = 1
  let seqSeeded = false
  let seedPromise: Promise<void> | undefined
  const producerId = crypto.randomUUID()
  const producerEpoch = options.producerEpoch ?? 0
  if (!Number.isSafeInteger(producerEpoch) || producerEpoch < 0) {
    throw new DurableStreamError(
      `producerEpoch must be a non-negative safe integer: ${producerEpoch}`,
    )
  }
  let producerSeq = 0
  let closePromise: Promise<void> | undefined

  const observeSeq = (seq: number): void => {
    if (seq >= nextSeq) nextSeq = seq + 1
  }

  const resolveHeaders = async (required?: HeadersInit): Promise<Headers> => {
    const configured =
      typeof options.headers === 'function'
        ? await options.headers()
        : options.headers
    const headers = new Headers(configured)
    if (required) {
      new Headers(required).forEach((value, key) => headers.set(key, value))
    }
    return headers
  }

  const ensureCreated = (): Promise<string> => {
    if (createPromise) return createPromise
    createPromise = (async () => {
      const response = await fetchWithTimeout(streamUrl, {
        method: 'PUT',
        headers: await resolveHeaders({ 'Content-Type': 'application/json' }),
      })
      if (!response.ok) throw httpFailure('create stream', response)
      const offset = requireNextOffset(response, 'create')
      createdHere = response.status === 201
      appendTailOffset = offset
      return offset
    })().catch((error: unknown) => {
      createPromise = undefined
      throw error
    })
    return createPromise
  }

  /**
     * The one window-pulling loop behind both `read` and `snapshot`.
     *
     * `stopWhenUpToDate` is the only difference between them. The protocol's
     * control frame carries `upToDate: true` when the backend has handed the
     * reader everything the stream currently holds; a live `read` ignores that and
     * keeps long-polling for more, while a `snapshot` returns there. That makes a
     * snapshot bounded even on a stream nobody ever closed.
     */
  const readWindows = async function* (
    offset: DurableStreamOffset,
    signal: AbortSignal | undefined,
    stopWhenUpToDate: boolean,
  ): AsyncGenerator<{ offset: DurableStreamOffset; chunk: StreamChunk }> {
    let backendOffset: string
    let deliveredThroughSeq = 0
    const isLiveOffset = offset === '-1' || offset === 'now'
    if (isLiveOffset) {
      backendOffset = offset
    } else {
      const cursor = decodeCursor(offset)
      backendOffset = cursor.backendOffset
      deliveredThroughSeq = cursor.seq
    }
    let streamCursor: string | undefined
    let consecutiveReadFailures = 0
    let windowsPulled = 0

    for (;;) {
      if (signal?.aborted) return
      windowsPulled += 1
      const snapshotStuck =
        stopWhenUpToDate && windowsPulled > SNAPSHOT_MAX_WINDOWS
      if (snapshotStuck) {
        throw new DurableStreamError(
          `snapshot read ${SNAPSHOT_MAX_WINDOWS} windows without the backend reporting upToDate`,
        )
      }
      const requestOffset = backendOffset
      const requestCursor = streamCursor
      const response = await fetchReadWindow({
        streamUrl,
        backendOffset,
        streamCursor,
        fetchFn,
        resolveHeaders,
        signal,
      })
      if (!response) return
      if (!response.ok) throw httpFailure('read', response)
      if (!response.body) {
        throw new DurableStreamError('read response had no body')
      }

      let sawControl = false
      let dataAwaitingControl = false
      let yieldedData = false
      try {
        const consumed = yield* consumeSseWindow({
          body: response.body,
          signal,
          dataStartOffset: backendOffset,
          backendOffset,
          streamCursor,
          deliveredThroughSeq,
          previousResponseSeq: 0,
          stopWhenUpToDate,
          observeSeq,
        })
        dataAwaitingControl = consumed.dataAwaitingControl
        sawControl = consumed.sawControl
        yieldedData = consumed.yieldedData
        backendOffset = consumed.backendOffset
        streamCursor = consumed.streamCursor
        deliveredThroughSeq = consumed.deliveredThroughSeq
        if (consumed.done) return
      } catch (error) {
        const retry = shouldRetryReadFailure(error, {
          signal,
          yieldedData,
          sawControl,
          backendOffset,
          requestOffset,
          streamCursor,
          requestCursor,
        })
        if (retry === 'abort') return
        if (retry === 'throw') throw unwrapReadError(error)
        consecutiveReadFailures += 1
        if (consecutiveReadFailures > maxReadFailures)
          throw unwrapReadError(error)
        await abortableDelay(readRetryDelayMs, signal)
        continue
      }

      // A window read to completion (no body failure) clears the streak; only
      // consecutive failures accumulate toward the ceiling.
      consecutiveReadFailures = 0

      if (signal?.aborted) return
      assertWindowAdvanced({
        dataAwaitingControl,
        sawControl,
        backendOffset,
        requestOffset,
        streamCursor,
        requestCursor,
      })
    }
  }

  /**
     * One bounded pass over everything the log currently holds.
     *
     * Two things bound it. `readWindows(..., stopWhenUpToDate=true)` returns at
     * the first control frame reporting the reader caught up, and
     * `SNAPSHOT_MAX_WINDOWS` catches a backend that keeps handing out advancing
     * windows without ever saying so. Neither covers a backend that simply never
     * answers — `upToDate` is an optional protocol field, read windows
     * deliberately skip `fetchWithTimeout` (a caught-up live reader may wait),
     * and an empty still-open log has nothing to send. That shape would park the
     * fetch forever, so the snapshot carries its own `operationTimeoutMs`
     * deadline. Timing out is a loud failure, never a truncated result: an
     * aborted `readWindows` ends its iteration quietly, so the flag is rechecked
     * after the loop and thrown.
     *
     * `ensureCreated()` first, exactly as `append` and `read` do. A snapshot of a
     * stream the backend does not hold yet must answer "nothing has been
     * delivered", not reject: `sandboxRunDriver`'s `pipe` calls
     * `awaitLogQuiescence` — two `snapshot()` reads — BEFORE the first append, so
     * the very first producer of every durable run snapshots a stream no `PUT` has
     * created. Reading straight through would surface that as
     * `httpFailure('read', ...)` and fail the run at its first chunk. It also keeps
     * this adapter's contract identical to core's `memoryStream`, which resolves to
     * `[]` for an unknown run; two `StreamDurability` implementations must not
     * disagree about so basic a case. `ensureCreated` is idempotent and memoised,
     * so this costs nothing once the stream exists.
     */
  const collectSnapshot = async (): Promise<
    Array<{ offset: DurableStreamOffset; chunk: StreamChunk }>
  > => {
    await ensureCreated()
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(
        new DurableStreamError(
          `snapshot exceeded operationTimeoutMs (${operationTimeoutMs}ms)`,
        ),
      )
    }, operationTimeoutMs)
    try {
      const entries: Array<{
        offset: DurableStreamOffset
        chunk: StreamChunk
      }> = []
      const snapshotWindows = readWindows('-1', controller.signal, true)
      for await (const entry of snapshotWindows) {
        entries.push(entry)
      }
      if (timedOut) {
        throw new DurableStreamError(
          `snapshot exceeded operationTimeoutMs (${operationTimeoutMs}ms) before the backend reported upToDate`,
        )
      }
      // A completed snapshot has seen every record stored, so `observeSeq` has
      // already moved `nextSeq` past the log's tail.
      seqSeeded = true
      return entries
    } finally {
      clearTimeout(timer)
    }
  }

  /**
     * Learn where the log ends before this instance appends to it for the first
     * time.
     *
     * A takeover host is handed a fresh adapter for a run whose log already holds
     * `seq 1..N`, and nothing in the protocol reports a record count, so the tail
     * has to be read. One bounded read per instance, and the alignment `snapshot()`
     * a takeover already performs satisfies it.
     *
     * A brand-new run pays nothing, and must not: the seeding read cannot be on the
     * producer's critical path. `upToDate` is an optional protocol field and an
     * empty still-open log has nothing to send, so on a backend that omits it the
     * read has to run its `operationTimeoutMs` deadline out and then fail — the
     * producer would wait on a reader that is waiting on the producer, and every
     * fresh run on such a backend would die of a synthetic error. `createdHere`
     * settles it without a request: a stream this instance brought into existence
     * provably holds no records, so `nextSeq` is already correct at 1.
     */
  const ensureSeqSeeded = (): Promise<void> => {
    if (seqSeeded) return Promise.resolve()
    if (seedPromise) return seedPromise
    seedPromise = (async () => {
      await ensureCreated()
      if (createdHere) {
        seqSeeded = true
        return
      }
      await collectSnapshot()
    })().catch((error: unknown) => {
      seedPromise = undefined
      throw error
    })
    return seedPromise
  }

  return {
    resumeFrom: () => resumeOffset,
    append: async (chunks) => {
      if (chunks.length === 0) return []
      await ensureSeqSeeded()
      const batchStartOffset = appendTailOffset ?? (await ensureCreated())
      const firstSeq = nextSeq
      const records = chunks.map(
        (chunk, index): WireRecord => ({
          v: 1,
          seq: firstSeq + index,
          chunk,
        }),
      )
      // Through `observeSeq`, so a concurrent read that already pushed the
      // counter further cannot be walked backwards.
      observeSeq(firstSeq + records.length - 1)
      const requestProducerSeq = producerSeq
      producerSeq += 1
      const requestInit: RequestInit = {
        method: 'POST',
        headers: await resolveHeaders({
          'Content-Type': 'application/json',
          'Producer-Id': producerId,
          'Producer-Epoch': String(producerEpoch),
          'Producer-Seq': String(requestProducerSeq),
        }),
        body: JSON.stringify(records),
      }
      let response: Response
      try {
        response = await fetchWithTimeout(streamUrl, requestInit)
      } catch (firstError) {
        try {
          response = await fetchWithTimeout(streamUrl, requestInit)
        } catch (retryError) {
          throw new AggregateError(
            [firstError, retryError],
            'durableStream: append failed before its outcome could be confirmed',
          )
        }
      }
      if (!response.ok) throw httpFailure('append', response)
      const nextOffset = requireNextOffset(response, 'append')
      appendTailOffset = nextOffset
      return records.map((record) =>
        encodeCursor({
          v: 1,
          backendOffset: batchStartOffset,
          seq: record.seq,
        }),
      )
    },
    close: () => {
      if (closePromise) return closePromise
      closePromise = (async () => {
        await ensureCreated()
        const response = await fetchWithTimeout(streamUrl, {
          method: 'POST',
          headers: await resolveHeaders({ 'Stream-Closed': 'true' }),
        })
        if (!response.ok) throw httpFailure('close', response)
        const nextOffset = requireNextOffset(response, 'close')
        if (response.headers.get('Stream-Closed')?.toLowerCase() !== 'true') {
          throw new DurableStreamError(
            'close response missing Stream-Closed: true',
          )
        }
        appendTailOffset = nextOffset
      })().catch((error: unknown) => {
        closePromise = undefined
        throw error
      })
      return closePromise
    },
    read: (offset, signal) => readWindows(offset, signal, false),
    snapshot: () => collectSnapshot(),
  }
}
