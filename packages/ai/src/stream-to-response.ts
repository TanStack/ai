import { toRunErrorPayload } from './activities/error-payload'
import { isCancelRequestedReason } from './activities/chat/cancel'
import {
  isRunStatus,
  isTerminalRunStatus,
} from './activities/chat/middleware/run-store'
import { wasRunDetached } from './delivery-detach'
import { notifyRunDisconnected } from './delivery-disconnect'
import { resolveResumeRunId } from './stream-durability'
import { EventType } from './types'
import { toWireChunk } from './strip-to-spec-middleware'
import { resolveDebugOption } from './logger/resolve'
import { runErrorEventToError } from './utilities/errors'
import type { LockStore } from './activities/chat/middleware/locks'
import type {
  RunRecord,
  RunStore,
} from './activities/chat/middleware/run-store'
import type { InternalLogger } from './logger/internal-logger'
import type { DebugOption } from './logger/types'
import type { StreamDurability } from './stream-durability'
import type { StreamChunk } from './types'

export { resolveResumeRunId } from './stream-durability'

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
    if (chunk.type === 'RUN_ERROR') {
      throw runErrorEventToError(chunk)
    }

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

export function runErrorChunk(
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

/**
 * Whether this abort is an EXPLICIT in-process cancel — the caller aborted with
 * {@link RUN_CANCEL_REASON} rather than the socket going away.
 *
 * Core's own guard, independent of any middleware verdict: a user pressing Stop
 * must always get a closed, terminal log, so the sink refuses to treat that abort
 * as a detach even if the run's middleware published one. A reason-less abort
 * carries a `DOMException`, never a string, so a non-string reason is "no
 * explicit intent" — exactly how `resolveAbortReason` reads it in `chat()`.
 */
function isExplicitCancel(signal: AbortSignal): boolean {
  const reason: unknown = signal.reason
  return typeof reason === 'string' && isCancelRequestedReason(reason)
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
  detachOnCancel = false,
  onDetachedCancel?: () => void,
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
            if (!cancelled) controller.enqueue(encodeChunk(result.value, index))
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
      if (detachOnCancel) {
        onDetachedCancel?.()
        return
      }

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
 * @param getId - Optional per-chunk durability offset; when present, each event gets an `id:` line
 * @returns ReadableStream in Server-Sent Events format
 */
export function toServerSentEventsStream(
  stream: AsyncIterable<StreamChunk>,
  abortController?: AbortController,
  getId?: (chunk: StreamChunk, index: number) => string | undefined,
): ReadableStream<Uint8Array> {
  const { encodeChunk, encodeError } = sseEncoders(getId)
  return toEncodedStream(stream, abortController, encodeChunk, encodeError)
}

/**
 * SSE chunk/error encoders. Shared by the public {@link toServerSentEventsStream}
 * and the internal durability branch (which additionally needs `toEncodedStream`'s
 * private `detachOnCancel`), so the wire format stays identical for both.
 */
function sseEncoders(
  getId?: (chunk: StreamChunk, index: number) => string | undefined,
): {
  encodeChunk: (chunk: StreamChunk, index: number) => Uint8Array
  encodeError: (error: unknown) => Uint8Array
} {
  const encoder = new TextEncoder()
  return {
    encodeChunk: (chunk, index) => {
      const id = getId?.(chunk, index)
      const idLine = id === undefined ? '' : `id: ${id}\n`
      const wire = toWireChunk(chunk)
      return encoder.encode(`${idLine}data: ${JSON.stringify(wire)}\n\n`)
    },
    encodeError: (error) =>
      encoder.encode(
        `data: ${JSON.stringify(toWireChunk(runErrorChunk(error)))}\n\n`,
      ),
  }
}

/** Default number of chunks buffered before a durability `append`. */
const /** Default number of chunks buffered before a durability `append`. */
DEFAULT_DURABILITY_BATCH = 32

/**
 * Resolve and validate the durability batch size. A non-positive-integer (0,
 * negative, fractional, or `NaN`) is rejected rather than clamped: silently
 * `Math.max(1, …)`-ing a `NaN` used to disable size-based flushing entirely
 * (`length >= NaN` is always false), which is a subtle footgun.
 */
function resolveBatchSize(batch: number | undefined): number {
  if (batch === undefined) return DEFAULT_DURABILITY_BATCH
  const isBadBatchSize = !Number.isInteger(batch) || batch <= 0
  if (isBadBatchSize) {
    throw new Error(
      `Invalid durability batch size: ${batch}. Must be a positive integer.`,
    )
  }
  return batch
}

/**
 * Boundaries at which the batching producer flushes early, regardless of the
 * batch size — the run-start marker, terminal events, and tool-call ends.
 * Flushing here keeps the durability log promptly consistent at semantically
 * meaningful points.
 *
 * `RUN_STARTED` matters especially for one-shot activities (image, speech,
 * transcription, summarize): they emit `RUN_STARTED`, then await the provider
 * for seconds, then a terminal. Without flushing `RUN_STARTED` the log stays
 * empty for the whole run, so a mount-time `joinRun` finds nothing and its
 * empty-log deadline fast-fails as "run gone" — even though the run is alive.
 * Flushing it immediately makes the run resumable from the instant it starts.
 */
function isDurabilityFlushBoundary(chunk: StreamChunk): boolean {
  return (
    chunk.type === 'RUN_STARTED' ||
    chunk.type === 'RUN_FINISHED' ||
    chunk.type === 'RUN_ERROR' ||
    chunk.type === 'TOOL_CALL_END'
  )
}

/**
 * Name of the synthetic `CUSTOM` chunk a fresh durable producer appends to its
 * log before pulling the first real chunk.
 *
 * Flushing `RUN_STARTED` (above) makes a run joinable from the instant the
 * stream EMITS something — but a `chat()` whose middleware boots a sandbox
 * (create a container, install a CLI) legitimately emits nothing for minutes,
 * and during that window the log is empty. Every joiner's empty-log fail-fast
 * (`memoryStream`'s first-chunk deadline, the client's rejoin connect deadline)
 * then reads the run as gone — and the client clears its resume pointer, so a
 * reload during the boot window permanently orphans a run that is still going.
 *
 * This marker closes the window: it is appended (and flushed) before the
 * producer stream is first pulled, so a join always finds a first chunk within
 * milliseconds of the run being accepted. Takeover alignment is unaffected — a
 * journal replay cannot reproduce the marker, and alignment already skips
 * stored `CUSTOM` chunks as out-of-band for exactly that reason (see
 * `isBridgeCustomChunk` in `@tanstack/ai-sandbox`).
 */
export const RUN_ACCEPTED_EVENT = 'run.accepted'

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
export function durableStreamSource<TOffset extends string>(
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
    const isBadOffset =
      offset.length === 0 ||
      offset.includes('\0') ||
      offset.includes('\r') ||
      offset.includes('\n') ||
      offset !== offset.trim()
    if (isBadOffset) {
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
        const isTerminalChunk =
          chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
        if (isTerminalChunk) {
          terminalForwarded = true
        }
        yield chunk
      }
    }

    async function* runProduceLoop(): AsyncIterable<StreamChunk> {
      if (isAborted(abortController.signal)) return
      batch.push({
        type: 'CUSTOM',
        name: RUN_ACCEPTED_EVENT,
        value: {},
        timestamp: Date.now(),
      })
      yield* flush()
      for await (const chunk of stream) {
        if (isAborted(abortController.signal)) break
        batch.push(chunk)
        const shouldFlush =
          batch.length >= batchSize || isDurabilityFlushBoundary(chunk)
        if (shouldFlush) {
          yield* flush()
        }
      }
      if (!isAborted(abortController.signal)) yield* flush()
    }

    try {
      yield* runProduceLoop()
    } catch (error) {
      terminalCause = error
      hasTerminalCause = true
      recordFailure(error, 'producer failed')
      if (!isAborted(abortController.signal)) {
        try {
          yield* flush()
        } catch (flushError) {
          recordFailure(flushError, 'flushing buffered chunks failed')
        }
      }
    } finally {
      await finalizeProduce()
    }

    async function persistBufferedBatch(): Promise<void> {
      if (batch.length === 0) return
      try {
        const flushed = flush()
        for await (const _chunk of flushed) {
          // persist-only: nothing consumes these
        }
      } catch (flushError) {
        recordFailure(flushError, 'flushing buffered chunks on exit failed')
      }
    }

    async function persistTerminalIfNeeded(detached: boolean): Promise<void> {
      const cancelled = isAborted(abortController.signal)
      const skipTerminalPersist =
        detached ||
        !needsTerminalPersistence(
          terminalPersisted,
          cancelled,
          hasTerminalCause,
        )
      if (skipTerminalPersist) {
        return
      }
      const cause = hasTerminalCause ? terminalCause : { name: 'AbortError' }
      try {
        await durability.append([runErrorChunk(cause)])
        terminalPersisted = true
      } catch (terminalError) {
        logger?.errors('persisting terminal RUN_ERROR failed', {
          error: terminalError,
        })
        recordFailure(terminalError, 'persisting terminal RUN_ERROR failed')
      }
    }

    async function closeDurabilityIfNeeded(detached: boolean): Promise<void> {
      if (detached) return
      try {
        await durability.close()
      } catch (closeError) {
        logger?.errors('closing durability stream failed', {
          error: closeError,
        })
        recordFailure(closeError, 'closing durability stream failed')
      }
    }

    function rethrowDurabilityFailure(): void {
      if (failure === undefined) return
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- terminalForwarded is set only inside the flush() closure, which TS CFA narrows away here
      if (!terminalForwarded) {
        throw failure.error
      }
      logger?.errors(
        'durability failure after a terminal event was forwarded',
        {
          error: failure.error,
        },
      )
    }

    async function finalizeProduce(): Promise<void> {
      const cancelled = isAborted(abortController.signal)
      await persistBufferedBatch()
      const detached =
        cancelled &&
        !isExplicitCancel(abortController.signal) &&
        !hasTerminalCause &&
        wasRunDetached(stream)
      await persistTerminalIfNeeded(detached)
      await closeDurabilityIfNeeded(detached)
      rethrowDurabilityFailure()
    }
  }

  async function* replay(offset: TOffset): AsyncIterable<StreamChunk> {
    const records = durability.read(offset, abortController.signal)
    for await (const { offset: eventOffset, chunk } of records) {
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
         * Customize logging for durability failure paths (terminal-append and
         * close). These failures are always logged server-side by default (the
         * `errors` category is on even without `debug`, via a `ConsoleLogger`);
         * pass `debug` to route them to a custom `Logger` or raise verbosity. A
         * joiner replaying the log only ever sees a generic incomplete error, so
         * server-side logging is where the real cause is recoverable.
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
    const isFresh = durability.adapter.resumeFrom() === null
    const producerAbortController = abortController ?? new AbortController()
    const deliveryAbortController = isFresh
      ? new AbortController()
      : producerAbortController
    const { source, getId } = durableStreamSource(stream, durability.adapter, {
      abortController: producerAbortController,
      batch: durability.batch,
      logger: resolveDebugOption(debug),
    })
    const { encodeChunk, encodeError } = sseEncoders(getId)
    body = toEncodedStream(
      source,
      deliveryAbortController,
      encodeChunk,
      encodeError,
      isFresh,
      // Fresh runs only: a resume response IS a reader, so its cancel is an
      // ordinary read being stopped, not a producer losing its viewer.
      isFresh ? () => notifyRunDisconnected(stream) : undefined,
    )
  } else {
    body = toServerSentEventsStream(stream, abortController)
  }

  return new Response(body, {
    ...responseInit,
    headers: mergedHeaders,
  })
}

/**
 * A resume is served entirely from the durability log, so there is no producer
 * to iterate. This empty source satisfies the response helpers' signature; on a
 * resume `durableStreamSource` replays from the log and never touches it.
 */
function emptyDurableSource(): AsyncIterable<StreamChunk> {
  return (async function* () {})()
}

/**
 * Everything the resume helpers need to take a run over as a side effect of
 * serving its log.
 *
 * `claim` and `pipe` are **injected**, not imported. The two mechanisms a
 * takeover needs (`withRunClaim` and `pipeToRunLog`) live in
 * `@tanstack/ai-sandbox`, and `@tanstack/ai` must not depend on that package —
 * that layering inversion is exactly what moving `LockStore` into core was meant
 * to prevent, and it would make core depend on the sandbox package to serve a
 * plain chat run. Injecting them keeps only the *shape* of a takeover in core
 * (parse the run id, read the record, skip if terminal, claim, drive) and lets a
 * background-worker-driven run supply its own pair.
 * `@tanstack/ai-sandbox`'s `sandboxRunDriver` fills both in.
 */
export interface RunDriverOptions {
  /** The attach request; its run id is read with {@link resolveResumeRunId}. */
  request: Request
  runs: RunStore
  locks: LockStore
  /** Produce the run's remaining events. Called only once the claim is held. */
  drive: (input: {
    runId: string
    threadId: string
    signal: AbortSignal
  }) => AsyncIterable<StreamChunk>
  /** Run `fn` under exclusive ownership of the run, or reject if refused. */
  claim: <T>(
    input: { runs: RunStore; locks: LockStore; runId: string },
    fn: (claim: {
      runId: string
      epoch: number
      signal: AbortSignal
    }) => Promise<T>,
  ) => Promise<T>
  /** Persist the driven stream to the run's producer-side durability log. */
  pipe: (
    stream: AsyncIterable<StreamChunk>,
    input: { runId: string; threadId: string; signal: AbortSignal },
  ) => Promise<unknown>
  /** Platform keep-alive (e.g. `ctx.waitUntil`) for the background drive. */
  waitUntil?: (promise: Promise<unknown>) => void
  logger?: InternalLogger
}

/** Shared options for the resume-only response helpers. */
type ResumeResponseOptions<TOffset extends string> = ResponseInit & {
  adapter: StreamDurability<TOffset>
  batch?: number
  debug?: DebugOption
  /**
     * Take the run over while serving its log. Omit to serve the log only —
     * the response is byte-identical either way.
     */
  driver?: RunDriverOptions
}

/**
 * Take over an in-flight run as a side effect of serving its log.
 *
 * The response itself is unchanged: it still replays from the durability log via
 * `emptyDurableSource()`. The drive runs BESIDE it, appending to the run's own
 * producer-side log through the injected `pipe`, and the response tails what
 * lands. That separation is what lets a taken-over run keep `chat()`'s normal
 * middleware path — `withPersistence.onFinish` is what saves the transcript, so a
 * parallel translation path would lose the history of any run that completed
 * while detached.
 *
 * TOTAL BY CONSTRUCTION. Every failure is logged and swallowed:
 *
 * - No run id, no record, or a terminal record → serve the log, drive nothing.
 *   A second tab attaching to a finished run must still see the transcript.
 * - The claim is refused (another host is already driving) → serve the log,
 *   drive nothing. That is the documented "two hosts attach at once: one wins
 *   the lease and drives, the other tails the log" behavior.
 * - The drive throws → logged. It cannot be reported to this response, which is
 *   already streaming the log; the run's own `RUN_ERROR` event is the channel.
 *
 * A rejection escaping here would be an unhandled rejection with nobody to
 * report it to — process-fatal on modern Node and instance-fatal inside a
 * Durable Object.
 */
function startRunDriver(driver: RunDriverOptions): void {
  const logger = driver.logger
  const promise = (async () => {
    const runId = resolveResumeRunId(driver.request)
    if (runId === null) return
    let record: RunRecord | null = null
    try {
      record = await driver.runs.get(runId)
    } catch (error) {
      logger?.errors('resume driver: reading the run record failed', {
        runId,
        error,
      })
      return
    }
    if (record !== null && !isRunStatus(record.status)) {
      logger?.errors(
        'resume driver: the run record has an unrecognized status',
        {
          runId,
          status: record.status,
        },
      )
      return
    }
    if (record === null || isTerminalRunStatus(record.status)) return
    if (record.cancelRequested === true) return
    const active = record

    try {
      await driver.claim(
        { runs: driver.runs, locks: driver.locks, runId },
        async (claim) => {
          try {
            await driver.runs.update(runId, { detachedSince: undefined })
          } catch (error) {
            logger?.errors('resume driver: clearing detachedSince failed', {
              runId,
              error,
            })
          }
          await driver.pipe(
            driver.drive({
              runId,
              threadId: active.threadId,
              signal: claim.signal,
            }),
            { runId, threadId: active.threadId, signal: claim.signal },
          )
        },
      )
    } catch (error) {
      // Includes RunClaimNotAcquiredError (someone else is driving) and
      // RunClaimLostError (we were superseded mid-drive). Both are normal.
      logger?.provider('resume driver: not driving this run', { runId, error })
    }
  })()

  if (driver.waitUntil) {
    driver.waitUntil(promise)
  } else {
    // No platform keep-alive: at least ensure the rejection is handled. The
    // async body above already catches everything, so this is belt-and-braces.
    void promise.catch(() => {})
  }
}

/**
 * The single wiring point both resume helpers call, so the SSE and NDJSON
 * halves cannot drift: a fix here applies to both. Called AFTER each helper's
 * `resumeFrom() === null` 400 check — an attach with no offset has nothing to
 * replay, and driving a run whose response will 400 would start an agent
 * nobody is watching.
 */
function maybeStartRunDriver(driver: RunDriverOptions | undefined): void {
  if (driver) startRunDriver(driver)
}

const NO_RESUME_OFFSET =
  'No resume offset provided (expected a Last-Event-ID header or an ?offset query parameter).'

/**
 * Serve a resumable run from its durability log over Server-Sent Events, without
 * re-running the model. Use this in a `GET` handler so a reload or a second tab
 * can re-attach to an in-flight or finished run.
 *
 * The adapter (`memoryStream(request)` / `durableStream(request)`) captures the
 * resume offset from the request. If there is none (no `Last-Event-ID` header
 * and no `?offset`), there is nothing to replay and this returns a 400.
 *
 * @example
 * ```typescript
 * export async function GET(request: Request) {
 *   return resumeServerSentEventsResponse({ adapter: memoryStream(request) });
 * }
 * ```
 */
export function resumeServerSentEventsResponse<TOffset extends string = string>(
  options: ResumeResponseOptions<TOffset>,
): Response {
  const { adapter, batch, debug, driver, ...responseInit } = options
  if (adapter.resumeFrom() === null) {
    return new Response(NO_RESUME_OFFSET, { status: 400 })
  }
  maybeStartRunDriver(driver)
  return toServerSentEventsResponse(emptyDurableSource(), {
    ...responseInit,
    durability: { adapter, batch },
    debug,
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
  const { encodeChunk, encodeError } = ndjsonEncoders(getId)
  return toEncodedStream(stream, abortController, encodeChunk, encodeError)
}

/**
 * NDJSON chunk/error encoders. Shared by {@link toHttpStream} and the internal
 * durability branch (see {@link sseEncoders}).
 */
function ndjsonEncoders(
  getId?: (chunk: StreamChunk, index: number) => string | undefined,
): {
  encodeChunk: (chunk: StreamChunk, index: number) => Uint8Array
  encodeError: (error: unknown) => Uint8Array
} {
  const encoder = new TextEncoder()
  return {
    encodeChunk: (chunk, index) => {
      const id = getId?.(chunk, index)
      const wire = toWireChunk(chunk)
      const line =
        id === undefined
          ? JSON.stringify(wire)
          : JSON.stringify({ id, chunk: wire })
      return encoder.encode(`${line}\n`)
    },
    encodeError: (error) =>
      encoder.encode(`${JSON.stringify(toWireChunk(runErrorChunk(error)))}\n`),
  }
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
    debug?: DebugOption
  },
): Response {
  const { abortController, durability, debug, headers, ...responseInit } =
    init ?? {}

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
    const isFresh = durability.adapter.resumeFrom() === null
    const producerAbortController = abortController ?? new AbortController()
    const deliveryAbortController = isFresh
      ? new AbortController()
      : producerAbortController
    const { source, getId } = durableStreamSource(stream, durability.adapter, {
      abortController: producerAbortController,
      batch: durability.batch,
      // Errors-on-by-default logger (see toServerSentEventsResponse).
      logger: resolveDebugOption(debug),
    })
    const { encodeChunk, encodeError } = ndjsonEncoders(getId)
    body = toEncodedStream(
      source,
      deliveryAbortController,
      encodeChunk,
      encodeError,
      isFresh,
      // See the SSE helper: fresh runs only.
      isFresh ? () => notifyRunDisconnected(stream) : undefined,
    )
  } else {
    body = toHttpStream(stream, abortController)
  }

  return new Response(body, {
    ...responseInit,
    headers: mergedHeaders,
  })
}

/**
 * Serve a resumable run from its durability log over NDJSON, without re-running
 * the model. The NDJSON counterpart of {@link resumeServerSentEventsResponse};
 * pair it with a `toHttpResponse` producer. Returns a 400 when the request
 * carries no resume offset (no `Last-Event-ID` header and no `?offset`).
 *
 * @example
 * ```typescript
 * export async function GET(request: Request) {
 *   return resumeHttpResponse({ adapter: memoryStream(request) });
 * }
 * ```
 */
export function resumeHttpResponse<TOffset extends string = string>(
  options: ResumeResponseOptions<TOffset>,
): Response {
  // See `resumeServerSentEventsResponse`: `driver` must not reach `responseInit`.
  const { adapter, batch, debug, driver, ...responseInit } = options
  if (adapter.resumeFrom() === null) {
    return new Response(NO_RESUME_OFFSET, { status: 400 })
  }
  maybeStartRunDriver(driver)
  return toHttpResponse(emptyDurableSource(), {
    ...responseInit,
    durability: { adapter, batch },
    debug,
  })
}
