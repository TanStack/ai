import {
  DEFAULT_ATTACH_JOURNAL_WAIT_MS,
  JournalAttachUnavailableError,
} from './attach-preflight'
import { journalFollowCommand, journalReadCommand } from './journal'
import {
  decodeBase64Stream,
  encodeUtf8Stream,
  toJournalLines,
} from './journal-bytes'
import type { JournalPaths } from './journal'
import type { JournalLine } from './journal-bytes'
import type { ProcessOptions, SandboxHandle } from './contracts'

/**
 * Poll interval for the bounded-`exec` strategy. Matches the interval
 * `ai-sandbox-cloudflare`'s run-log Durable Object already uses, so the two
 * readers have the same latency profile.
 */
export const DEFAULT_JOURNAL_POLL_MS = 250

export interface ReadJournalOptions {
  paths: JournalPaths
  /**
     * Count of journal bytes already consumed. The read starts at the next byte.
     * Defaults to 0, which is also what a takeover uses: the alignment step, not
     * the reader, decides what has already been delivered.
     */
  fromByte?: number
  /** Stop reading. On the follow strategy this also kills the `tail`. */
  signal?: AbortSignal
  /** Override the capability-derived strategy. Tests and diagnostics only. */
  strategy?: 'follow' | 'poll'
  /** Poll strategy only. Defaults to {@link DEFAULT_JOURNAL_POLL_MS}. */
  pollIntervalMs?: number
  /** Working directory for the read command. Paths are absolute, so rarely needed. */
  cwd?: string
  /**
     * How long to wait for the FIRST byte of the journal before failing with
     * `'journal-stalled'`. Defaults to {@link DEFAULT_ATTACH_JOURNAL_WAIT_MS} — the
     * same number that bounds the attach preflight, because it bounds the same
     * question from the other side. `0` or a non-finite value disables the bound;
     * do that only where some OTHER deadline already covers the read, since an
     * unbounded read of an empty journal never returns.
     *
     * Only the first byte is bounded. An agent that streams slowly is never cut
     * off.
     */
  firstByteTimeoutMs?: number
  /**
     * Run id, for the stall error's message only. Defaults to naming the journal
     * path, which is always available and always identifies the run uniquely.
     */
  runId?: string
}

/**
 * Which read strategy a provider supports.
 *
 * Keyed on capabilities, never on `handle.provider`: a BYO provider with the
 * same limitation must get the same treatment, and name-sniffing would silently
 * hand it an unstoppable `tail -f`.
 */
export function journalReadStrategy(handle: SandboxHandle): 'follow' | 'poll' {
  const { backgroundProcesses, killableProcesses } = handle.capabilities
  return backgroundProcesses && killableProcesses ? 'follow' : 'poll'
}

function processOptions(options: ReadJournalOptions): ProcessOptions {
  return {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
}

/** Resolution of the abort race in {@link untilAborted}. Never a stream value. */
const /** Resolution of the abort race in {@link untilAborted}. Never a stream value. */
ABORTED = Symbol('journal-read-aborted')

/**
 * Iterate `source` but stop the moment `signal` fires, instead of waiting for
 * the stream to close.
 *
 * Without this, aborting a follow read only *asks* the provider to kill `tail`
 * and then blocks on `stdout` until that kill closes the pipe — which is not a
 * guarantee any provider makes. On local-process/Windows, `killTree` falls back
 * to signalling only the `sh` wrapper if `taskkill` is unavailable, leaving the
 * `tail` grandchild holding the stdout pipe open, and the read rides past its
 * own AbortSignal until some outer timeout fires. The signal is the caller's
 * contract with the reader, so the reader honors it itself and treats the kill
 * as best-effort cleanup. (local-process now also verifies the tree is gone and
 * sweeps the MSYS grandchildren `taskkill /T` cannot reach, but that is a
 * provider improving its best effort — not a guarantee this reader may assume of
 * any provider.)
 */
async function* untilAborted<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal | undefined,
): AsyncIterable<T> {
  if (!signal) {
    yield* source
    return
  }
  if (signal.aborted) return
  let onAbort: (() => void) | undefined
  const aborted = new Promise<typeof ABORTED>((resolve) => {
    onAbort = () => resolve(ABORTED)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  const iterator = source[Symbol.asyncIterator]()
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), aborted])
      if (next === ABORTED) return
      if (next.done === true) return
      yield next.value
    }
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
    void iterator.return?.().catch(() => {})
  }
}

/** Resolution of the first-byte race in {@link withFirstByteDeadline}. */
const /** Resolution of the first-byte race in {@link withFirstByteDeadline}. */
STALLED = Symbol('journal-read-stalled')

/** The bound in effect for a read; `undefined` when the caller disabled it. */
function firstByteTimeout(options: ReadJournalOptions): number | undefined {
  const ms = options.firstByteTimeoutMs ?? DEFAULT_ATTACH_JOURNAL_WAIT_MS
  return Number.isFinite(ms) && ms > 0 ? ms : undefined
}

/**
 * The `'journal-stalled'` failure, shared by both strategies so the two report
 * the same diagnosis for the same state.
 */
