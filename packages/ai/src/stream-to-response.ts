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
import {
  isDurabilityBatchedCustom,
  stripDurabilityBatchHint,
} from './utilities/durability-batch'
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
 * The result of a run that was read to the end, such as `chat({ stream: false })`.
 */
export interface ChatResult {
  /** Concatenated TEXT_MESSAGE_CONTENT deltas. */
  text: string
  /** Every chunk the run produced, in order. */
  chunks: Array<StreamChunk>
}

/**
 * Read a StreamChunk async iterable to the end and return its text and chunks.
 *
 * `text` joins the deltas of every TEXT_MESSAGE_CONTENT event. `chunks` keeps
 * every chunk in order, so tool calls and interrupt outcomes are not lost.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @returns A {@link ChatResult} with the joined text and every chunk.
 * @throws The error from the first RUN_ERROR chunk.
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openaiText('gpt-5.5'),
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * const { text } = await streamToText(stream);
 * console.log(text); // "Hello! How can I help you today?"
 * ```
 */
export async function streamToText(stream: AsyncIterable<StreamChunk>) {
  let text = ''
  const chunks: Array<StreamChunk> = []

  for await (const chunk of stream) {
    if (chunk.type === 'RUN_ERROR') {
      throw runErrorEventToError(chunk)
    }

    chunks.push(chunk)
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      text += chunk.delta
    }
  }

  const result: ChatResult = { text, chunks }
  return result
}

