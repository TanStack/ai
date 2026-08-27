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

export const DEFAULT_JOURNAL_POLL_MS = 250

export interface ReadJournalOptions {
  paths: JournalPaths
  fromByte?: number
  /** Stop reading. On the follow strategy this also kills the `tail`. */
  signal?: AbortSignal
  /** Override the capability-derived strategy. Tests and diagnostics only. */
  strategy?: 'follow' | 'poll'
  /** Poll strategy only. Defaults to {@link DEFAULT_JOURNAL_POLL_MS}. */
  pollIntervalMs?: number
  /** Working directory for the read command. Paths are absolute, so rarely needed. */
  cwd?: string
  firstByteTimeoutMs?: number
  runId?: string
}

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
const STALLED = Symbol('journal-read-stalled')

/** The bound in effect for a read; `undefined` when the caller disabled it. */
function firstByteTimeout(options: ReadJournalOptions): number | undefined {
  const ms = options.firstByteTimeoutMs ?? DEFAULT_ATTACH_JOURNAL_WAIT_MS
  return Number.isFinite(ms) && ms > 0 ? ms : undefined
}

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

export function readJournal(
  handle: SandboxHandle,
  options: ReadJournalOptions,
): AsyncIterable<JournalLine> {
  const strategy = options.strategy ?? journalReadStrategy(handle)
  return strategy === 'follow'
    ? followJournal(handle, options)
    : pollJournal(handle, options)
}
