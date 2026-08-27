import { isTerminalRunStatus } from '@tanstack/ai'
import { journalExistsCommand } from './journal'
import type { JournalPaths } from './journal'
import type { SandboxHandle } from './contracts'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunRecord, RunStore } from '@tanstack/ai'

export const DEFAULT_ATTACH_JOURNAL_WAIT_MS = 10_000

export const DEFAULT_ATTACH_PROBE_INTERVAL_MS = 100

export type AttachUnavailableReason =
  | 'unknown-run'
  | 'terminal-run'
  | 'journal-timeout'
  | 'journal-stalled'

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
  runs?: RunStore
  /** Bounded wait. Defaults to {@link DEFAULT_ATTACH_JOURNAL_WAIT_MS}. */
  waitMs?: number
  /** Re-probe interval. Defaults to {@link DEFAULT_ATTACH_PROBE_INTERVAL_MS}. */
  probeIntervalMs?: number
  signal?: AbortSignal
  logger?: InternalLogger
}

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

  const waitMs = options.waitMs ?? DEFAULT_ATTACH_JOURNAL_WAIT_MS
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
