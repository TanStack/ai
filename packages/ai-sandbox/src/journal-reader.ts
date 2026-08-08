/**
 * Read a run's journal, live or after the fact, on one code path.
 *
 * Resume is not a special case: every read is `tail -c +N` for some N, and a
 * fresh run is simply N = 0. That is deliberate — `pid` is `-1` on five of six
 * providers, so re-attaching to an existing reader is impossible and a resumed
 * read always spawns a new `tail` anyway.
 *
 * Two strategies, chosen by capability rather than by provider name:
 *
 * - **follow** (`spawn` + `tail -f`): the default. Streams with no polling cost
 *   and is killed when the consumer stops. Its command pipes into nothing — see
 *   `journal.ts` rule 2 — so this path re-encodes the provider's decoded text
 *   rather than decoding a base64 frame.
 * - **poll** (bounded `exec`, no `-f`): for a provider whose spawned process
 *   cannot be stopped. Cloudflare's `kill()` is a documented no-op and it
 *   forwards the AbortSignal to neither `exec` nor `spawn`, so a `tail -f`
 *   there would run forever inside the container. Every poll command terminates
 *   on its own, so nothing needs killing.
 *
 * **Neither strategy may wait forever for its FIRST byte.** This is the bound
 * that used to be missing, and its absence was reachable three ways, one of them
 * self-inflicted:
 *
 * 1. `journalFollowCommand` CREATES the journal before tailing it (`: >> file`),
 *    which it must, so a read for a runId whose journal never existed
 *    manufactures an empty file and tails it forever. The attach preflight
 *    (`attach-preflight.ts`) catches most of those, but it is wired at exactly
 *    one call site and only for `attach === true` — the exported
 *    {@link readJournal} that `docs/sandbox/journal.md` tells users to write has
 *    no preflight, no store, and no runId to look one up with.
 * 2. The preflight's own probe can be unusable, and it deliberately falls through
 *    to a bounded wait rather than skipping; a journal that exists but is
 *    abandoned still reaches the reader.
 * 3. SIGKILL/OOM of the agent's shell between its last line and its sentinel
 *    `printf` leaves a real, non-empty, permanently-silent journal.
 *
 * So a read that receives NO bytes within {@link DEFAULT_ATTACH_JOURNAL_WAIT_MS}
 * raises {@link JournalAttachUnavailableError} with reason `'journal-stalled'`
 * instead of parking. The bound is on the FIRST byte only, deliberately: once the
 * journal is producing, how long the agent thinks between lines is the agent's
 * business and no deadline here may cut a healthy run short. A consumer abort is
 * not a stall — it ends the read quietly, as it always did.
 */
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
const ABORTED = Symbol('journal-read-aborted')

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
      if (next === ABORTED || next.done === true) return
      yield next.value
    }
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
    // NOT awaited. On an async generator, `return()` queues behind the pending
    // `next()` we just abandoned, so awaiting it would block for exactly as
    // long as the stream we gave up waiting for — reintroducing the hang this
    // helper exists to remove. The rejection is swallowed for the same reason
    // `kill` is best-effort below: the source may already be gone.
    void iterator.return?.().catch(() => {})
  }
}

/** Resolution of the first-byte race in {@link withFirstByteDeadline}. */
const STALLED = Symbol('journal-read-stalled')

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
    // NOT awaited, for the reason `untilAborted` documents: on the stall path the
    // abandoned `next()` is exactly the promise that never settles, so awaiting
    // the `return()` queued behind it would reinstate the hang being reported.
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
    // The consumer may stop early (client gone, lease lost). Providers whose
    // `kill` is real stop the `tail` here; the signal covers the rest. Guarded
    // because a `finally` that throws would replace the consumer's own reason
    // for stopping.
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
  // Same bound as the follow path, expressed the way a polling loop can enforce
  // it: an empty frame every time until the deadline is a stalled journal, and
  // parking here forever is the same defect from the other strategy.
  const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs
  let sawBytes = false
  let position = options.fromByte ?? 0
  while (!options.signal?.aborted) {
    const result = await handle.process.exec(
      journalReadCommand(options.paths, position),
      processOptions(options),
    )
    if (result.stdout.trim() !== '') sawBytes = true
    if (
      !sawBytes &&
      deadline !== undefined &&
      timeoutMs !== undefined &&
      Date.now() >= deadline
    ) {
      throw stalled(options, timeoutMs)
    }
    // Each poll re-reads from `position`, so a line left incomplete by the
    // previous poll is simply re-fetched whole. That is why `position` advances
    // only on a COMPLETE line: advancing on bytes received would strand a
    // partial line's prefix and corrupt every following line.
    for await (const line of toJournalLines(
      decodeBase64Stream(singleValue(result.stdout)),
      position,
    )) {
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
  const strategy = options.strategy ?? journalReadStrategy(handle)
  return strategy === 'follow'
    ? followJournal(handle, options)
    : pollJournal(handle, options)
}
