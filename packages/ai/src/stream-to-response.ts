import { toRunErrorPayload } from './activities/error-payload'
import { EventType } from './types'
import { resolveDebugOption } from './logger/resolve'
import type { InternalLogger } from './logger/internal-logger'
import type { DebugOption } from './logger/types'
import type { StreamDurability } from './stream-durability'
import type { StreamChunk } from './types'

/**
 * Collect all text content from a StreamChunk async iterable and return as a string.
 *
 * This function consumes the entire stream, accumulating content from TEXT_MESSAGE_CONTENT events,
 * and returns the final concatenated text.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @returns Promise<string> - The accumulated text content
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openaiText('gpt-5.5'),
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * const text = await streamToText(stream);
 * console.log(text); // "Hello! How can I help you today?"
 * ```
 */
export async function streamToText(
  stream: AsyncIterable<StreamChunk>,
): Promise<string> {
  let accumulatedContent = ''

  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      accumulatedContent += chunk.delta
    }
  }

  return accumulatedContent
}

interface RecordedFailure {
  error: unknown
}

function errorMessage(error: unknown): string {
  return toRunErrorPayload(error).message
}

function combineFailures(
  primary: unknown,
  secondary: unknown,
  phase: string,
): unknown {
  if (primary === secondary) return primary
  const errors =
    primary instanceof AggregateError
      ? [...primary.errors, secondary]
      : [primary, secondary]
  return new AggregateError(
    errors,
    `${errorMessage(primary)}; ${phase}: ${errorMessage(secondary)}`,
  )
}

