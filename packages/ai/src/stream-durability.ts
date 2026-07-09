import type { StreamChunk } from './types'

/**
 * A pluggable sink for **delivery durability** — the transport-layer concern of
 * letting a client disconnect, reload, or open a second tab and still receive
 * the full, ordered run stream exactly once.
 *
 * This is deliberately thin: append / read / resume-detect and nothing else. It
 * stores no run status, no messages, no interrupts — those are *state*
 * durability (the middleware layer). Keeping this interface small is what stops
 * delivery durability drifting back into "a transport wearing a store costume".
 *
 * Adapters close over the incoming `Request` (that is why they are constructed
 * as `memoryStream(request)` / `durableStream(request, opts)`), so `request`
 * never pollutes the transport-helper signature.
 *
 * Offsets are opaque strings of the form `runId@seq` (see {@link encodeOffset}).
 * The sentinels `-1` (from the start) and `now` (tail — only future writes) may
 * appear in the seq position.
 */
export interface StreamDurability {
  /**
   * The offset to resume from, read off the captured request — the
   * `Last-Event-ID` header (native `EventSource` reconnect) or, failing that,
   * the `?offset` query param. Returns `null` for a fresh run (produce path).
   */
  resumeFrom: () => string | null
  /**
   * The stable run/stream id for this request. Minted (`crypto.randomUUID()`)
   * for a fresh run; parsed from the resume offset / `?runId` param otherwise.
   * Memoized so repeated calls return the same id.
   */
  runId: () => string
  /**
   * Append a batch of chunks. The first chunk takes sequence number `startSeq`,
   * the next `startSeq + 1`, and so on (sequence numbers are 1-based).
   *
   * Resolves to a per-chunk array of the **resume offsets the transport should
   * tag each chunk with** (its client-facing SSE `id:`), aligned position-for-
   * position with `chunks`. An element is `undefined` when that chunk carries
   * no resumable offset.
   *
   * The offsets MUST be the offsets the backend will actually accept on a
   * `read(offset)` resume — never a transport-local counter — so a reconnect
   * resumes against the real backend key space:
   *
   * - {@link memoryStream} tags **every** chunk (`runId@seq`), because its log
   *   is per-chunk addressable.
   * - `durableStream` also tags **every** chunk: it POSTs chunks one-by-one and
   *   reads back each chunk's own backend offset, so the returned array is fully
   *   populated (no `undefined`) and a mid-batch reconnect resumes at the exact
   *   chunk it dropped on — exactly-once at any batch size.
   *
   * A backend that could only learn a coarser (e.g. per-batch) offset would
   * return `undefined` for the untagged chunks; the client then relies on
   * id-keyed de-dup for a partial replay. Prefer per-chunk tagging so exactly-
   * once does not depend on client de-dup.
   */
  append: (
    chunks: Array<StreamChunk>,
    startSeq: number,
  ) => Promise<Array<string | undefined>>
  /**
   * Replay the chunks strictly after `offset`. Pass `-1` (or an offset whose
   * seq is `-1`) to replay from the start. Yields `{ seq, chunk }` in order.
   *
   * An optional `signal` bounds a live-tailing read: when it aborts, the read
   * stops waiting for further appends and ends. Without it, a join to a runId
   * with no in-process producer (a crash, a cross-instance run, or a bogus id)
   * would park forever.
   */
  read: (
    offset: string,
    signal?: AbortSignal,
  ) => AsyncIterable<{ seq: number; chunk: StreamChunk }>
  /**
   * Mark the run terminated so a concurrently live-tailing {@link read} (a
   * mid-stream join / reconnect) stops waiting for further appends and returns.
   * Called by the producer when the source stream ends — whether it ended with
   * a terminal event, a thrown error, or simply ran dry. Optional: backends
   * that detect completion from the stored terminal event (or their own
   * close signal) need not implement it.
   */
  markComplete?: () => void
}

/**
 * Encode a durability offset. The format is `runId@seq`; the seq may be a
 * 1-based sequence number, or the sentinel `-1` (from start) / `now` (tail).
 */
