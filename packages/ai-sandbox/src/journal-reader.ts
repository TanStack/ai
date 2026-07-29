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
 */
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

async function* followJournal(
  handle: SandboxHandle,
  options: ReadJournalOptions,
): AsyncIterable<JournalLine> {
  const fromByte = options.fromByte ?? 0
  const proc = await handle.process.spawn(
    journalFollowCommand(options.paths, fromByte),
    processOptions(options),
  )
  try {
    yield* toJournalLines(
      encodeUtf8Stream(untilAborted(proc.stdout, options.signal)),
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
  let position = options.fromByte ?? 0
  while (!options.signal?.aborted) {
    const result = await handle.process.exec(
      journalReadCommand(options.paths, position),
      processOptions(options),
    )
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

/** Read a run's journal as positioned lines. */
export function readJournal(
  handle: SandboxHandle,
  options: ReadJournalOptions,
): AsyncIterable<JournalLine> {
  const strategy = options.strategy ?? journalReadStrategy(handle)
  return strategy === 'follow'
    ? followJournal(handle, options)
    : pollJournal(handle, options)
}