function runErrorChunk(
  error: unknown,
): Extract<StreamChunk, { type: 'RUN_ERROR' }> {
  const payload = toRunErrorPayload(error)
  return {
    type: EventType.RUN_ERROR,
    timestamp: Date.now(),
    message: payload.message,
    ...(payload.code === undefined ? {} : { code: payload.code }),
    error: payload,
  }
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

function needsTerminalPersistence(
  terminalPersisted: boolean,
  cancelled: boolean,
  failed: boolean,
): boolean {
  return !terminalPersisted && (cancelled || failed)
}

function toEncodedStream(
  stream: AsyncIterable<StreamChunk>,
  abortController: AbortController | undefined,
  encodeChunk: (chunk: StreamChunk, index: number) => Uint8Array,
  encodeError: (error: unknown) => Uint8Array,
): ReadableStream<Uint8Array> {
  const cancellation = abortController ?? new AbortController()
  let iterator: AsyncIterator<StreamChunk> | undefined
  let iteratorCleanup: Promise<void> | undefined
  let pumpPromise: Promise<void> = Promise.resolve()
  let pumpFailure: RecordedFailure | undefined
  let cancelled = false

  const recordPumpFailure = (error: unknown, phase: string): void => {
    pumpFailure = {
      error:
        pumpFailure === undefined
          ? error
          : combineFailures(pumpFailure.error, error, phase),
    }
  }

  const closeIterator = (): Promise<void> => {
    iteratorCleanup ??= (async () => {
      if (iterator?.return) await iterator.return()
    })()
    return iteratorCleanup
  }

  return new ReadableStream({
    start(controller) {
      iterator = stream[Symbol.asyncIterator]()
      pumpPromise = (async () => {
        let index = 0
        let iteratorDone = false

        try {
          while (!isAborted(cancellation.signal)) {
            const result = await iterator.next()
            if (result.done) {
              iteratorDone = true
              break
            }
            if (isAborted(cancellation.signal)) break
            controller.enqueue(encodeChunk(result.value, index))
            index += 1
          }
        } catch (error) {
          recordPumpFailure(error, 'stream iteration failed')
        } finally {
          if (!iteratorDone) {
            try {
              await closeIterator()
            } catch (error) {
              recordPumpFailure(error, 'iterator cleanup failed')
            }
          }

          if (
            !cancelled &&
            !isAborted(cancellation.signal) &&
            pumpFailure !== undefined
          ) {
            controller.enqueue(encodeError(pumpFailure.error))
          }
          if (!cancelled) controller.close()
        }
      })().catch((error: unknown) => {
        recordPumpFailure(error, 'stream pump failed')
      })
    },
    async cancel(reason) {
      cancelled = true
      if (!isAborted(cancellation.signal)) cancellation.abort(reason)

      let cancellationFailure: RecordedFailure | undefined
      try {
        await closeIterator()
      } catch (error) {
        cancellationFailure = { error }
      }
      await pumpPromise

      if (pumpFailure !== undefined && cancellationFailure !== undefined) {
        throw combineFailures(
          pumpFailure.error,
          cancellationFailure.error,
          'iterator cancellation failed',
        )
      }
      if (pumpFailure !== undefined) throw pumpFailure.error
      if (cancellationFailure !== undefined) throw cancellationFailure.error
    },
  })
}

/**
 * Convert a StreamChunk async iterable to a ReadableStream in Server-Sent Events format
 *
 * This creates a ReadableStream that emits chunks in SSE format:
 * - Each chunk is prefixed with "data: "
 * - Each chunk is followed by "\n\n"
 * - Stream ends when the underlying iterable is exhausted (RUN_FINISHED is the terminal event)
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param abortController - Optional AbortController to abort when stream is cancelled
 * @returns ReadableStream in Server-Sent Events format
 */
export function toServerSentEventsStream(
  stream: AsyncIterable<StreamChunk>,
  abortController?: AbortController,
  getId?: (chunk: StreamChunk, index: number) => string | undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return toEncodedStream(
    stream,
    abortController,
    (chunk, index) => {
      const id = getId?.(chunk, index)
      const idLine = id === undefined ? '' : `id: ${id}\n`
      return encoder.encode(`${idLine}data: ${JSON.stringify(chunk)}\n\n`)
    },
    (error) =>
      encoder.encode(`data: ${JSON.stringify(runErrorChunk(error))}\n\n`),
  )
}

/** Default number of chunks buffered before a durability `append`. */
const DEFAULT_DURABILITY_BATCH = 32

/**
 * Resolve and validate the durability batch size. A non-positive-integer (0,
 * negative, fractional, or `NaN`) is rejected rather than clamped: silently
 * `Math.max(1, …)`-ing a `NaN` used to disable size-based flushing entirely
 * (`length >= NaN` is always false), which is a subtle footgun.
 */
function resolveBatchSize(batch: number | undefined): number {
  if (batch === undefined) return DEFAULT_DURABILITY_BATCH
  if (!Number.isInteger(batch) || batch <= 0) {
    throw new Error(
      `Invalid durability batch size: ${batch}. Must be a positive integer.`,
    )
  }
  return batch
}

/**
 * Boundaries at which the batching producer flushes early, regardless of the
 * batch size — terminal events and tool-call ends. Flushing here keeps the
 * durability log promptly consistent at semantically meaningful points.
 */
function isDurabilityFlushBoundary(chunk: StreamChunk): boolean {
  return (
    chunk.type === 'RUN_FINISHED' ||
    chunk.type === 'RUN_ERROR' ||
    chunk.type === 'TOOL_CALL_END'
  )
}

/**
 * Build the delivery-durable source iterable for a transport helper.
 *
 * - **Resume** (`resumeFrom()` non-null): replay strictly after the offset,
 *   reading only from the durability log. The input `stream` is NEVER iterated,
 *   so `chat()`'s lazy iterator never fires the provider — the untouched
 *   generator is simply GC'd. This is what makes resume free of re-invocation.
 * - **Fresh** (`resumeFrom()` null): iterate `stream`, buffering up to `batch`
 *   chunks (flushing early at terminal / tool-call boundaries), `append` each
 *   batch to the log, then forward. Appending BEFORE forwarding guarantees a
 *   reconnecting client can always replay exactly what it already saw.
 *
 * The returned `getId` maps each forwarded chunk to the exact opaque offset
 * returned by the durability adapter for the SSE `id:` line.
 */
function durableStreamSource<TOffset extends string>(
  stream: AsyncIterable<StreamChunk>,
  durability: StreamDurability<TOffset>,
  options: {
    abortController: AbortController
    batch?: number
    logger?: InternalLogger
  },
): {
  source: AsyncIterable<StreamChunk>
  getId: (chunk: StreamChunk) => string | undefined
} {
  const resumeOffset = durability.resumeFrom()
  const batchSize = resolveBatchSize(options.batch)
  const abortController = options.abortController
  const logger = options.logger
  const idByChunk = new WeakMap<object, string>()
  const seenOffsets = new Set<string>()
  const getId = (chunk: StreamChunk): string | undefined => idByChunk.get(chunk)

  const validateOffset = (offset: TOffset): void => {
    // Reject NUL/CR/LF (would corrupt the SSE `id:` line) and any offset that
    // is not invariant under the wire round-trip. The SSE client reads the id
    // with `.trim()`, so an offset with leading/trailing whitespace would come
    // back changed and no longer match on reconnect — fail loud here rather
    // than silently mis-resuming. (NDJSON carries the offset inside the JSON
    // envelope and is unaffected, but the contract must hold for both wires.)
    if (
      offset.length === 0 ||
      /[\0\r\n]/.test(offset) ||
      offset !== offset.trim()
    ) {
      throw new Error(
        `Invalid durability offset for SSE id: ${JSON.stringify(offset)}`,
      )
    }
    if (seenOffsets.has(offset)) {
      throw new Error(
        `Durability adapter must return a unique offset per chunk: ${JSON.stringify(offset)}`,
      )
    }
    seenOffsets.add(offset)
  }

  async function* produce(): AsyncIterable<StreamChunk> {
    let batch: Array<StreamChunk> = []
    let terminalPersisted = false
    // Whether a terminal event was actually delivered LIVE to the consumer (as
    // opposed to only appended to the log). Distinguishes "the run already ended
    // on the wire" from "the log has a terminal but the consumer never saw one",
    // which governs whether a late durability-cleanup failure may be rethrown.
    let terminalForwarded = false
    let failure: RecordedFailure | undefined
    let terminalCause: unknown
    let hasTerminalCause = false

    const recordFailure = (error: unknown, phase: string): void => {
      failure = {
        error:
          failure === undefined
            ? error
            : combineFailures(failure.error, error, phase),
      }
    }

    async function* flush(): AsyncIterable<StreamChunk> {
      if (batch.length === 0) return
      const toForward = batch
      batch = []
      // Tag each chunk with the exact backend offset. Requiring one opaque
      // token per chunk preserves exact-once resume at any batch size.
      const offsets = await durability.append(toForward)
      if (offsets.length !== toForward.length) {
        throw new Error(
          `Durability append returned ${offsets.length} offsets for ${toForward.length} chunks`,
        )
      }
      toForward.forEach((chunk, i) => {
        const offset = offsets[i]
        if (offset === undefined) {
          throw new Error(`Durability append omitted offset at index ${i}`)
        }
        validateOffset(offset)
        idByChunk.set(chunk, offset)
      })
      if (
        toForward.some(
          (chunk) =>
            chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR',
        )
      ) {
        terminalPersisted = true
      }
      for (const chunk of toForward) {
        if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
          terminalForwarded = true
        }
        yield chunk
      }
    }

    try {
      if (isAborted(abortController.signal)) return
      for await (const chunk of stream) {
        if (isAborted(abortController.signal)) break
        batch.push(chunk)
        if (batch.length >= batchSize || isDurabilityFlushBoundary(chunk)) {
          yield* flush()
        }
      }
      if (!isAborted(abortController.signal)) yield* flush()
    } catch (error) {
      terminalCause = error
      hasTerminalCause = true
      recordFailure(error, 'producer failed')
      // The provider stream threw. Persist a terminal RUN_ERROR to the
      // durability log so a resumer / joiner learns the run failed (otherwise
      // the log ends with no terminal and they wait forever). Flush any
      // buffered chunks first, then append the terminal WITHOUT forwarding it
      // live — the transport layer synthesizes the live RUN_ERROR on rethrow,
      // so forwarding here too would double-emit.
      if (!isAborted(abortController.signal)) {
        try {
          yield* flush()
        } catch (flushError) {
          recordFailure(flushError, 'flushing buffered chunks failed')
        }
      }
    } finally {
      const cancelled = isAborted(abortController.signal)

      // Persist any buffered-but-unflushed chunks before terminalizing, so a
      // joiner replaying the log sees everything produced up to a disconnect
      // rather than a truncated prefix. On the abort path the streaming loop
      // broke before its trailing flush; drain flush() here for its persistence
      // side effect only (the delivery socket is gone, so the yielded chunks are
      // discarded). The normal and provider-throw paths already flushed, so
      // `batch` is empty for them and this is a no-op.
      if (batch.length > 0) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of flush()) {
            // persist-only: nothing consumes these
          }
        } catch (flushError) {
          recordFailure(flushError, 'flushing buffered chunks on exit failed')
        }
      }

      if (
        needsTerminalPersistence(terminalPersisted, cancelled, hasTerminalCause)
      ) {
        // Prefer the real provider error even when the delivery socket was also
        // aborted: if the run genuinely failed, a joiner should see that cause,
        // not a generic AbortError that masks it. AbortError is only used for a
        // pure cancellation with no underlying failure.
        const cause = hasTerminalCause ? terminalCause : { name: 'AbortError' }
        try {
          await durability.append([runErrorChunk(cause)])
          terminalPersisted = true
        } catch (terminalError) {
          // Rethrown to the live consumer below, but a joiner replaying the log
          // only ever sees a generic incomplete error — so record the real
          // cause server-side where an operator can act on it.
          logger?.errors('persisting terminal RUN_ERROR failed', {
            error: terminalError,
          })
          recordFailure(terminalError, 'persisting terminal RUN_ERROR failed')
        }
      }

      try {
        await durability.close()
      } catch (closeError) {
        // A failed close leaves the durable log unterminated for joiners; the
        // live consumer gets the rethrow, but log it for the joiner's sake.
        logger?.errors('closing durability stream failed', {
          error: closeError,
        })
        recordFailure(closeError, 'closing durability stream failed')
      }

      // Rethrow a terminalization/close failure to the live consumer ONLY when
      // no terminal reached it yet — the transport then synthesizes a live
      // RUN_ERROR so the consumer isn't left without a terminal. If a terminal
      // was already forwarded (the run ended on the wire), a late close()
      // failure is a server-side cleanup issue already recorded via
      // logger.errors; rethrowing it would append a contradictory second
      // terminal (RUN_ERROR after RUN_FINISHED) on the wire.
      // eslint-disable-next-line no-unsafe-finally
      if (failure !== undefined && !terminalForwarded) throw failure.error
    }
  }

  async function* replay(offset: TOffset): AsyncIterable<StreamChunk> {
    // Thread the consumer's abort signal into the read so a live-tailing join
    // (a mid-stream reconnect) that is aborted — or that hit a runId with no
    // in-process producer — stops parking and ends instead of hanging forever.
    for await (const { offset: eventOffset, chunk } of durability.read(
      offset,
      abortController.signal,
    )) {
      if (isAborted(abortController.signal)) break
      validateOffset(eventOffset)
      idByChunk.set(chunk, eventOffset)
      yield chunk
    }
  }

  return {
    source: resumeOffset !== null ? replay(resumeOffset) : produce(),
    getId,
  }
}

