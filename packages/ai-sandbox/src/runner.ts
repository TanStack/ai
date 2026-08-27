import {
  journalCleanupCommand,
  journalPaths,
  journalStderrReadCommand,
  journaledCommand,
  parseExitSentinel,
} from './journal'
import { readJournal } from './journal-reader'
import { decodeBase64Stream } from './journal-bytes'
import { awaitAttachableJournal } from './attach-preflight'
import type { JournalPaths } from './journal'
import type { ProcessOptions, SandboxHandle } from './contracts'
import type { RunStore } from '@tanstack/ai'

export interface SpawnNdjsonOptions extends ProcessOptions {
  /**
   * Called for each raw stdout line that is non-empty but fails JSON parsing
   * (e.g. a CLI banner). Defaults to ignoring it. Stderr is never parsed.
   */
  onNonJsonLine?: (line: string) => void
  /**
   * Written to the process stdin (then stdin is closed) right after spawn —
   * e.g. the agent prompt for `claude -p`. Avoids putting the prompt in argv.
   */
  input?: string
  /**
   * Route the agent's stdout through an in-sandbox journal rather than holding
   * its pipe directly.
   *
   * This is what makes a run survive host death: with nothing piped, there is
   * no reader whose disappearance can SIGPIPE the agent, and a later host reads
   * the same file from byte 0. Opt-in so every existing caller (and every
   * existing test) is unaffected.
   */
  journal?: JournalOptions
}

/** Journaling configuration for {@link spawnNdjson}. */
export interface JournalOptions {
  /** Run id the journal path is derived from. Must match across hosts. */
  runId: string
  /** Journal directory. Defaults to `/tmp/tanstack-runs`. */
  dir?: string
  /**
   * Read an EXISTING journal instead of starting the agent. The read still
   * begins at byte 0 — the alignment step, not the reader, decides what has
   * already been delivered.
   */
  attach?: boolean
  /** Poll interval for providers that cannot follow. */
  pollIntervalMs?: number
  /**
   * Run record store, consulted ONLY on an attach and only when the journal is
   * absent, to tell "not written yet" from "will never be written" (see
   * `attach-preflight.ts`). Optional so an attach with no store wired keeps the
   * bounded wait while losing the unknown/terminal classification.
   */
  runs?: RunStore
  /**
   * Bounded wait for a live run's journal to appear on an attach, AND — on every
   * path, attach or fresh — the bound on the read's first byte
   * (`ReadJournalOptions.firstByteTimeoutMs`). One knob for both because they
   * bound the same question from two sides: the preflight covers "the file does
   * not exist", the read covers "the file exists but nothing is writing to it",
   * and a caller that widens one always means to widen the other.
   *
   * Defaults to `DEFAULT_ATTACH_JOURNAL_WAIT_MS`.
   */
  attachWaitMs?: number
}

type JournaledOptions = SpawnNdjsonOptions & { journal: JournalOptions }

function isJournaled(options: SpawnNdjsonOptions): options is JournaledOptions {
  return options.journal !== undefined
}

function resolvePaths(options: JournaledOptions) {
  return journalPaths(options.journal.runId, options.journal.dir)
}

/**
 * Strip the runner-only options, leaving what `handle.process.spawn` accepts.
 *
 * `signal` is deliberately KEPT: on the UNJOURNALED path the host holds the
 * agent's stdout pipe, so a client disconnect should take the process down with
 * it. The journaled path must not forward it — see
 * {@link toJournaledSpawnOptions}.
 */
function toProcessOptions(options: SpawnNdjsonOptions): ProcessOptions {
  const { onNonJsonLine, input, journal, ...rest } = options
  void onNonJsonLine
  void input
  void journal
  return rest
}

/**
 * The journaled agent's spawn options: {@link toProcessOptions} MINUS `signal`.
 *
 * The request's signal must never reach the agent process on this path. Providers
 * DO act on it at spawn time — local-process registers it to `killTree` the
 * process group, and daytona and docker honor it too — so forwarding it means a
 * client disconnect kills the journaled agent. The agent then writes no exit
 * sentinel, and a successor host takes over a run that is already dead: the exact
 * opposite of the guarantee documented on {@link startJournaledAgent}, and of the
 * reason the journal is a file rather than a pipe.
 *
 * The signal is still honored for the READ. `readJournalNdjson` forwards it to
 * `readJournal` and `awaitAttachableJournal` on its own, so a disconnecting
 * client stops tailing immediately. Only the agent spawn outlives the request.
 */
function toJournaledSpawnOptions(options: JournaledOptions): ProcessOptions {
  const { signal, ...rest } = toProcessOptions(options)
  void signal
  return rest
}

