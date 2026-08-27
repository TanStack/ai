import { isTerminalRunStatus } from '@tanstack/ai'
import {
  DEFAULT_JOURNAL_DIR,
  decodeJournalRunId,
  journalCleanupCommand,
  journalListCommand,
  journalMtimeListCommand,
  journalPaths,
  parseJournalMtimeListing,
} from './journal'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunStore } from '@tanstack/ai'
import type { SandboxHandle } from './contracts'

/**
 * How long a journal whose runId the store does not know must go untouched
 * before the sweep will delete it.
 *
 * One hour, chosen against what the window actually protects: the gap between a
 * reader creating the journal with `: >> file` and the run record appearing in
 * the store. That gap is milliseconds in the normal case and seconds in the worst
 * case (a slow store, a retried write). An hour is three orders of magnitude of
 * headroom on the race, while still bounding a leaked journal to something a
 * sandbox's disk survives. Erring long is the cheap direction: the cost of too
 * long is bytes, the cost of too short is a destroyed live run.
 */
export const DEFAULT_ORPHAN_TTL_MS = 60 * 60 * 1000

/**
 * Ceiling on deletions per sweep. A cron-driven sweep runs unattended, so a
 * mistake — a store that answers `terminal` for everything, a misconfigured
 * directory — is bounded by this rather than by how many journals happen to
 * exist. The remainder is reported as kept with reason `max-deletes` and picked
 * up by the next sweep.
 */
export const DEFAULT_MAX_DELETES = 200

/** Why {@link pruneJournals} left a journal in place. */
export type KeptJournalReason =
  /** The store answered with a non-terminal status (`'running'`, `'interrupted'`). */
  | 'non-terminal'
  /** The store has never heard of this runId and the journal is still fresh. */
  | 'orphan-too-recent'
  | 'age-gate-unavailable'
  | 'age-gate-missing-entry'
  /** {@link decodeJournalRunId} refused the name (`truncated` or `malformed`). */
  | 'undecodable-name'
  /** The store lookup threw. A question that was not answered is not a licence to delete. */
  | 'store-error'
  /** The `rm` itself failed or exited non-zero. */
  | 'delete-failed'
  /** {@link PruneJournalsOptions.maxDeletes} was already reached this sweep. */
  | 'max-deletes'

/** One journal (or one runId's journal + sidecar) the sweep declined to delete. */
export interface KeptJournal {
  /** The decoded runId; absent exactly when `reason` is `'undecodable-name'`. */
  runId?: string
  /** Every listed filename this entry covers — the journal and its `.err` sidecar. */
  names: Array<string>
  reason: KeptJournalReason
}

/** A non-fatal failure the sweep folded into its result instead of throwing. */
export interface PruneJournalsFailure {
  stage: 'list' | 'mtime-list' | 'store' | 'delete'
  /** Present when the failure is attributable to one run. */
  runId?: string
  message: string
}

/** What one {@link pruneJournals} sweep did. */
export interface PruneJournalsResult {
  /** Filenames `ls -1` reported, before de-duplication by runId. */
  listed: number
  /** Distinct runIds those filenames decoded to. */
  runIds: number
  /** runIds whose journal AND sidecar were deleted, in the order deleted. */
  deleted: Array<string>
  /** Everything left in place, with the reason. */
  kept: Array<KeptJournal>
  /**
   * Whether the mtime age gate was usable this sweep. `'unavailable'` means no
   * orphan could be expired, by design.
   */
  ageGate: 'listed' | 'unavailable'
  failures: Array<PruneJournalsFailure>
}