/**
 * Convert a StreamChunk async iterable to a Response in Server-Sent Events format
 *
 * This creates a Response that emits chunks in SSE format:
 * - Each chunk is prefixed with "data: "
 * - Each chunk is followed by "\n\n"
 * - Stream ends when the underlying iterable is exhausted (RUN_FINISHED is the terminal event)
 *
 * Pass a `durability` sink (`memoryStream(request)` / `durableStream(request)`)
 * to make the stream resumable: fresh runs are appended to the log and each SSE
 * event is tagged with an `id:` offset; a reconnect (native `Last-Event-ID`) or
 * a `?offset` join replays from the log without re-running the producer. `batch`
 * controls how many chunks are buffered per `append` (default 32).
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options (including `abortController`, `durability` with its optional `batch`, and `debug`)
 * @returns Response in Server-Sent Events format
 *
 * @example
 * ```typescript
 * export async function POST(request: Request) {
 *   const stream = chat({ adapter: openaiText('gpt-5.5'), messages: [...] });
 *   return toServerSentEventsResponse(stream, { durability: { adapter: memoryStream(request) } });
 * }
 * ```
 */
export function toServerSentEventsResponse<TOffset extends string = string>(
  stream: AsyncIterable<StreamChunk>,
  init?: ResponseInit & {
    abortController?: AbortController
    durability?: { adapter: StreamDurability<TOffset>; batch?: number }
    /**
     * Debug logging for durability failure paths (terminal-append and close).
     * These are rethrown to the live consumer, but a joiner only sees a generic
     * incomplete error, so enabling this surfaces the real cause server-side.
     */
    debug?: DebugOption
  },
): Response {
  const { headers, abortController, durability, debug, ...responseInit } =
    init ?? {}

  // Start with default SSE headers
  const mergedHeaders = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  // Override with user headers if provided, handling all HeadersInit forms:
  // Headers instance, string[][], or plain object
  if (headers) {
    const userHeaders = new Headers(headers)
    userHeaders.forEach((value, key) => {
      mergedHeaders.set(key, value)
    })
  }

  let body: ReadableStream<Uint8Array>
  if (durability) {
    const deliveryAbortController = abortController ?? new AbortController()
    const { source, getId } = durableStreamSource(stream, durability.adapter, {
      abortController: deliveryAbortController,
      batch: durability.batch,
      // Instantiate unconditionally (matching every other activity): the
      // `errors` category is on by default even when `debug` is undefined, so
      // durability terminal-append / close failures always surface server-side.
      // Without this, a backend error on the client-disconnect path (no live
      // consumer) is lost entirely.
      logger: resolveDebugOption(debug),
    })
    body = toServerSentEventsStream(source, deliveryAbortController, getId)
  } else {
    body = toServerSentEventsStream(stream, abortController)
  }

  return new Response(body, {
    ...responseInit,
    headers: mergedHeaders,
  })
}