/** Split a stream of arbitrary string chunks into complete lines. */
export async function* toLines(
  chunks: AsyncIterable<string>,
): AsyncIterable<string> {
  let buffer = ''
  for await (const chunk of chunks) {
    buffer += chunk
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      yield line
      newlineIndex = buffer.indexOf('\n')
    }
  }
  if (buffer.length > 0) yield buffer
}

/**
 * Start the agent with its stdout (and the `{"__exit":N}` sentinel) redirected
 * into the journal, then return.
 *
 * Deliberately does NOT wait for the process and does NOT read its stdout: the
 * whole point of journaling is that the host holds no handle on the agent's
 * output, so a host that dies mid-run cannot take the agent down with it (no
 * pipe to SIGPIPE). The spawned process is left running in the sandbox; the
 * sentinel line the wrapper appends on exit is how anyone — this host or a
 * successor — learns it finished. Stdin is still written directly to the
 * spawned process, exactly as the unjournaled path does, since that transport
 * is unaffected by where stdout goes.
 */
export async function startJournaledAgent(
  handle: SandboxHandle,
  command: string,
  options: JournaledOptions,
): Promise<void> {
  const paths = resolvePaths(options)
  const proc = await handle.process.spawn(
    journaledCommand(command, paths),
    toJournaledSpawnOptions(options),
  )
  if (options.input !== undefined) {
    await proc.stdin.write(options.input)
    await proc.stdin.end()
  }
}

/** Chars of stderr attached to a non-zero-exit error, on both paths. */
const /** Chars of stderr attached to a non-zero-exit error, on both paths. */
  STDERR_ERROR_CHARS = 1000

async function* singleValue(value: string): AsyncIterable<string> {
  yield value
}

/**
 * Read the tail of a run's stderr sidecar, for the error message only.
 *
 * Returns `''` on ANY failure — a provider whose `exec` rejects, a sidecar that
 * no longer exists, a base64 frame the provider truncated. The caller is on its
 * way to throwing the real failure (the agent's non-zero exit), and losing a
 * diagnostic suffix must never replace that error with a cleanup error. Decoding
 * is deliberately lossy: `journalStderrReadCommand` reads the LAST N bytes, so
 * byte 0 of the frame can sit mid-character.
 */
async function readStderrTail(
  handle: SandboxHandle,
  paths: JournalPaths,
): Promise<string> {
  try {
    const result = await handle.process.exec(journalStderrReadCommand(paths))
    const decoder = new TextDecoder()
    let text = ''
    const decodedChunks = decodeBase64Stream(singleValue(result.stdout))
    for await (const bytes of decodedChunks) {
      text += decoder.decode(bytes, { stream: true })
    }
    text += decoder.decode()
    return text.trim()
  } catch {
    return ''
  }
}

/**
 * Delete a terminal run's journal. Best effort by construction: see
 * {@link journalCleanupCommand} for why a failure here cannot be allowed to fail
 * a run that has already finished.
 */
async function cleanupJournal(
  handle: SandboxHandle,
  paths: JournalPaths,
): Promise<void> {
  try {
    await handle.process.exec(journalCleanupCommand(paths))
  } catch {}
}

/**
 * Read a run's journal and yield each line parsed as JSON.
 *
 * Always reads from byte 0 — the alignment step (a later phase), not this
 * reader, decides what a client has already seen. Stops at the `{"__exit":N}`
 * sentinel, and throws for a non-zero N so the calling adapter's existing
 * `catch` turns it into a `RUN_ERROR`, the same observable outcome the
 * unjournaled path produces from a non-zero `wait()`. There is nothing to
 * `wait()` on here: the host holds a `tail`, not the agent process, so the
 * sentinel line IS the exit code.
 *
 * The sentinel is also what bounds journal growth: reaching it means the run is
 * terminal, and a terminal run's record is the event log, so both journal files
 * are deleted before this iterable finishes. The ordering below is load-bearing
 * and is asserted, not merely commented:
 *
 * - The sentinel is captured and the loop is `break`-ed, so the source's
 *   `finally` kills the `tail` BEFORE the `rm` runs — the reader is stopped, then
 *   its input is deleted, never the other way round.
 * - `exitCode` stays `undefined` if the journal stream ends without a sentinel.
 *   NOTHING is deleted on that path either way — the run may be mid-flight and a
 *   successor host may still need every byte — but the two causes are then
 *   separated by `options.signal.aborted`: an aborted consumer returns quietly,
 *   while a stream that died on its own (killed `tail`, destroyed sandbox, torn
 *   pipe) THROWS. Returning for both is how a truncated read used to reach the
 *   client as a normally-completing run.
 * - A non-zero sentinel deletes too. The run is terminal either way.
 * - The stderr sidecar is read BEFORE the deletion that destroys it, so a
 *   non-zero exit carries up to {@link STDERR_ERROR_CHARS} chars of the agent's
 *   own diagnostics, exactly as the unjournaled path below does. That closes the
 *   "Known regression" this function used to document; the read is bounded and
 *   failure-swallowing (see {@link readStderrTail}), so it cannot turn a run
 *   failure into a cleanup failure.
 *
 * On an ATTACH (`journal.attach === true`) the read is preceded by
 * {@link awaitAttachableJournal}, which fails fast for a runId the store does not
 * know or has already terminalized and otherwise waits a BOUNDED time for a live
 * run's journal to appear. Without it, an attach to a runId with no journal
 * created an empty one (`journalFollowCommand` does that deliberately) and tailed
 * it forever — no sentinel, no error, no timeout.
 *
 * One case this does NOT bound: a run that reaches its sentinel while DETACHED
 * has no host reading it, so nothing observes the sentinel and nothing here
 * runs. Sweeping those is `pruneJournals`' job (`journal-sweep.ts`): it consults
 * the run store's status for each journal it finds and deletes only the terminal
 * ones, from a cron the application schedules rather than from a run.
 */