function stalled(
  options: ReadJournalOptions,
  timeoutMs: number,
): JournalAttachUnavailableError {
  return new JournalAttachUnavailableError(
    options.runId ?? options.paths.journal,
    'journal-stalled',
    `its journal (${options.paths.journal}) delivered no bytes within ${timeoutMs}ms. ` +
      `The file exists but nothing is appending to it and no '__exit' sentinel can arrive, ` +
      `so following it would never return: either the read created it itself (a runId with no journal), ` +
      `or the agent's shell was killed before it could write its sentinel.`,
  )
}

/**
 * Pass `source` through unchanged, except that receiving NO value within
 * `timeoutMs` throws.
 *
 * Only the first value is raced. After it, the source is iterated directly, so a
 * long gap between later values costs nothing and cannot fail a healthy read.
 *
 * A source that simply ENDS before the deadline is not a stall — that is the
 * consumer's abort (`untilAborted` returns on abort) or a `tail` that exited —
 * and it returns quietly, preserving the "an abort diagnoses nothing" rule.
 */
async function* withFirstByteDeadline<T>(
  source: AsyncIterable<T>,
  timeoutMs: number | undefined,
  onStall: () => JournalAttachUnavailableError,
): AsyncIterable<T> {
  if (timeoutMs === undefined) {
    yield* source
    return
  }
  const iterator = source[Symbol.asyncIterator]()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<typeof STALLED>((resolve) => {
    timer = setTimeout(() => resolve(STALLED), timeoutMs)
  })
  try {
    const first = await Promise.race([iterator.next(), expired])
    if (first === STALLED) throw onStall()
    if (first.done === true) return
    yield first.value
    for (;;) {
      const next = await iterator.next()
      if (next.done === true) return
      yield next.value
    }
  } finally {
    clearTimeout(timer)
    void iterator.return?.().catch(() => {})
  }
}

async function* followJournal(
  handle: SandboxHandle,
  options: ReadJournalOptions,
): AsyncIterable<JournalLine> {
  const fromByte = options.fromByte ?? 0
  const proc = await handle.process.spawn(
    journalFollowCommand(options.paths, fromByte),
    processOptions(options),
  )
  const timeoutMs = firstByteTimeout(options)
  try {
    yield* toJournalLines(
      encodeUtf8Stream(
        withFirstByteDeadline(
          untilAborted(proc.stdout, options.signal),
          timeoutMs,
          // Narrowed by `withFirstByteDeadline` only calling this when the bound
          // is in effect; `?? 0` keeps that provable without an assertion.
          () => stalled(options, timeoutMs ?? 0),
        ),
      ),
      fromByte,
    )
  } finally {
    try {
      await proc.kill()
    } catch {
      // Best effort: the process may already be gone.
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(finish, ms)
    function finish(): void {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    signal?.addEventListener('abort', finish, { once: true })
  })
}

async function* singleValue(value: string): AsyncIterable<string> {
  yield value
}

async function* pollJournal(
  handle: SandboxHandle,
  options: ReadJournalOptions,
): AsyncIterable<JournalLine> {
  const intervalMs = options.pollIntervalMs ?? DEFAULT_JOURNAL_POLL_MS
  const timeoutMs = firstByteTimeout(options)
  const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs
  let sawBytes = false
  let position = options.fromByte ?? 0
  while (!options.signal?.aborted) {
    const result = await handle.process.exec(
      journalReadCommand(options.paths, position),
      processOptions(options),
    )
    if (result.stdout.trim() !== '') sawBytes = true
    const isAttachStalled =
      !sawBytes &&
      deadline !== undefined &&
      timeoutMs !== undefined &&
      Date.now() >= deadline
    if (isAttachStalled) {
      throw stalled(options, timeoutMs)
    }
    const journalLines = toJournalLines(
      decodeBase64Stream(singleValue(result.stdout)),
      position,
    )
    for await (const line of journalLines) {
      yield line
      position = line.endPosition
    }
    if (options.signal?.aborted) return
    await sleep(intervalMs, options.signal)
  }
}

/**
 * Read a run's journal as positioned lines.
 *
 * **This is a public entry point and it CANNOT hang.** It has no `RunStore` in
 * its signature and no runId to look one up with, so it cannot run the
 * `attach-preflight.ts` gate that classifies a stale or mistyped runId as
 * `'unknown-run'`/`'terminal-run'`; what it has instead is the unconditional
 * bound described in the module doc. A runId with no journal therefore fails with
 * {@link JournalAttachUnavailableError} (`reason: 'journal-stalled'`) after
 * {@link DEFAULT_ATTACH_JOURNAL_WAIT_MS} rather than tailing an empty file it
 * just created, for ever, with no error and no log line. Callers that DO have a
 * store — `runner.ts` on an attach — run the preflight as well, for the sharper
 * diagnosis.
 */
export function readJournal(
  handle: SandboxHandle,
  options: ReadJournalOptions,
): AsyncIterable<JournalLine> {
  /** Override the capability-derived strategy. Tests and diagnostics only. */
  const strategy = options.strategy ?? journalReadStrategy(handle)
  return strategy === 'follow'
    ? followJournal(handle, options)
    : pollJournal(handle, options)
}