/**
 * Convert a StreamChunk async iterable to a ReadableStream in HTTP stream format (newline-delimited JSON)
 *
 * This creates a ReadableStream that emits chunks as newline-delimited JSON:
 * - Each chunk is JSON.stringify'd and followed by "\n"
 * - No SSE formatting (no "data: " prefix)
 *
 * This format is compatible with `fetchHttpStream` connection adapter.
 *
 * When `getId` is supplied (delivery durability), each chunk is emitted as an
 * envelope `{"id":"<offset>","chunk":{…}}` instead of a bare chunk. NDJSON has
 * no native event-id field like SSE's `id:` line, so the resumable offset rides
 * inside the payload. Untagged chunks (no id) stay bare, so a non-durable
 * stream is byte-identical to before and the client auto-detects either form.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param abortController - Optional AbortController to abort when stream is cancelled
 * @param getId - Optional per-chunk durability offset; when present, chunks are envelope-encoded
 * @returns ReadableStream in HTTP stream format (newline-delimited JSON)
 *
 * @example
 * ```typescript
 * const stream = chat({ adapter: openaiText('gpt-5.5'), messages: [...] });
 * const readableStream = toHttpStream(stream);
 * // Use with Response for HTTP streaming (not SSE)
 * return new Response(readableStream, {
 *   headers: { 'Content-Type': 'application/x-ndjson' }
 * });
 * ```
 */
