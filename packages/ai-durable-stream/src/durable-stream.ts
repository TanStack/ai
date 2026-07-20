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
   * bounded by this — a caught-up reader may legitimately wait.
   */
  operationTimeoutMs?: number
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

class ResponseBodyReadFailure extends Error {
  override name = 'ResponseBodyReadFailure'

  constructor(readonly readError: unknown) {
    super('response body read failed')
  }
}

function assertTransportField(value: string, name: string): string {
  if (value.trim().length === 0 || /[\r\n]/.test(value)) {
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
      if (!completed && !cancelled && !readFailed) await reader.cancel()
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

  for await (const line of readLines(body, signal)) {
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
  if (typeof parsed !== 'object' || parsed === null) {
    throw new DurableStreamError('control event payload must be an object')
  }
  if (
    !('streamNextOffset' in parsed) ||
    typeof parsed.streamNextOffset !== 'string'
  ) {
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
  if (streamClosed !== true && streamCursor === undefined) {
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
  if (offset === null || offset.trim().length === 0) {
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

/** External-URL Durable Streams protocol adapter. */
export function durableStream(
  request: Request,
  options: DurableStreamOptions,
): StreamDurability<DurableStreamOffset> {
  const fetchFn = options.fetch ?? globalThis.fetch
  if (options.server === undefined && options.fetch === undefined) {
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

  // create / append / close go through this so a stalled backend can't hang the
  // operation forever. Each call gets a fresh timeout; long-poll `read` calls
  // deliberately do NOT use it (they may wait for the producer to advance).
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
  const requestedRunId = safeSearchParam(request, 'runId')
  if (resumeOffset !== null && requestedRunId === null) {
    throw new DurableStreamError('resume offset requires a runId')
  }
  const runId = assertRunId(requestedRunId ?? crypto.randomUUID())

  const streamUrl = `${server}/streams/${encodeURIComponent(`${prefix}/${runId}`)}`
  let createPromise: Promise<string> | undefined
  let appendTailOffset: string | undefined
  let nextSeq = 1
  const producerId = crypto.randomUUID()
  const producerEpoch = 0
  let producerSeq = 0
  let closePromise: Promise<void> | undefined

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
      appendTailOffset = offset
      return offset
    })().catch((error: unknown) => {
      createPromise = undefined
      throw error
    })
    return createPromise
  }

  return {
    resumeFrom: () => resumeOffset,
    append: async (chunks) => {
      if (chunks.length === 0) return []
      const batchStartOffset = appendTailOffset ?? (await ensureCreated())
      const firstSeq = nextSeq
      const records = chunks.map(
        (chunk, index): WireRecord => ({
          v: 1,
          seq: firstSeq + index,
          chunk,
        }),
      )
      nextSeq += records.length
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
    read: async function* (offset, signal) {
      let backendOffset: string
      let deliveredThroughSeq = 0
      if (offset === '-1' || offset === 'now') {
        backendOffset = offset
      } else {
        const cursor = decodeCursor(offset)
        backendOffset = cursor.backendOffset
        deliveredThroughSeq = cursor.seq
      }
      let streamCursor: string | undefined
      let consecutiveReadFailures = 0

      for (;;) {
        if (signal?.aborted) return
        const requestOffset = backendOffset
        const requestCursor = streamCursor
        const url = new URL(streamUrl)
        url.searchParams.set('offset', backendOffset)
        url.searchParams.set('live', 'sse')
        if (streamCursor !== undefined) {
          url.searchParams.set('cursor', streamCursor)
        }

        let response: Response
        try {
          response = await fetchFn(url, {
            method: 'GET',
            headers: await resolveHeaders(),
            signal,
          })
        } catch (error) {
          if (signal?.aborted) return
          throw error
        }
        if (!response.ok) throw httpFailure('read', response)
        if (!response.body) {
          throw new DurableStreamError('read response had no body')
        }

        let dataStartOffset = backendOffset
        let sawControl = false
        let dataAwaitingControl = false
        let yieldedData = false
        // Guards intra-response ordering: seqs must strictly increase across the
        // whole response (including across data frames and control frames — seq
        // is per-run, not per-window). Starts at 0 so a legitimate replay of
        // already-delivered records still passes, then the dedup below drops
        // them; the throw catches a genuinely malformed [seq 2, seq 1] or a
        // duplicate seq that would otherwise be silently discarded.
        let previousResponseSeq = 0
        try {
          for await (const event of parseSseEvents(response.body, signal)) {
            if (signal?.aborted) return
            if (event.event === 'data') {
              dataAwaitingControl = true
              for (const record of parseDataRecords(event.data)) {
                if (record.seq <= previousResponseSeq) {
                  throw new DurableStreamError(
                    'data records must have strictly increasing sequences',
                  )
                }
                previousResponseSeq = record.seq
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
              if (control.streamClosed === true) return
              continue
            }
            throw new DurableStreamError(
              `unexpected SSE event type: ${JSON.stringify(event.event)}`,
            )
          }
        } catch (error) {
          if (signal?.aborted) return
          if (error instanceof ResponseBodyReadFailure) {
            if (
              yieldedData ||
              (sawControl &&
                (backendOffset !== requestOffset ||
                  streamCursor !== requestCursor))
            ) {
              // Made progress before the body failed — retry from the last valid
              // position, but cap consecutive failures and throttle so a
              // persistently failing backend surfaces the error, not a hot loop.
              consecutiveReadFailures += 1
              if (consecutiveReadFailures > maxReadFailures)
                throw error.readError
              await abortableDelay(readRetryDelayMs, signal)
              continue
            }
            throw error.readError
          }
          throw error
        }

        // A window read to completion (no body failure) clears the streak; only
        // consecutive failures accumulate toward the ceiling.
        consecutiveReadFailures = 0

        if (signal?.aborted) return
        if (dataAwaitingControl || !sawControl) {
          throw new DurableStreamError(
            'read SSE window ended without a matching control event',
          )
        }
        if (backendOffset === requestOffset && streamCursor === requestCursor) {
          throw new DurableStreamError(
            'read SSE window ended without advancing offset or cursor',
          )
        }
      }
    },
  }
}