export function encodeOffset(runId: string, seq: number | 'now'): string {
  return `${runId}@${seq}`
}

/**
 * The seq token of an offset — the substring after the LAST `@`, or the whole
 * string when there is no `@` (a bare seq token).
 */
function seqTokenOf(offset: string): string {
  return offset.includes('@')
    ? offset.slice(offset.lastIndexOf('@') + 1)
    : offset
}

/**
 * Parse a seq token into its numeric value. The sentinels agree with
 * {@link seqThreshold}: `-1` / `''` (from start) → `-1`, `now` (tail) →
 * `+Infinity`. Throws only on a genuinely malformed (non-sentinel,
 * non-numeric) token — never on a sentinel.
 */
function parseSeqToken(token: string): number {
  if (token === '' || token === '-1') return -1
  if (token === 'now') return Number.POSITIVE_INFINITY
  const n = Number(token)
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid durability offset seq: ${token}`)
  }
  return n
}

/**
 * The run id of a `runId@seq` offset — everything before the LAST `@`, so run
 * ids that themselves contain `@` round-trip. Deliberately does NOT parse the
 * seq, so the sentinels `now` / `-1` (and any future seq form) never make run
 * id extraction throw. When there is no `@`, the whole string is the run id.
 */
export function runIdOf(offset: string): string {
  const at = offset.lastIndexOf('@')
  return at === -1 ? offset : offset.slice(0, at)
}

/**
 * Decode a `runId@seq` offset. Splits on the LAST `@` so run ids that
 * themselves contain `@` round-trip. The seq is parsed via the shared sentinel
 * logic, so `runId@now` (→ `+Infinity`) and `runId@-1` (→ `-1`) decode without
 * throwing; only a missing `@` or a non-sentinel non-numeric seq throws.
 */
export function decodeOffset(offset: string): { runId: string; seq: number } {
  const at = offset.lastIndexOf('@')
  if (at === -1) {
    throw new Error(`Invalid durability offset (missing @): ${offset}`)
  }
  return {
    runId: offset.slice(0, at),
    seq: parseSeqToken(offset.slice(at + 1)),
  }
}

/**
 * Resolve the seq threshold a `read(offset)` should replay strictly after.
 * Understands full `runId@seq` offsets and bare seq tokens, plus the sentinels
 * `-1` (from start; threshold `-1` so every 1-based seq qualifies) and `now`
 * (tail → `+Infinity`, so no already-stored chunk qualifies).
 */
function seqThreshold(offset: string): number {
  return parseSeqToken(seqTokenOf(offset))
}

/**
 * Reject a run id that would break SSE framing if it flowed into an `id:` line.
 * A caller-supplied `?runId` (or a reconnect `Last-Event-ID`) is untrusted; a
 * CR/LF in it could inject or split SSE events once it is emitted as
 * `id: {runId}@{seq}`. Throws rather than silently sanitizing.
 */
function assertValidRunId(runId: string): string {
  if (/[\r\n]/.test(runId)) {
    throw new Error(
      `Invalid runId (must not contain CR/LF): ${JSON.stringify(runId)}`,
    )
  }
  return runId
}

function readResumeOffset(request: Request): string | null {
  const header = request.headers.get('Last-Event-ID')
  if (header) return header
  try {
    const param = new URL(request.url).searchParams.get('offset')
    if (param) return param
  } catch {
    // A relative / opaque URL has no query string to parse — treat as fresh.
  }
  return null
}

function runIdFor(request: Request, resumeOffset: string | null): string {
  if (resumeOffset && resumeOffset.includes('@')) {
    // Extract without parsing the seq, so a `runId@now` / `runId@-1` sentinel
    // resume offset yields the run id instead of throwing.
    return assertValidRunId(runIdOf(resumeOffset))
  }
  try {
    const param = new URL(request.url).searchParams.get('runId')
    if (param) return assertValidRunId(param)
  } catch (err) {
    // Re-throw a CR/LF rejection; swallow only the URL-parse failure (a
    // relative / opaque URL has no query string) and fall through to minting.
    if (err instanceof Error && err.message.startsWith('Invalid runId')) {
      throw err
    }
  }
  return crypto.randomUUID()
}

/** Terminal chunk types after which a run's delivery log is complete. */
function isTerminalChunk(chunk: StreamChunk): boolean {
  return chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
}

/**
 * One run's in-process delivery log: the ordered entries, a `complete` flag
 * (set once the run terminates), and the waiters a live-tailing `read` parks on
 * until the next append or completion.
 */
interface MemoryLog {
  entries: Array<{ seq: number; chunk: StreamChunk }>
  complete: boolean
  waiters: Array<() => void>
}

/**
 * Process-local delivery log, shared across requests so a second tab / reconnect
 * hitting the same server instance can replay an in-flight or finished run.
 *
 * ponytail: process-local map, dev/test backend only. It is NOT durable across
 * restarts and NOT shared across instances — production uses `durableStream`
 * (the durable-streams protocol adapter) instead.
 */
const memoryLogs = new Map<string, MemoryLog>()

function getOrCreateLog(id: string): MemoryLog {
  let log = memoryLogs.get(id)
  if (!log) {
    log = { entries: [], complete: false, waiters: [] }
    memoryLogs.set(id, log)
  }
  return log
}

/** Wake every waiter parked on a live-tailing read of this log. */
function wakeWaiters(log: MemoryLog): void {
  const waiters = log.waiters
  log.waiters = []
  for (const wake of waiters) wake()
}

/**
 * The zero-infrastructure {@link StreamDurability} backend: an in-process log.
 *
 * Perfect for local dev and tests — a reconnect or second tab that reaches the
 * same process replays the ordered stream. It does NOT survive a restart and is
 * NOT shared across server instances; swap in `durableStream` from
 * `@tanstack/ai-durable-stream` for production.
 */
export function memoryStream(request: Request): StreamDurability {
  const resumeOffset = readResumeOffset(request)
  let cachedRunId: string | undefined

  const runId = (): string => {
    if (cachedRunId === undefined) {
      cachedRunId = runIdFor(request, resumeOffset)
    }
    return cachedRunId
  }

  return {
    resumeFrom: () => resumeOffset,
    runId,
    append: async (chunks, startSeq) => {
      const id = runId()
      const log = getOrCreateLog(id)
      // Every chunk is per-chunk addressable in this log's own key space, so
      // tag each with its `runId@seq` offset — that IS the offset a resumer
      // passes back to `read`.
      const offsets = chunks.map((chunk, i) => {
        const seq = startSeq + i
        log.entries.push({ seq, chunk })
        if (isTerminalChunk(chunk)) log.complete = true
        return encodeOffset(id, seq)
      })
      wakeWaiters(log)
      return offsets
    },
    markComplete: () => {
      const log = getOrCreateLog(runId())
      log.complete = true
      wakeWaiters(log)
    },
    read: async function* (offset, signal) {
      const id = runId()
      const threshold = seqThreshold(offset)
      const log = getOrCreateLog(id)
      // Live-tail: drain everything currently past the threshold, then park on
      // the next append until a terminal chunk is read or the run is marked
      // complete. Without this, a mid-stream join returns at the current tail
      // BEFORE the run finishes, truncating the joiner's view.
      let index = 0
      for (;;) {
        while (index < log.entries.length) {
          const entry = log.entries[index]
          index += 1
          if (entry && entry.seq > threshold) {
            yield entry
            if (isTerminalChunk(entry.chunk)) return
          }
        }
        if (log.complete) return
        // A consumer that already aborted must not park.
        if (signal?.aborted) return
        // Park until the next append / completion, OR the consumer aborts.
        // Threading the abort wake is what stops a join to a runId with no
        // in-process producer (crash, cross-instance, or bogus id) — whose log
        // is created empty here and never gets a `markComplete` — from parking
        // forever: the caller bounds it with its request/consumer signal.
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            const i = log.waiters.indexOf(wake)
            if (i !== -1) log.waiters.splice(i, 1)
            resolve()
          }
          const wake = () => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
          }
          log.waiters.push(wake)
          signal?.addEventListener('abort', onAbort)
        })
        if (signal?.aborted) return
      }
    },
  }
}