export function toHttpStream(
  stream: AsyncIterable<StreamChunk>,
  abortController?: AbortController,
  getId?: (chunk: StreamChunk, index: number) => string | undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return toEncodedStream(
    stream,
    abortController,
    (chunk, index) => {
      const id = getId?.(chunk, index)
      const line =
        id === undefined ? JSON.stringify(chunk) : JSON.stringify({ id, chunk })
      return encoder.encode(`${line}\n`)
    },
    (error) => encoder.encode(`${JSON.stringify(runErrorChunk(error))}\n`),
  )
}

/**
 * Convert a StreamChunk async iterable to a Response in HTTP stream format (newline-delimited JSON)
 *
 * This creates a Response that emits chunks in HTTP stream format:
 * - Each chunk is JSON.stringify'd and followed by "\n"
 * - No SSE formatting (no "data: " prefix)
 *
 * This format is compatible with `fetchHttpStream` connection adapter.
 *
 * Pass a `durability` sink (`memoryStream(request)` / `durableStream(request)`)
 * to make the stream resumable: fresh runs are appended to the log and each
 * NDJSON line is emitted as an `{ id, chunk }` envelope carrying an opaque
 * offset; a reconnect (native `Last-Event-ID` header) or a `?offset` join
 * replays from the log without re-running the producer. `batch` controls how
 * many chunks are buffered per `append` (default 32). This shares the exact
 * `durableStreamSource` used by `toServerSentEventsResponse` — only the wire
 * encoding differs.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options (including `abortController`, `durability` with its optional `batch`, and `debug`)
 * @returns Response in HTTP stream format (newline-delimited JSON)
 *
 * @example
 * ```typescript
 * export async function POST(request: Request) {
 *   const stream = chat({ adapter: openaiText('gpt-5.5'), messages: [...] });
 *   return toHttpResponse(stream, { durability: { adapter: memoryStream(request) } });
 * }
 * ```
 */