export async function* readJournalNdjson(
  handle: SandboxHandle,
  options: JournaledOptions,
): AsyncIterable<unknown> {
  const paths = resolvePaths(options)
  if (options.journal.attach === true) {
    await awaitAttachableJournal(handle, {
      paths,
      runId: options.journal.runId,
      ...(options.journal.runs === undefined
        ? {}
        : { runs: options.journal.runs }),
      ...(options.journal.attachWaitMs === undefined
        ? {}
        : { waitMs: options.journal.attachWaitMs }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
  }
  let exitCode: number | undefined
  const journalLines = readJournal(handle, {
    paths,
    fromByte: 0,
    runId: options.journal.runId,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.journal.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: options.journal.pollIntervalMs }),
    ...(options.journal.attachWaitMs === undefined
      ? {}
      : { firstByteTimeoutMs: options.journal.attachWaitMs }),
  })
  for await (const { line } of journalLines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const sentinel = parseExitSentinel(trimmed, paths)
    if (sentinel !== null) {
      exitCode = sentinel
      break
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      options.onNonJsonLine?.(trimmed)
      continue
    }
    yield parsed
  }

  if (exitCode === undefined) {
    if (options.signal?.aborted === true) return
    throw new Error(
      `Agent journal stream for run ${options.journal.runId} ended without an exit sentinel ` +
        `(${paths.journal}). The run was NOT observed to finish: the tail was torn down, ` +
        `the sandbox went away, or the agent's shell died before writing its sentinel. ` +
        `Both journal files are left in place for a successor host.`,
    )
  }

  const stderr = exitCode === 0 ? '' : await readStderrTail(handle, paths)
  await cleanupJournal(handle, paths)
  if (exitCode !== 0) {
    throw new Error(
      `Agent process exited with code ${exitCode}` +
        (stderr ? `: ${stderr.slice(0, STDERR_ERROR_CHARS)}` : ''),
    )
  }
}

/**
 * Spawn `command` in the sandbox and yield each stdout line parsed as JSON.
 *
 * Without `options.journal`, behavior is byte-identical to before: resolves
 * the spawn handle's exit via `wait()` after stdout closes; a non-zero exit
 * with no events surfaced is the adapter's concern to detect.
 *
 * With `options.journal`, the agent's stdout is redirected into an in-sandbox
 * journal (unless `journal.attach` is set, meaning a run already in flight)
 * and then read back from byte 0 — one code path for a fresh run and an
 * attach, both going through {@link readJournalNdjson}.
 */
export async function* spawnNdjson(
  handle: SandboxHandle,
  command: string,
  options: SpawnNdjsonOptions = {},
): AsyncIterable<unknown> {
  if (isJournaled(options)) {
    if (options.journal.attach !== true) {
      await startJournaledAgent(handle, command, options)
    }
    yield* readJournalNdjson(handle, options)
    return
  }

  const { onNonJsonLine, input, ...processOptions } = options
  const proc = await handle.process.spawn(command, processOptions)

  if (input !== undefined) {
    await proc.stdin.write(input)
    await proc.stdin.end()
  }

  const stderrChunks: Array<string> = []
  const stderrDrained = (async () => {
    try {
      for await (const chunk of proc.stderr) stderrChunks.push(chunk)
    } catch {
      // stderr stream torn down — use whatever was captured
    }
  })()

  const stdoutLines = toLines(proc.stdout)
  for await (const line of stdoutLines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      onNonJsonLine?.(trimmed)
      continue
    }
    yield parsed
  }

  const exitCode = await proc.wait()
  await stderrDrained
  if (exitCode !== 0) {
    const stderr = stderrChunks.join('').trim()
    throw new Error(
      `Agent process exited with code ${exitCode}` +
        (stderr ? `: ${stderr.slice(0, STDERR_ERROR_CHARS)}` : ''),
    )
  }
}
