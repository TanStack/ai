import { isTerminalRunStatus } from '@tanstack/ai'
import { journalExistsCommand } from './journal'
import type { JournalPaths } from './journal'
import type { SandboxHandle } from './contracts'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunRecord, RunStore } from '@tanstack/ai'

/**
 * How long an attach waits for a live run's journal to appear before failing.
 *
 * User-relevant, hence exported: this bounds how long an attach REQUEST can sit
 * before it answers, so an application that fronts the attach route with its own
 * timeout needs to know the number. Generous relative to the gap between a
 * driver claiming a run and its first journal write (a `spawn` plus one line),
 * and short relative to any sane HTTP timeout. Override per run with
 * `SandboxDurabilityOptions.attachWaitMs`.
 */
export const DEFAULT_ATTACH_JOURNAL_WAIT_MS = 10_000

/**
 * How often the bounded wait re-probes for the journal. Not user-facing: it
 * trades a `test -f` per interval for attach latency, and neither number is
 * something an application tunes.
 */
export const DEFAULT_ATTACH_PROBE_INTERVAL_MS = 100

/**
 * Which of the three hopeless-attach cases was hit. Exported so a consumer can
 * branch (a 404 for `'unknown-run'`, a 410 for `'terminal-run'`, a 504 for
 * `'journal-timeout'`) instead of matching on message text.
 */
export type AttachUnavailableReason =
  | 'unknown-run'
  | 'terminal-run'
  | 'journal-timeout'
  | 'journal-stalled'

/**
 * An attach cannot succeed, and waiting longer would not change that.
 *
 * One class with a {@link AttachUnavailableReason} discriminant rather than three
 * classes: every consumer of this path handles all three cases at the same seam
 * (the attach route), so one `instanceof` plus a `switch (error.reason)` is the
 * shape that is actually written, while the message names the specific case for a
 * human reading a log.
 */
export class JournalAttachUnavailableError extends Error {
  constructor(
    readonly runId: string,
    readonly reason: AttachUnavailableReason,
    detail: string,
  ) {
    super(`cannot attach to run ${runId}: ${detail}`)
    this.name = 'JournalAttachUnavailableError'
  }
}

/** Existence of the journal, or `'unknown'` when the probe itself failed. */
type JournalExistence = 'yes' | 'no' | 'unknown'

export interface AwaitAttachableJournalOptions {
  /** The run's journal paths, as {@link journalPaths} derived them. */
  paths: JournalPaths
  /** Run id, for the store lookup and the error messages. */
  runId: string
  /**
     * The authoritative run record store. Omitted only by a caller with no store
     * wired, which loses the unknown/terminal classification but keeps the bound.
     */
  runs?: RunStore
  /** Bounded wait. Defaults to {@link DEFAULT_ATTACH_JOURNAL_WAIT_MS}. */
  waitMs?: number
  /** Re-probe interval. Defaults to {@link DEFAULT_ATTACH_PROBE_INTERVAL_MS}. */
  probeIntervalMs?: number
  /**
     * The consumer's abort. An aborted wait returns rather than throwing: the
     * caller stopped caring, which is not a diagnosis about the run.
     */
  signal?: AbortSignal
  logger?: InternalLogger
}

/**
 * Shell `test -f`, never `handle.fs.exists` — `journal.ts` rule 3: on
 * local-process the two resolve `/tmp` differently, so `fs.exists` would probe a
 * path the journal was never written to and report `false` for every run.
 */
async function probeJournal(
  handle: SandboxHandle,
  options: AwaitAttachableJournalOptions,
): Promise<JournalExistence> {
  try {
    const result = await handle.process.exec(
      journalExistsCommand(options.paths),
    )
    return result.exitCode === 0 ? 'yes' : 'no'
  } catch (error) {
    options.logger?.provider(
      `attach preflight: journal existence probe failed for run ${options.runId}; re-probing under the bounded wait rather than attaching blind`,
      { runId: options.runId, error },
    )
    return 'unknown'
  }
}

/**
 * `null` means the store answered "no such run" — a real, actionable fact.
 * `undefined` means there is no answer to be had (no store, or `get` threw), and
 * the caller must not treat that as "unknown run".
 */
async function readRecord(
  options: AwaitAttachableJournalOptions,
): Promise<RunRecord | null | undefined> {
  if (options.runs === undefined) return undefined
  try {
    return await options.runs.get(options.runId)
  } catch (error) {
    options.logger?.errors(
      `attach preflight: reading the run record failed for run ${options.runId}`,
      { runId: options.runId, error },
    )
    return undefined
  }
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
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

function describeRecord(record: RunRecord): string {
  return record.detachedSince === undefined
    ? `status '${record.status}' with a viewer attached`
    : `status '${record.status}', detached since ${new Date(record.detachedSince).toISOString()}`
}

/**
 * Resolve once the run's journal can be tailed, or reject with a
 * {@link JournalAttachUnavailableError} explaining why it never will be.
 *
 * Call this BEFORE the first follow/poll read of an attach, never on a fresh
 * run: a fresh run's journal is created by its own `journaledCommand` spawn,
 * which has not happened yet, so gating it would fail every new run.
 */
export async function awaitAttachableJournal(
  handle: SandboxHandle,
  options: AwaitAttachableJournalOptions,
): Promise<void> {
  const existence = await probeJournal(handle, options)
  if (existence === 'yes') return

  const record = await readRecord(options)
  if (record === null) {
    throw new JournalAttachUnavailableError(
      options.runId,
      'unknown-run',
      `no run record exists and the journal (${options.paths.journal}) has never been written, so nothing will ever be appended to it. ` +
        `The runId is unknown to the RunStore — it is mistyped, from another deployment, or its record has been evicted.`,
    )
  }
  const isTerminalRecord =
    record !== undefined && isTerminalRunStatus(record.status)
  if (isTerminalRecord) {
    throw new JournalAttachUnavailableError(
      options.runId,
      'terminal-run',
      `the run is already '${record.status}' and its journal (${options.paths.journal}) does not exist, so nothing will ever be appended to it. ` +
        `A terminal run's transcript lives in its event log, not in a journal — serve the log instead of attaching.`,
    )
  }

  /** Bounded wait. Defaults to {@link DEFAULT_ATTACH_JOURNAL_WAIT_MS}. */
  const waitMs = options.waitMs ?? DEFAULT_ATTACH_JOURNAL_WAIT_MS
  /** Re-probe interval. Defaults to {@link DEFAULT_ATTACH_PROBE_INTERVAL_MS}. */
  const probeIntervalMs =
    options.probeIntervalMs ?? DEFAULT_ATTACH_PROBE_INTERVAL_MS
  const deadline = Date.now() + waitMs
  let lastExistence: JournalExistence = existence
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new JournalAttachUnavailableError(
        options.runId,
        'journal-timeout',
        `the run record says ${record === undefined ? 'nothing (no run store is wired)' : describeRecord(record)}, ` +
          (lastExistence === 'unknown'
            ? `and its journal (${options.paths.journal}) could not be probed at all within ${waitMs}ms — every '${journalExistsCommand(options.paths)}' failed. ` +
              `Attaching anyway would create that journal and tail it forever, so this fails instead. Check that the sandbox is still alive and that its exec transport works.`
            : `but its journal (${options.paths.journal}) did not appear within ${waitMs}ms. ` +
              `Either the driver died before writing its first line, or the journal directory does not match the one the agent was started with.`),
      )
    }
    if (options.signal?.aborted) return
    await sleep(Math.min(probeIntervalMs, remaining), options.signal)
    lastExistence = await probeJournal(handle, options)
    if (lastExistence === 'yes') return
  }
}