function isChatResult(
  input: ChatResult | AsyncIterable<StreamChunk>,
): input is ChatResult {
  return !(Symbol.asyncIterator in input)
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
  /**
   * Called once when the response body is cancelled on the detach path, BEFORE
   * returning. The durability branch uses it to tell the run its viewer is gone
   * (see `./delivery-disconnect`) without aborting it.
   */
  onDetachedCancel?: () => void,
): ReadableStream<Uint8Array> {
  const cancellation = abortController ?? new AbortController()
  let iterator: AsyncIterator<StreamChunk> | undefined
  let iteratorCleanup: Promise<void> | undefined
  let pumpPromise: Promise<void> = Promise.resolve()
  let pumpFailure: RecordedFailure | undefined
  let cancelled = false
  let resumePump: (() => void) | undefined

  const wakePump = (): void => {
    resumePump?.()
    resumePump = undefined
  }

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
      cancellation.signal.addEventListener('abort', wakePump)
      pumpPromise = (async () => {
        let index = 0
        let iteratorDone = false

        try {
          while (!isAborted(cancellation.signal)) {
            // Keep at most the stream's high-water mark queued for a slow
            // reader. A fresh durable run never waits: its log is the real
            // destination, so a stalled viewer must not stall the run.
            while (
              !detachOnCancel &&
              !cancelled &&
              !isAborted(cancellation.signal) &&
              (controller.desiredSize ?? 0) <= 0
            ) {
              await new Promise<void>((resolve) => {
                resumePump = resolve
              })
            }
            if (isAborted(cancellation.signal)) break
            const result = await iterator.next()
            if (result.done) {
              iteratorDone = true
              break
            }
            if (isAborted(cancellation.signal)) break
            // After a detached cancel the reader is gone but we keep pulling to
            // drain the producer into the durable log; skip enqueuing to the
            // closed controller.
            if (!cancelled) controller.enqueue(encodeChunk(result.value, index))
            index += 1
          }
        } catch (error) {
          recordPumpFailure(error, 'stream iteration failed')
        } finally {
          cancellation.signal.removeEventListener('abort', wakePump)
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
    pull() {
      wakePump()
    },
    async cancel(reason) {
      cancelled = true
      wakePump()
      // Detached durable delivery: the client is gone (e.g. a page reload), but
      // the run must finish into the durable log so a rejoining client can tail
      // it to the real terminal. Do NOT abort the producer (that would kill the
      // run and seal the log with RUN_ERROR) and do NOT await the pump — it
      // keeps draining `stream` → the log in the background and terminates
      // normally on its own. A genuine caller-driven stop aborts the producer's
      // own AbortController instead, which this path never touches.
      //
      // Notify the run FIRST, and synchronously. This is the only moment the
      // socket-closed fact exists anywhere, and the run cannot observe it on its
      // own: it holds no handle on this response. That notification is what lets a
      // durable run record itself as detached while it KEEPS RUNNING — the
      // alternative applications were driven to (mirroring `request.signal` into
      // `chat()`'s abortController) reaches the middleware only by killing the run,
      // which for a sandboxed run means the agent is never even launched.
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

/** The body `toJsonResponse` and `resumeJsonResponse` send, and `fetchJson` reads. */
interface JsonRunBody {
  /** Wire chunks (`toWireChunk` applied), in order. */
  chunks: Array<StreamChunk>
  /** Durable offset of the last chunk. Durable routes only. */
  offset?: string
  /** `false`: the run is still going; ask again from `offset`. */
  done: boolean
}

/**
 * Read `source` into one {@link JsonRunBody}.
 *
 * The body is `done: true` when `source` ends. A thrown error adds a trailing
 * `RUN_ERROR` chunk and is also `done: true`. The body is `done: false` when
 * `maxWaitMs` passes or `signal` aborts first; `onEarlyReply` then decides what
 * happens to the run.
 *
 * After an early reply, `source` is still pulled to its end (a fresh durable
 * run must keep filling its log), unless `stopAfterReply` is set. The pull
 * never rejects, so a background drain cannot become an unhandled rejection.
 */
function collectJsonRunBody(
  source: AsyncIterable<StreamChunk>,
  options: {
    /** Durable offset of a chunk. */
    getId?: (chunk: StreamChunk) => string | undefined
    /** Offset to report while no collected chunk has one (a resume read). */
    offset?: string
    /**
     * Reply early after this many ms. The clock starts once an offset is
     * known, so a `done: false` body always carries the offset to ask from.
     */
    maxWaitMs?: number
    /** Reply early when this aborts. */
    signal?: AbortSignal
    /** Stop pulling `source` after the reply. */
    stopAfterReply: boolean
    onEarlyReply?: (cause: 'timeout' | 'signal') => void
  },
): Promise<JsonRunBody> {
  const { getId, maxWaitMs, signal, stopAfterReply, onEarlyReply } = options
  const chunks: Array<StreamChunk> = []
  let offset = options.offset
  let replied = false
  let timer: ReturnType<typeof setTimeout> | undefined

  return new Promise<JsonRunBody>((resolve) => {
    const reply = (done: boolean): void => {
      replied = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onSignal)
      resolve({ chunks, ...(offset === undefined ? {} : { offset }), done })
    }
    const replyEarly = (cause: 'timeout' | 'signal'): void => {
      if (replied) return
      reply(false)
      onEarlyReply?.(cause)
    }
    const onSignal = (): void => replyEarly('signal')
    const armTimer = (): void => {
      const canArm =
        maxWaitMs !== undefined && timer === undefined && offset !== undefined
      if (canArm) timer = setTimeout(() => replyEarly('timeout'), maxWaitMs)
    }

    armTimer()
    signal?.addEventListener('abort', onSignal, { once: true })

    void (async () => {
      try {
        for await (const chunk of source) {
          if (replied) {
            if (stopAfterReply) break
            continue
          }
          chunks.push(toWireChunk(chunk))
          offset = getId?.(chunk) ?? offset
          armTimer()
        }
      } catch (error) {
        if (!replied) chunks.push(toWireChunk(runErrorChunk(error)))
      }
      if (!replied) reply(true)
    })()

    if (signal?.aborted) onSignal()
  })
}

/**
 * Default headers overridden by the caller's headers. Accepts every
 * `HeadersInit` form: a `Headers` instance, `string[][]`, or a plain object.
 */
function mergeResponseHeaders(
  defaults: Record<string, string>,
  headers: HeadersInit | undefined,
): Headers {
  const merged = new Headers(defaults)
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      merged.set(key, value)
    })
  }
  return merged
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
const DEFAULT_DURABILITY_BATCH = 32

/**
 * Default `batchWaitMs`: the longest a buffered chunk waits for the producer's
 * next chunk before its batch flushes anyway. Chunks are forwarded only AFTER
 * they are appended, so a size-only batch held live text until 32 chunks
 * arrived: a short reply showed up all at once at `RUN_FINISHED`. This bounds
 * that wait and keeps bursts in one `append`, so a remote log still does not
 * pay one write per token.
 */
const DEFAULT_DURABILITY_BATCH_WAIT_MS = 50

/** Largest delay `setTimeout` honors; a larger one fires at once. */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/**
 * Resolve and validate `batchWaitMs`. `NaN`, a negative value, `Infinity`, and
 * anything past the timer limit are rejected: `setTimeout` would turn each of
 * them into an immediate flush, the opposite of what a large value asks for.
 */
function resolveBatchWaitMs(batchWaitMs: number | undefined): number {
  if (batchWaitMs === undefined) return DEFAULT_DURABILITY_BATCH_WAIT_MS
  if (
    !Number.isFinite(batchWaitMs) ||
    batchWaitMs < 0 ||
    batchWaitMs > MAX_TIMER_DELAY_MS
  ) {
    throw new Error(
      `Invalid durability batchWaitMs: ${batchWaitMs}. Must be a number from 0 to ${MAX_TIMER_DELAY_MS}.`,
    )
  }
  return batchWaitMs
}

/**
 * Validate `maxWaitMs` for the JSON helpers. `undefined` means no limit. The
 * same values as {@link resolveBatchWaitMs} are rejected, for the same reason:
 * `setTimeout` would reply at once instead of waiting.
 */
function resolveMaxWaitMs(maxWaitMs: number | undefined): number | undefined {
  if (maxWaitMs === undefined) return undefined
  if (
    !Number.isFinite(maxWaitMs) ||
    maxWaitMs < 0 ||
    maxWaitMs > MAX_TIMER_DELAY_MS
  ) {
    throw new Error(
      `Invalid maxWaitMs: ${maxWaitMs}. Must be a number from 0 to ${MAX_TIMER_DELAY_MS}.`,
    )
  }
  return maxWaitMs
}

/**
 * True when `promise` settles within `ms`. The promise is observed either way,
 * so a rejection that loses the race is not reported as unhandled.
 */
async function settlesWithin(
  promise: Promise<unknown>,
  ms: number,
): Promise<boolean> {
  if (ms <= 0) return false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

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
 * batch size: run-start, terminals, tool-call ends, and CUSTOM events that
 * are not high-volume adapter output.
 *
 * `RUN_STARTED` matters especially for one-shot activities (image, speech,
 * transcription, summarize): they emit `RUN_STARTED`, then await the provider
 * for seconds, then a terminal. Without flushing `RUN_STARTED` the log stays
 * empty for the whole run, so a mount-time `joinRun` finds nothing and its
 * empty-log deadline fast-fails as "run gone" even though the run is alive.
 * Flushing it immediately makes the run resumable from the instant it starts.
 *
 * CUSTOM progress events (compaction, tool progress, middleware) flush at
 * emit time so a live indicator can render. `process.stdout`,
 * `process.stderr`, `sandbox.file`, and `sandbox.file.diff` stay batched.
 * `emitCustomEvent(name, value, { batch: true })` opts a single event into
 * that same batch.
 */
function isDurabilityFlushBoundary(chunk: StreamChunk): boolean {
  return (
    chunk.type === 'RUN_STARTED' ||
    chunk.type === 'RUN_FINISHED' ||
    chunk.type === 'RUN_ERROR' ||
    chunk.type === 'TOOL_CALL_END' ||
    (chunk.type === 'CUSTOM' && !isDurabilityBatchedCustom(chunk))
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
 *   chunks (flushing early at terminal / tool-call boundaries, or once the
 *   oldest buffered chunk has waited `batchWaitMs`), `append` each batch to
 *   the log, then forward. Appending BEFORE forwarding guarantees a
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
    batchWaitMs?: number
    logger?: InternalLogger
  },
): {
  source: AsyncIterable<StreamChunk>
  getId: (chunk: StreamChunk) => string | undefined
} {
  const resumeOffset = durability.resumeFrom()
  const batchSize = resolveBatchSize(options.batch)
  const batchWaitMs = resolveBatchWaitMs(options.batchWaitMs)
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
      offset.includes('\0') ||
      offset.includes('\r') ||
      offset.includes('\n') ||
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
    // Only ever assigned inside the nested flush() closure, which TS's
    // control-flow analysis can't observe (see the disable at the read site).
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
      const toForward = batch.map(stripDurabilityBatchHint)
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
      // Make the run joinable BEFORE the producer is first pulled — the pull
      // is what runs the middleware chain, and middleware may take minutes to
      // yield a first chunk. See {@link RUN_ACCEPTED_EVENT}.
      batch.push({
        type: 'CUSTOM',
        name: RUN_ACCEPTED_EVENT,
        value: {},
        timestamp: Date.now(),
      })
      yield* flush()
      // Iterated by hand, not with `for await`, so the batch can flush while
      // the next chunk is still pending. The `finally` does what `for await`
      // would: close the producer on an early exit, but not after it finished
      // or threw. After a failed timed flush it closes it in the background.
      const iterator = stream[Symbol.asyncIterator]()
      let iteratorFinished = false
      // A timed flush failed while `next` was still pending.
      let pullPending = false
      let flushBy = 0
      try {
        for (;;) {
          const next = iterator.next()
          if (
            batch.length > 0 &&
            !(await settlesWithin(next, flushBy - Date.now()))
          ) {
            try {
              yield* flush()
            } catch (error) {
              pullPending = true
              throw error
            }
          }
          let result: IteratorResult<StreamChunk>
          try {
            result = await next
          } catch (error) {
            iteratorFinished = true
            throw error
          }
          if (result.done) {
            iteratorFinished = true
            break
          }
          if (isAborted(abortController.signal)) break
          const chunk = result.value
          if (batch.length === 0) {
            flushBy = Date.now() + batchWaitMs
          }
          batch.push(chunk)
          if (batch.length >= batchSize || isDurabilityFlushBoundary(chunk)) {
            yield* flush()
          }
        }
      } finally {
        if (pullPending) {
          // An async generator runs `return()` only after its pending pull,
          // so awaiting it here waits for the model's next chunk, maybe
          // forever. Close it in the background: the failure path below must
          // persist RUN_ERROR now, and a failure is never a detach, so nothing
          // below needs the producer's `onAbort` chain to finish first.
          Promise.resolve(iterator.return?.()).catch((error: unknown) => {
            logger?.errors('closing the producer after a failed flush failed', {
              error,
            })
          })
        } else if (!iteratorFinished) {
          await iterator.return?.()
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
      // The PRODUCER was stopped, which is deliberately not the same question as
      // "did the delivery socket go away". A disconnect alone must leave this
      // false: the run survives it and terminalizes this log itself on its way
      // out, and treating the disconnect as a cancel here would make `detached`
      // true for a run that had already finished — skipping `close()` and parking
      // every later tailer forever on a log nobody will ever continue.
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
          for await (const _chunk of flush()) {
            // persist-only: nothing consumes these
          }
        } catch (flushError) {
          recordFailure(flushError, 'flushing buffered chunks on exit failed')
        }
      }

      // Was this abort a DETACH? Only the run's own middleware can say — it is
      // the only actor that has resolved both out-of-band cancel bands and
      // `detachOnDisconnect` — and it says so on the stream itself (see
      // `./delivery-detach`). Read only AFTER the try block above has exited,
      // which is what awaits the chat generator's `return()` and therefore the
      // whole `onAbort` chain that publishes the verdict.
      //
      // Every conjunct is load bearing. `cancelled` keeps a normal finish on
      // today's path. `!isExplicitCancel` is core's own belt-and-braces refusal to
      // spare a run the user deliberately stopped, whatever a middleware claims.
      // `!hasTerminalCause` keeps a GENUINE provider failure
      // terminal even if the socket died too, so a real error is never mistaken
      // for a detach. And `wasRunDetached` is false for an
      // explicit cancel (either band), for a non-detachable disconnect, and for
      // every app that has not wired durability — all of which keep terminalizing
      // and closing exactly as before.
      //
      // What is ALREADY IN THE LOG is deliberately NOT a conjunct. An agent-loop
      // run emits one `RUN_FINISHED` PER ITERATION — the intermediate
      // `finishReason: 'tool_calls'` terminal is flushed at its boundary
      // mid-run — so `terminalPersisted` means "some terminal is in the log",
      // never "the run ended". Gating on it terminalized the log of a healthy,
      // still-running agent for every tool-calling run. Nor can the sink
      // distinguish a final terminal from an intermediate one by its
      // `finishReason`: only the run's middleware knows, and that is exactly
      // what the verdict reports. So a published detach verdict WINS — it
      // already means "the agent is alive and a successor will terminalize this
      // log".
      const detached =
        cancelled &&
        !isExplicitCancel(abortController.signal) &&
        !hasTerminalCause &&
        wasRunDetached(stream)

      if (
        !detached &&
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

      // A detached run's log is deliberately left OPEN: the run is still going,
      // and `close()` would terminalize the log the takeover has to continue —
      // a tailing attach would stop at the prefix, and a stored synthetic
      // `RUN_ERROR` would additionally diverge the takeover's journal replay and
      // record a healthy run as failed.
      //
      // This is NOT the general "fence the close" that `ai-sandbox`'s claim.ts
      // rules out. That fence would suppress `close()` for a run nobody will ever
      // drive again, wedging the record at `'running'` with every tailer parked
      // forever. The skip here is conditional on a verdict that means the exact
      // opposite: the agent is alive and a successor WILL terminalize this log
      // (its own producer exit runs this same `finally`). Keep that distinction —
      // widening this condition to "any abort" re-introduces the wedge.
      if (!detached) {
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
      }

      // Rethrow a terminalization/close failure to the live consumer ONLY when
      // no terminal reached it yet — the transport then synthesizes a live
      // RUN_ERROR so the consumer isn't left without a terminal. If a terminal
      // was already forwarded (the run ended on the wire), a late failure is a
      // server-side cleanup issue; rethrowing it would append a contradictory
      // second terminal (RUN_ERROR after RUN_FINISHED) on the wire. Suppress the
      // rethrow, but never let the cause vanish — record it server-side, the
      // same as the close / terminal-append failures above. (This also covers a
      // provider that throws AFTER emitting its own terminal, whose error is
      // otherwise neither delivered nor logged.)
      if (failure !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- terminalForwarded is set only inside the flush() closure, which TS CFA narrows away here
        if (!terminalForwarded) {
          // eslint-disable-next-line no-unsafe-finally
          throw failure.error
        }
        logger?.errors(
          'durability failure after a terminal event was forwarded',
          {
            error: failure.error,
          },
        )
      }
    }
  }

  async function* replay(offset: TOffset): AsyncIterable<StreamChunk> {
    try {
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
    } catch (error) {
      // The HTTP transports send this to the reader as a RUN_ERROR, but a
      // replay has no producer to log it (`chat()` logs its own failures), so
      // an expired run or a failed backend read would leave no server-side
      // trace. An aborted read is expected teardown, not a failure.
      if (!isAborted(abortController.signal)) {
        logger?.errors('replaying durability stream failed', { error })
      }
      throw error
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
 * controls how many chunks are buffered per `append` (default 32), and
 * `batchWaitMs` how long a buffered chunk waits for more (default 50).
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options (including `abortController`, `durability` with its optional `batch` and `batchWaitMs`, and `debug`)
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
    durability?: {
      adapter: StreamDurability<TOffset>
      /** Most chunks in one `append` (default 32). */
      batch?: number
      /**
       * Most ms a chunk waits in the batch for the next one before the batch
       * is appended and sent anyway (default 50). Chunks reach the client only
       * after their append, so a higher value means fewer writes but slower
       * live text, and `0` appends every chunk on its own.
       */
      batchWaitMs?: number
    }
    /**
     * Customize logging for durability failure paths (replay, terminal-append,
     * and close). These failures are always logged server-side by default (the
     * `errors` category is on even without `debug`, via a `ConsoleLogger`);
     * pass `debug` to route them to a custom `Logger` or raise verbosity. A
     * joiner never learns why a terminal-append or close failed, and a replay
     * failure reaches only its reader, so server-side logging is where the real
     * cause is recoverable.
     */
    debug?: DebugOption
  },
): Response {
  const { headers, abortController, durability, debug, ...responseInit } =
    init ?? {}

  const mergedHeaders = mergeResponseHeaders(
    {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
    headers,
  )

  let body: ReadableStream<Uint8Array>
  if (durability) {
    // A fresh run (not a resume/replay) drains into the durable log under its
    // OWN producer controller, decoupled from the HTTP response: a response
    // cancel (page reload) detaches and keeps draining in the background so a
    // rejoining client tails the log to the real terminal, rather than killing
    // the run and sealing the log with RUN_ERROR. The producer is aborted only
    // by a caller-supplied `abortController` (a genuine stop()). On the resume
    // path the response IS a reader, so a cancel should stop the read normally.
    const isFresh = durability.adapter.resumeFrom() === null
    const producerAbortController = abortController ?? new AbortController()
    const deliveryAbortController = isFresh
      ? new AbortController()
      : producerAbortController
    const { source, getId } = durableStreamSource(stream, durability.adapter, {
      abortController: producerAbortController,
      batch: durability.batch,
      batchWaitMs: durability.batchWaitMs,
      // `errors` category is on by default even when `debug` is undefined, so
      // durability terminal-append / close failures always surface server-side —
      // including on the client-disconnect path where there is no live consumer.
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
    // Validated, not trusted: `record.status` is typed `RunStatus` but comes off
    // a user-implemented `RunStore`, so the type is a claim about a storage
    // column and nothing checked it. An unrecognized value means the run cannot
    // be reasoned about at all — the record says nothing trustworthy about
    // whether an agent is already driving it — so refuse the drive the same way
    // a terminal record does, and still serve the log so a corrupt row does not
    // also blank the transcript.
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
    // A recorded cancel is NOT a status. `requestRunCancel` deliberately writes
    // only `cancelRequested`, so a run cancelled out of band while its driving
    // host had already died stays `'running'` — and the status gate above waves
    // it straight through. Driving it resurrects a run the user explicitly
    // stopped and burns tokens until the TTL expires. The log is still served, so
    // an attaching tab sees the transcript; only the drive is refused.
    //
    // This is the "don't START one" half. Aborting a drive that is ALREADY live
    // when a cancel lands afterwards is a separate, still-open concern.
    if (record.cancelRequested === true) return
    // Captured after narrowing so the closure below sees a definite record
    // rather than the re-widened `let`.
    const active = record

    try {
      await driver.claim(
        { runs: driver.runs, locks: driver.locks, runId },
        async (claim) => {
          // A viewer is attached again, so the detached clock stops. Cleared
          // under the claim so it cannot race the reaper's read.
          //
          // THE REAPER: do NOT reuse `startRunDriver` for reclaiming detached
          // runs. `@tanstack/ai-sandbox`'s `reapDetachedRuns` deliberately does
          // the opposite of this line — it ACTS ON `detachedSince` and must
          // leave the marker intact for its own TTL accounting — so borrowing
          // this path would erase the very evidence the reaper selected the run
          // on, resetting the TTL on every sweep so a detached run could never
          // expire. That is why the reaper has its own drive path.
          //
          // LOG AND CONTINUE. This write is BOOKKEEPING for the reaper's TTL
          // accounting; the claim is already held and the takeover is the
          // valuable part. Letting a rejection propagate would land in the catch
          // below — the channel reserved for the normal "someone else won the
          // lease" case — so one transient store error would silently cost the
          // whole drive, logged only on the `provider` debug channel and
          // therefore invisible at default log levels. The worst case of
          // continuing is a stale `detachedSince` the reaper may act on later;
          // the worst case of vetoing is a run nobody drives at all.
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
  // `driver` MUST be destructured out: `responseInit` is spread into
  // `new Response(body, init)`, so leaving it in would leak the driver object
  // (and its Request) into the response init.
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
 * many chunks are buffered per `append` (default 32), and `batchWaitMs` how
 * long a buffered chunk waits for more (default 50). This shares the exact
 * `durableStreamSource` used by `toServerSentEventsResponse` — only the wire
 * encoding differs.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options (including `abortController`, `durability` with its optional `batch` and `batchWaitMs`, and `debug`)
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
    durability?: {
      adapter: StreamDurability<TOffset>
      /** Most chunks in one `append` (default 32). */
      batch?: number
      /**
       * Most ms a chunk waits in the batch for the next one before the batch
       * is appended and sent anyway (default 50). Chunks reach the client only
       * after their append, so a higher value means fewer writes but slower
       * live text, and `0` appends every chunk on its own.
       */
      batchWaitMs?: number
    }
    /**
     * Customize logging for durability failure paths (replay, terminal-append,
     * and close). These failures are always logged server-side by default (the
     * `errors` category is on even without `debug`, via a `ConsoleLogger`);
     * pass `debug` to route them to a custom `Logger` or raise verbosity. A
     * joiner never learns why a terminal-append or close failed, and a replay
     * failure reaches only its reader, so server-side logging is where the real
     * cause is recoverable.
     */
    debug?: DebugOption
  },
): Response {
  const { abortController, durability, debug, headers, ...responseInit } =
    init ?? {}

  // Default to a streaming NDJSON content type (with no-cache), overridable by
  // user headers. Without an explicit streaming type some intermediaries buffer
  // the response, defeating incremental delivery. Mirrors the SSE helper.
  const mergedHeaders = mergeResponseHeaders(
    { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
    headers,
  )

  let body: ReadableStream<Uint8Array>
  if (durability) {
    // See toServerSentEventsResponse: a fresh run drains into the durable log
    // under its own producer controller, so a response cancel (reload) detaches
    // and keeps draining in the background instead of killing the run; a resume
    // response is a reader whose cancel stops the read normally.
    const isFresh = durability.adapter.resumeFrom() === null
    const producerAbortController = abortController ?? new AbortController()
    const deliveryAbortController = isFresh
      ? new AbortController()
      : producerAbortController
    const { source, getId } = durableStreamSource(stream, durability.adapter, {
      abortController: producerAbortController,
      batch: durability.batch,
      batchWaitMs: durability.batchWaitMs,
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

/** Stream options for {@link toJsonResponse}. */
type JsonResponseInit<TOffset extends string> = ResponseInit & {
  /**
   * Stops the run. Without `durability`, it is also aborted when `signal`
   * aborts. With `durability`, only an explicit `abort()` stops the run.
   */
  abortController?: AbortController
  /**
   * The request's signal (`request.signal`). Without `durability`, an abort
   * stops the run. With `durability`, an abort tells the run its viewer is gone
   * and the run keeps filling its log.
   */
  signal?: AbortSignal
  /**
   * Most ms to wait before replying with the chunks collected so far and
   * `done: false`. The client then asks again from `offset`. Only used with
   * `durability`: without a log there is no way to fetch the rest, so the
   * stream is always read to its end. Default: no limit. A value outside 0 to
   * 2147483647 (or `NaN`) rejects the call.
   */
  maxWaitMs?: number
  durability?: {
    adapter: StreamDurability<TOffset>
    /** Most chunks in one `append` (default 32). */
    batch?: number
    /**
     * Most ms a chunk waits in the batch for the next one before the batch is
     * appended anyway (default 50).
     */
    batchWaitMs?: number
  }
  /**
   * Customize logging for durability failure paths (replay, terminal-append,
   * and close). See {@link toHttpResponse}.
   */
  debug?: DebugOption
}

/** Default `maxWaitMs` for {@link resumeJsonResponse}. */
const DEFAULT_RESUME_JSON_MAX_WAIT_MS = 1000

/**
 * Send a chat run as one JSON body, for hosts that cannot stream a response.
 * Pair it with the `fetchJson` connection adapter.
 *
 * The body is `{ chunks, offset?, done }`:
 * - `chunks`: every chunk, encoded for the wire like the SSE and NDJSON helpers.
 * - `offset`: the durable offset of the last chunk (durable routes only).
 * - `done`: `false` when the run is still going. The client asks again with
 *   `GET ?runId=<id>&offset=<offset>`, served by {@link resumeJsonResponse}.
 *
 * Pass a `ChatResult` from `chat({ stream: false })` to send it as is. Pass a
 * stream to read it here. Without `durability` the stream is read to its end.
 * With `durability`, a fresh run fills the log, and the reply goes out when the
 * run ends or when `maxWaitMs` passes, whichever is first. The run keeps going
 * after an early reply. A request with a resume offset reads the log instead.
 *
 * @param input - A `ChatResult`, or a StreamChunk async iterable from chat()
 * @param init - Response init. For a stream, also `abortController`, `signal`, `maxWaitMs`, `durability`, and `debug`.
 * @returns A promise of a JSON Response
 *
 * @example
 * ```typescript
 * // A finished result
 * export async function POST(request: Request) {
 *   const result = await chat({
 *     adapter: openaiText('gpt-5.5'),
 *     messages: [...],
 *     stream: false,
 *   });
 *   return toJsonResponse(result);
 * }
 *
 * // A durable stream that replies at least once a second
 * export async function POST(request: Request) {
 *   const stream = chat({ adapter: openaiText('gpt-5.5'), messages: [...] });
 *   return toJsonResponse(stream, {
 *     durability: { adapter: memoryStream(request) },
 *     signal: request.signal,
 *     maxWaitMs: 1000,
 *   });
 * }
 * ```
 */
export function toJsonResponse(
  result: ChatResult,
  init?: ResponseInit,
): Promise<Response>
export function toJsonResponse<TOffset extends string = string>(
  stream: AsyncIterable<StreamChunk>,
  init?: JsonResponseInit<TOffset>,
): Promise<Response>
export async function toJsonResponse<TOffset extends string = string>(
  input: ChatResult | AsyncIterable<StreamChunk>,
  init?: JsonResponseInit<TOffset>,
) {
  const {
    abortController,
    signal,
    maxWaitMs: rawMaxWaitMs,
    durability,
    debug,
    headers,
    ...responseInit
  } = init ?? {}
  const maxWaitMs = resolveMaxWaitMs(rawMaxWaitMs)
  const body = isChatResult(input)
    ? { chunks: input.chunks.map(toWireChunk), done: true }
    : await collectStreamBody(input, {
        abortController,
        signal,
        maxWaitMs,
        durability,
        debug,
      })
  return new Response(JSON.stringify(body), {
    ...responseInit,
    headers: mergeResponseHeaders(
      { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      headers,
    ),
  })
}

/** The stream half of {@link toJsonResponse}. */
async function collectStreamBody<TOffset extends string>(
  stream: AsyncIterable<StreamChunk>,
  options: Pick<
    JsonResponseInit<TOffset>,
    'abortController' | 'signal' | 'maxWaitMs' | 'durability' | 'debug'
  >,
) {
  const { abortController, signal, maxWaitMs, durability, debug } = options

  if (!durability) {
    // No log to fetch the rest from, so read to the end. Like toHttpResponse,
    // the run stops when the client goes away.
    const cancellation = abortController ?? new AbortController()
    const stop = (): void => cancellation.abort(signal?.reason)
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) stop()
    const body = await collectJsonRunBody(stream, {
      signal: cancellation.signal,
      stopAfterReply: true,
    })
    signal?.removeEventListener('abort', stop)
    const result: JsonRunBody = { chunks: body.chunks, done: true }
    return result
  }

  // See toServerSentEventsResponse: a fresh run drains into the durable log
  // under its own producer controller, so a gone client does not kill the run.
  // A resume request is a reader, so an early reply stops the read.
  const resumeOffset = durability.adapter.resumeFrom()
  const isFresh = resumeOffset === null
  const producerAbortController = abortController ?? new AbortController()
  const { source, getId } = durableStreamSource(stream, durability.adapter, {
    abortController: producerAbortController,
    batch: durability.batch,
    batchWaitMs: durability.batchWaitMs,
    logger: resolveDebugOption(debug),
  })
  return collectJsonRunBody(source, {
    getId,
    offset: resumeOffset ?? undefined,
    maxWaitMs,
    signal,
    stopAfterReply: !isFresh,
    onEarlyReply: (cause) => {
      if (!isFresh) {
        producerAbortController.abort()
        return
      }
      // Fresh runs only: the client left while the request was open. Tell the
      // run, and keep it going. A timeout is not a disconnect: the client asks
      // again from `offset`.
      if (cause === 'signal') notifyRunDisconnected(stream)
    },
  })
}

/**
 * Serve a resumable run from its durability log as one JSON body, without
 * re-running the model. The JSON counterpart of
 * {@link resumeServerSentEventsResponse}; pair it with a `toJsonResponse`
 * producer. `fetchJson` calls it with `?runId=<id>&offset=<offset>` while a
 * reply says `done: false`, and with `offset=-1` to join a run from the start.
 *
 * The reply holds every chunk strictly after the offset. It is `done: true`
 * once the log is closed, or `done: false` after `maxWaitMs` (default 1000) on a
 * run that is still going. Returns a 400 when the request carries no resume
 * offset (no `Last-Event-ID` header and no `?offset`).
 *
 * @example
 * ```typescript
 * export async function GET(request: Request) {
 *   return resumeJsonResponse({ adapter: memoryStream(request) });
 * }
 * ```
 */
export async function resumeJsonResponse<TOffset extends string = string>(
  options: ResumeResponseOptions<TOffset> & {
    /**
     * Most ms to wait for the log to close before replying (default 1000). A
     * value outside 0 to 2147483647 (or `NaN`) rejects the call.
     */
    maxWaitMs?: number
  },
) {
  // See `resumeServerSentEventsResponse`: `driver` must not reach `responseInit`.
  const { adapter, batch, debug, driver, maxWaitMs, ...responseInit } = options
  const waitMs = resolveMaxWaitMs(maxWaitMs) ?? DEFAULT_RESUME_JSON_MAX_WAIT_MS
  if (adapter.resumeFrom() === null) {
    return new Response(NO_RESUME_OFFSET, { status: 400 })
  }
  maybeStartRunDriver(driver)
  return toJsonResponse(emptyDurableSource(), {
    ...responseInit,
    durability: { adapter, batch },
    debug,
    maxWaitMs: waitMs,
  })
}