export interface PruneJournalsOptions {
  /** Sandbox holding the journal directory. Touched only via `process.exec`. */
  handle: SandboxHandle
  /**
   * Run lookup. Only `get` is used: the sweep asks about the runIds it found on
   * disk and never enumerates the store, so no optional `RunStore` method is
   * required of a backend.
   */
  runs: Pick<RunStore, 'get'>
  /** Journal directory. Defaults to {@link DEFAULT_JOURNAL_DIR}. */
  dir?: string
  /** Age-gate reference time. Defaults to `Date.now()`; injectable for tests. */
  now?: number
  /** See {@link DEFAULT_ORPHAN_TTL_MS}. */
  orphanTtlMs?: number
  /** See {@link DEFAULT_MAX_DELETES}. */
  maxDeletes?: number
  logger?: InternalLogger
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface SweepState {
  /** runIds whose journal AND sidecar were deleted, in the order deleted. */
  deleted: Array<string>
  /** Everything left in place, with the reason. */
  kept: Array<KeptJournal>
  failures: Array<PruneJournalsFailure>
  logger: InternalLogger | undefined
}

async function listJournalNames(
  handle: SandboxHandle,
  dir: string,
  state: SweepState,
): Promise<Array<string> | null> {
  try {
    const listing = await handle.process.exec(journalListCommand(dir))
    return listing.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
  } catch (error) {
    state.failures.push({ stage: 'list', message: errorMessage(error) })
    state.logger?.warn('journal sweep: listing the journal directory failed', {
      dir,
      error,
    })
    return null
  }
}

async function loadJournalMtimes(
  handle: SandboxHandle,
  dir: string,
  state: SweepState,
): Promise<{ ageGate: 'listed' | 'unavailable'; mtimes: Map<string, number> }> {
  const mtimes = new Map<string, number>()
  try {
    const probe = await handle.process.exec(journalMtimeListCommand(dir))
    const parsed = parseJournalMtimeListing(probe.stdout, dir)
    if (parsed.kind === 'listed') {
      for (const entry of parsed.entries) mtimes.set(entry.name, entry.mtimeMs)
      return { ageGate: 'listed', mtimes }
    }
    state.logger?.warn(
      'journal sweep: mtime listing unavailable; keeping every orphan',
      { dir },
    )
  } catch (error) {
    state.failures.push({ stage: 'mtime-list', message: errorMessage(error) })
    state.logger?.warn(
      'journal sweep: mtime listing failed; keeping every orphan',
      {
        dir,
        error,
      },
    )
  }
  return { ageGate: 'unavailable', mtimes }
}

function keepUnknownRunJournal(
  runId: string,
  runNames: Array<string>,
  ageGate: 'listed' | 'unavailable',
  mtimes: Map<string, number>,
  orphanCutoff: number,
  kept: Array<KeptJournal>,
): boolean {
  if (ageGate === 'unavailable') {
    kept.push({ runId, names: runNames, reason: 'age-gate-unavailable' })
    return true
  }
  const observed = runNames.map((name) => mtimes.get(name))
  if (observed.some((mtimeMs) => mtimeMs === undefined)) {
    kept.push({ runId, names: runNames, reason: 'age-gate-missing-entry' })
    return true
  }
  const newest = Math.max(...observed.filter(isDefined))
  if (newest > orphanCutoff) {
    kept.push({ runId, names: runNames, reason: 'orphan-too-recent' })
    return true
  }
  return false
}

async function deleteJournalRun(
  handle: SandboxHandle,
  runId: string,
  runNames: Array<string>,
  dir: string,
  state: SweepState,
): Promise<boolean> {
  // Shell `rm`, never `handle.fs.remove`: module doc, and `journalPaths`
  // re-derives byte-identical paths from the runId alone.
  const command = journalCleanupCommand(journalPaths(runId, dir))
  try {
    const result = await handle.process.exec(command)
    if (result.exitCode !== 0) {
      state.failures.push({
        stage: 'delete',
        runId,
        message: `rm exited ${result.exitCode}`,
      })
      state.kept.push({ runId, names: runNames, reason: 'delete-failed' })
      return false
    }
  } catch (error) {
    // A failed cleanup must never fail the sweep: the journal is still there
    // and the next sweep will see it again.
    state.failures.push({
      stage: 'delete',
      runId,
      message: errorMessage(error),
    })
    state.logger?.warn('journal sweep: deleting a journal failed', {
      runId,
      error,
    })
    state.kept.push({ runId, names: runNames, reason: 'delete-failed' })
    return false
  }
  return true
}

async function pruneJournalRun(
  runId: string,
  runNames: Array<string>,
  input: {
    /** Sandbox holding the journal directory. Touched only via `process.exec`. */
    handle: SandboxHandle
    runs: Pick<RunStore, 'get'>
    /** Journal directory. Defaults to {@link DEFAULT_JOURNAL_DIR}. */
    dir: string
    ageGate: 'listed' | 'unavailable'
    mtimes: Map<string, number>
    orphanCutoff: number
    /** See {@link DEFAULT_MAX_DELETES}. */
    maxDeletes: number
    state: SweepState
  },
): Promise<void> {
  const { state } = input
  if (state.deleted.length >= input.maxDeletes) {
    state.kept.push({ runId, names: runNames, reason: 'max-deletes' })
    return
  }

  let record: Awaited<ReturnType<RunStore['get']>>
  try {
    record = await input.runs.get(runId)
  } catch (error) {
    state.failures.push({
      stage: 'store',
      runId,
      message: errorMessage(error),
    })
    state.logger?.warn(
      'journal sweep: run lookup failed; keeping the journal',
      {
        runId,
        error,
      },
    )
    state.kept.push({ runId, names: runNames, reason: 'store-error' })
    return
  }

  if (record === null) {
    if (
      keepUnknownRunJournal(
        runId,
        runNames,
        input.ageGate,
        input.mtimes,
        input.orphanCutoff,
        state.kept,
      )
    ) {
      return
    }
  } else if (!isTerminalRunStatus(record.status)) {
    // `'interrupted'` lands here, and must: it is a human-in-the-loop PAUSE
    // that interrupt-resume continues from, not an end state.
    state.kept.push({ runId, names: runNames, reason: 'non-terminal' })
    return
  }

  if (await deleteJournalRun(input.handle, runId, runNames, input.dir, state)) {
    state.deleted.push(runId)
  }
}

/**
 * Group listed filenames by the runId they decode to, so a journal and its
 * `.err` sidecar are ONE decision and ONE `rm`, not two.
 *
 * De-duplication is not a tidiness measure: `journalCleanupCommand` deletes both
 * paths for a runId at once, so iterating raw names would ask the store twice per
 * run and then issue a second `rm` for files the first one already removed —
 * doubling the store load and reporting one run as two deletions.
 */
function groupByRunId(names: Array<string>): {
  byRunId: Map<string, Array<string>>
  undecodable: Array<string>
} {
  const byRunId = new Map<string, Array<string>>()
  const undecodable: Array<string> = []
  for (const name of names) {
    const decoded = decodeJournalRunId(name)
    if (decoded.kind !== 'runId') {
      undecodable.push(name)
      continue
    }
    const existing = byRunId.get(decoded.runId)
    if (existing === undefined) byRunId.set(decoded.runId, [name])
    else existing.push(name)
  }
  return { byRunId, undecodable }
}

/**
 * Sweep the journal directory, deleting only journals whose runs the store
 * reports terminal (plus orphans that have been untouched past `orphanTtlMs`).
 *
 * **Never rejects.** This runs unattended from a cron, where a rejected promise
 * is an unhandled rejection and, worse, hides which journals were and were not
 * swept. Every failure — a listing that errored, a store that threw, an `rm` that
 * exited non-zero — is folded into
 * {@link PruneJournalsResult.failures} and the sweep continues with the entries
 * it can still decide about.
 */
export async function pruneJournals(
  options: PruneJournalsOptions,
): Promise<PruneJournalsResult> {
  const dir = options.dir ?? DEFAULT_JOURNAL_DIR
  /** Age-gate reference time. Defaults to `Date.now()`; injectable for tests. */
  const now = options.now ?? Date.now()
  /** See {@link DEFAULT_ORPHAN_TTL_MS}. */
  const orphanTtlMs = options.orphanTtlMs ?? DEFAULT_ORPHAN_TTL_MS
  const maxDeletes = options.maxDeletes ?? DEFAULT_MAX_DELETES
  const logger = options.logger
  const state: SweepState = {
    deleted: [],
    kept: [],
    failures: [],
    logger,
  }

  /** Every listed filename this entry covers — the journal and its `.err` sidecar. */
  const names = await listJournalNames(options.handle, dir, state)
  if (names === null) {
    return {
      listed: 0,
      runIds: 0,
      deleted: state.deleted,
      kept: state.kept,
      ageGate: 'unavailable',
      failures: state.failures,
    }
  }

  const { ageGate, mtimes } = await loadJournalMtimes(
    options.handle,
    dir,
    state,
  )
  const { byRunId, undecodable } = groupByRunId(names)

  for (const name of undecodable) {
    state.kept.push({ names: [name], reason: 'undecodable-name' })
  }

  const orphanCutoff = now - orphanTtlMs
  for (const [runId, runNames] of byRunId) {
    await pruneJournalRun(runId, runNames, {
      handle: options.handle,
      runs: options.runs,
      dir,
      ageGate,
      mtimes,
      orphanCutoff,
      maxDeletes,
      state,
    })
  }

  logger?.sandbox('journal sweep complete', {
    dir,
    listed: names.length,
    runIds: byRunId.size,
    deleted: state.deleted.length,
    kept: state.kept.length,
    ageGate,
  })

  return {
    listed: names.length,
    runIds: byRunId.size,
    deleted: state.deleted,
    kept: state.kept,
    ageGate,
    failures: state.failures,
  }
}

/** Narrowing predicate: `Array<number | undefined>` → `Array<number>`. */
function isDefined(value: number | undefined): value is number {
  return value !== undefined
}
