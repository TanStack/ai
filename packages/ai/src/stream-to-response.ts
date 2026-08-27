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

export function toServerSentEventsStream(
  stream: AsyncIterable<StreamChunk>,
  abortController?: AbortController,
  getId?: (chunk: StreamChunk, index: number) => string | undefined,
): ReadableStream<Uint8Array> {
  const { encodeChunk, encodeError } = sseEncoders(getId)
  return toEncodedStream(stream, abortController, encodeChunk, encodeError)
}

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
const DEFAULT_DURABILITY_BATCH = 32

function resolveBatchSize(batch: number | undefined): number {
  if (batch === undefined) return DEFAULT_DURABILITY_BATCH
  const isInvalidBatch = !Number.isInteger(batch) || batch <= 0
  if (isInvalidBatch) {
    throw new Error(
      `Invalid durability batch size: ${batch}. Must be a positive integer.`,
    )
  }
  return batch
}

function isDurabilityFlushBoundary(chunk: StreamChunk): boolean {
  return (
    chunk.type === 'RUN_STARTED' ||
    chunk.type === 'RUN_FINISHED' ||
    chunk.type === 'RUN_ERROR' ||
    chunk.type === 'TOOL_CALL_END'
  )
}

export const RUN_ACCEPTED_EVENT = 'run.accepted'

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
    const isEmptyOffset =
      offset.length === 0 ||
      offset.includes('\0') ||
      offset.includes('\r') ||
      offset.includes('\n') ||
      offset !== offset.trim()
    if (isEmptyOffset) {
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
        const isRUNFINISHED =
          chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
        if (isRUNFINISHED) {
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
        const hasBatch =
          batch.length >= batchSize || isDurabilityFlushBoundary(chunk)
        if (hasBatch) {
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
      const shouldSkipDetached =
        detached ||
        !needsTerminalPersistence(
          terminalPersisted,
          cancelled,
          hasTerminalCause,
        )
      if (shouldSkipDetached) {
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

export function toServerSentEventsResponse<TOffset extends string = string>(
  stream: AsyncIterable<StreamChunk>,
  init?: ResponseInit & {
    abortController?: AbortController
    durability?: { adapter: StreamDurability<TOffset>; batch?: number }
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

function emptyDurableSource(): AsyncIterable<StreamChunk> {
  return (async function* () {})()
}

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
  driver?: RunDriverOptions
}

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

function maybeStartRunDriver(driver: RunDriverOptions | undefined): void {
  if (driver) startRunDriver(driver)
}

const NO_RESUME_OFFSET =
  'No resume offset provided (expected a Last-Event-ID header or an ?offset query parameter).'

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

export function toHttpStream(
  stream: AsyncIterable<StreamChunk>,
  abortController?: AbortController,
  getId?: (chunk: StreamChunk, index: number) => string | undefined,
): ReadableStream<Uint8Array> {
  const { encodeChunk, encodeError } = ndjsonEncoders(getId)
  return toEncodedStream(stream, abortController, encodeChunk, encodeError)
}

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