export function toHttpResponse<TOffset extends string = string>(
  stream: AsyncIterable<StreamChunk>,
  init?: ResponseInit & {
    abortController?: AbortController
    durability?: { adapter: StreamDurability<TOffset>; batch?: number }
    /**
     * Debug logging for durability failure paths (terminal-append and close).
     * These are rethrown to the live consumer, but a joiner only sees a generic
     * incomplete error, so enabling this surfaces the real cause server-side.
     */
    debug?: DebugOption
  },
): Response {
  const { abortController, durability, debug, headers, ...responseInit } =
    init ?? {}

  // Default to a streaming NDJSON content type (with no-cache), overridable by
  // user headers. Without an explicit streaming type some intermediaries buffer
  // the response, defeating incremental delivery. Mirrors the SSE helper.
  const mergedHeaders = new Headers({
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
  })
  if (headers) {
    const userHeaders = new Headers(headers)
    userHeaders.forEach((value, key) => {
      mergedHeaders.set(key, value)
    })
  }

  let body: ReadableStream<Uint8Array>
  if (durability) {
    const deliveryAbortController = abortController ?? new AbortController()
    const { source, getId } = durableStreamSource(stream, durability.adapter, {
      abortController: deliveryAbortController,
      batch: durability.batch,
      // Instantiate unconditionally (matching every other activity): the
      // `errors` category is on by default even when `debug` is undefined, so
      // durability terminal-append / close failures always surface server-side.
      // Without this, a backend error on the client-disconnect path (no live
      // consumer) is lost entirely.
      logger: resolveDebugOption(debug),
    })
    body = toHttpStream(source, deliveryAbortController, getId)
  } else {
    body = toHttpStream(stream, abortController)
  }

  return new Response(body, {
    ...responseInit,
    headers: mergedHeaders,
  })
}
