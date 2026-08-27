import { isTerminalRunStatus, requestRunCancel } from '@tanstack/ai'
import {
  DEFAULT_FENCE_QUIET_MS,
  RunClaimLostError,
  // Thrown, not merely caught: the expiry re-derivation under the lock refuses
  // its own claim when the run's viewer has come back.
  RunClaimNotAcquiredError,
  awaitLogQuiescence,
  fenceDurability,
  fenceRunStore,
  withRunClaim,
} from './claim'
import { pipeToRunLog } from './run'
import {
  journalExitProbeCommand,
  journalPaths,
  parseJournalExit,
} from './journal'
import { decodeBase64Stream } from './journal-bytes'
import type { SandboxHandle } from './contracts'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  RunRecord,
  RunStatus,
  RunStore,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'

export const DEFAULT_RUN_BUDGET_MS = 30_000

export const DEFAULT_MAX_RUNS = 25

/** Journal tail bytes {@link probeRunExit} reads. The sentinel is the last line. */
export const DEFAULT_EXIT_PROBE_BYTES = 4096

export type RunExitProbe =
  /** The `{"__exit":N}` sentinel is in the journal. The agent is over. */
  | { state: 'finished'; exitCode: number }
  /** No sentinel. The agent is mid-flight (or never started). LEAVE IT ALONE. */
  | { state: 'producing' }
  /** The probe could not answer — no sandbox, `exec` rejected, frame undecodable. */
  | { state: 'unknown'; error?: unknown }

/** What one sweep did to one run. */
export type ReapRunOutcome =
  | 'finalized'
  | 'expired'
  | 'producing'
  /** The probe could not answer. Left exactly as untouched as `'producing'`. */
  | 'unknown'
  | 'budget-exceeded'
  | 'not-claimed'
  | 'reclaim-failed'
  /** Something threw. Logged, recorded here, and the sweep continued. */
  | 'failed'

/** One run's line in the sweep summary. */
export interface ReapRunEntry {
  runId: string
  outcome: ReapRunOutcome
  /** The run's status after the sweep, when the run was driven. */
  status?: RunStatus
  /** The agent's exit code, when the probe read one. */
  exitCode?: number
  terminalizedAnyway?: boolean
  error?: unknown
}

export interface ReapResult {
  /** Runs in this batch — i.e. after the {@link ReapOptions.maxRuns} cap. */
  considered: number
  /** Runs {@link ReapOptions.hasFinished} was actually called for. */
  probed: number
  outcomes: Record<ReapRunOutcome, number>
  runs: Array<ReapRunEntry>
}

export interface ReapOptions<TOffset extends string = string> {
  runs: RunStore
  locks: LockStore
  durability: (runId: string) => StreamDurability<TOffset>
  hasFinished: (record: RunRecord) => Promise<RunExitProbe>
  /** Produce the run's remaining events. Called only once the claim is held. */
  drive: (input: {
    runId: string
    threadId: string
    signal: AbortSignal
  }) => AsyncIterable<StreamChunk>
  /** Sweep clock, passed rather than read so a sweep is reproducible. */
  now: number
  /** Detached-run TTL; `detachedSince <= now - ttl` expires, INCLUSIVELY. */
  detachedRunTtlMs: number
  /** Safety net per drive. Defaults to {@link DEFAULT_RUN_BUDGET_MS}. */
  runBudgetMs?: number
  /** Batch cap. Defaults to {@link DEFAULT_MAX_RUNS}. */
  maxRuns?: number
  /** Quiescence window; defaults to `DEFAULT_FENCE_QUIET_MS`. */
  fenceQuietMs?: number
  reclaim?: (record: RunRecord) => Promise<void>
  logger?: InternalLogger
}

async function* singleValue(value: string): AsyncIterable<string> {
  yield value
}

/** Decode the base64 frame `journalExitProbeCommand` emits. */
async function decodeFrame(stdout: string): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  const decodedChunks = decodeBase64Stream(singleValue(stdout))
  for await (const bytes of decodedChunks) {
    text += decoder.decode(bytes, { stream: true })
  }
  return text + decoder.decode()
}

export async function probeRunExit(input: {
  handle: SandboxHandle
  runId: string
  /** Journal directory; defaults to `DEFAULT_JOURNAL_DIR`, as `journalPaths` does. */
  dir?: string
  /** Tail bytes to read. Defaults to {@link DEFAULT_EXIT_PROBE_BYTES}. */
  maxBytes?: number
}): Promise<RunExitProbe> {
  try {
    const paths = journalPaths(input.runId, input.dir)
    const result = await input.handle.process.exec(
      journalExitProbeCommand(
        paths,
        input.maxBytes ?? DEFAULT_EXIT_PROBE_BYTES,
      ),
    )
    const exitCode = parseJournalExit(await decodeFrame(result.stdout), paths)
    return exitCode === null
      ? { state: 'producing' }
      : { state: 'finished', exitCode }
  } catch (error) {
    return { state: 'unknown', error }
  }
}

/** Every outcome key present at zero, so a consumer can read any of them. */
function emptyOutcomes(): Record<ReapRunOutcome, number> {
  return {
    finalized: 0,
    expired: 0,
    producing: 0,
    unknown: 0,
    'budget-exceeded': 0,
    'not-claimed': 0,
    'reclaim-failed': 0,
    failed: 0,
  }
}

function safeLog(
  logger: InternalLogger | undefined,
  level: 'errors' | 'sandbox',
  message: string,
  context: Record<string, unknown>,
): void {
  try {
    if (level === 'errors') logger?.errors(message, context)
    else logger?.sandbox(message, context)
  } catch {
    // Intentionally empty: there is no second channel to report on.
  }
}

/** Resolved-once settings shared by every run in one sweep. */
interface ReapContext<TOffset extends string = string> {
  options: ReapOptions<TOffset>
  runBudgetMs: number
  fenceQuietMs: number
  /** Inclusive expiry cutoff: `detachedSince <= cutoff` is expired. */
  cutoff: number
}

/** Whether a thrown value means "we do not own this run", which is normal. */
function isClaimRefusal(error: unknown): boolean {
  return (
    error instanceof RunClaimNotAcquiredError ||
    error instanceof RunClaimLostError
  )
}

function unknownProbeError(probe: RunExitProbe): { error?: unknown } {
  const hasNoUnknownError =
    probe.state !== 'unknown' || probe.error === undefined
  if (hasNoUnknownError) return {}
  return { error: probe.error }
}

type ReapProbeDecision =
  | { kind: 'expired' }
  | { kind: 'leave'; entry: ReapRunEntry }
  | { kind: 'finished'; exitCode: number }

async function classifyReapProbe<TOffset extends string>(
  record: RunRecord,
  ctx: ReapContext<TOffset>,
  counters: { probed: number },
): Promise<ReapProbeDecision> {
  const expired =
    record.detachedSince !== undefined && record.detachedSince <= ctx.cutoff
  if (expired) return { kind: 'expired' }
  counters.probed += 1
  const probe = await ctx.options.hasFinished(record)
  if (probe.state !== 'finished') {
    const extra = unknownProbeError(probe)
    safeLog(
      ctx.options.logger,
      'sandbox',
      `reap: leaving run ${record.runId} alone`,
      {
        runId: record.runId,
        state: probe.state,
        ...extra,
      },
    )
    return {
      kind: 'leave',
      entry: { runId: record.runId, outcome: probe.state, ...extra },
    }
  }
  return { kind: 'finished', exitCode: probe.exitCode }
}

function classifyDriveOutcome(
  expired: boolean,
  terminal: boolean,
  budgetAborted: boolean,
): ReapRunOutcome {
  const isBudgetExceeded = budgetAborted && !expired
  if (isBudgetExceeded) return 'budget-exceeded'
  if (!terminal) return 'not-claimed'
  return expired ? 'expired' : 'finalized'
}

async function reclaimTerminalRun<TOffset extends string>(
  record: RunRecord,
  ctx: ReapContext<TOffset>,
  status: RunStatus,
): Promise<{ outcome?: 'reclaim-failed'; error?: unknown }> {
  if (!isTerminalRunStatus(status) || ctx.options.reclaim === undefined) {
    return {}
  }
  try {
    await ctx.options.reclaim(record)
    return {}
  } catch (error) {
    safeLog(
      ctx.options.logger,
      'errors',
      `reap: reclaiming run ${record.runId} failed`,
      {
        runId: record.runId,
        status,
        error,
      },
    )
    return { outcome: 'reclaim-failed', error }
  }
}

async function reapOne<TOffset extends string>(
  record: RunRecord,
  ctx: ReapContext<TOffset>,
  counters: { probed: number },
): Promise<ReapRunEntry> {
  const { runs, locks, logger } = ctx.options
  const { runId, threadId } = record

  try {
    const decision = await classifyReapProbe(record, ctx, counters)
    if (decision.kind === 'leave') return decision.entry
    const expired = decision.kind === 'expired'
    const exitCode =
      decision.kind === 'finished' ? decision.exitCode : undefined

    // Armed INSIDE the claim, below. Read after it for the outcome, so it is
    // hoisted here rather than declared in the callback.
    let budget: AbortSignal | undefined
    const final = await withRunClaim(
      {
        runs,
        locks,
        runId,
        fenceQuietMs: ctx.fenceQuietMs,
        ...(logger === undefined ? {} : { logger }),
      },
      async (claim) => {
        if (expired) {
          const current = await runs.get(runId)
          if (current === null) {
            throw new RunClaimNotAcquiredError(runId, 'unknown')
          }
          const isNewerDetached =
            current.detachedSince === undefined ||
            current.detachedSince > ctx.cutoff
          if (isNewerDetached) {
            throw new RunClaimNotAcquiredError(runId, 'superseded')
          }
          await requestRunCancel(runs, runId)
        }
        // Before the first append, never after: `pipeToRunLog` snapshots to align.
        await awaitLogQuiescence(
          ctx.options.durability(runId),
          ctx.fenceQuietMs,
        )
        budget = AbortSignal.timeout(ctx.runBudgetMs)
        const signal = AbortSignal.any([claim.signal, budget])
        return pipeToRunLog(ctx.options.drive({ runId, threadId, signal }), {
          runs: fenceRunStore(runs, claim, {
            ...(logger === undefined ? {} : { logger }),
          }),
          durability: (id) =>
            fenceDurability(ctx.options.durability(id), claim, { runs }),
          runId,
          threadId,
          signal,
          ...(logger === undefined ? {} : { logger }),
        })
      },
    )

    const terminal = isTerminalRunStatus(final.status)
    let outcome = classifyDriveOutcome(
      expired,
      terminal,
      budget?.aborted ?? false,
    )

    const budgetAnomaly = outcome === 'budget-exceeded'
    const reclaim = await reclaimTerminalRun(record, ctx, final.status)
    if (reclaim.outcome) outcome = reclaim.outcome

    return {
      runId,
      outcome,
      status: final.status,
      ...(exitCode === undefined ? {} : { exitCode }),
      ...(budgetAnomaly ? { terminalizedAnyway: terminal } : {}),
      ...(reclaim.error === undefined ? {} : { error: reclaim.error }),
    }
  } catch (error) {
    if (isClaimRefusal(error)) {
      safeLog(logger, 'sandbox', `reap: not driving run ${runId}`, {
        runId,
        error,
      })
      return { runId, outcome: 'not-claimed', error }
    }
    // Folded into the summary rather than rethrown: one bad run must not abandon
    // the rest of the batch, and there is no caller to receive a rejection.
    safeLog(logger, 'errors', `reap: sweeping run ${runId} failed`, {
      runId,
      error,
    })
    return { runId, outcome: 'failed', error }
  }
}

export async function reapDetachedRuns<TOffset extends string = string>(
  options: ReapOptions<TOffset>,
): Promise<ReapResult> {
  const logger = options.logger
  const outcomes = emptyOutcomes()
  const entries: Array<ReapRunEntry> = []
  const empty = (): ReapResult => ({
    considered: 0,
    probed: 0,
    outcomes,
    runs: entries,
  })

  const list = options.runs.listReclaimable?.bind(options.runs)
  if (list === undefined) {
    safeLog(
      logger,
      'sandbox',
      'reap: the run store does not implement listReclaimable; nothing to sweep',
      {},
    )
    return empty()
  }

  let candidates: Array<RunRecord>
  try {
    candidates = await list({ now: options.now, ttlMs: 0 })
  } catch (error) {
    safeLog(logger, 'errors', 'reap: listing reclaimable runs failed', {
      error,
    })
    return empty()
  }

  const maxRuns = Math.max(0, Math.trunc(options.maxRuns ?? DEFAULT_MAX_RUNS))
  const batch = candidates.slice(0, maxRuns)

  const ctx: ReapContext<TOffset> = {
    options,
    runBudgetMs: options.runBudgetMs ?? DEFAULT_RUN_BUDGET_MS,
    fenceQuietMs: options.fenceQuietMs ?? DEFAULT_FENCE_QUIET_MS,
    cutoff: options.now - options.detachedRunTtlMs,
  }
  const counters = { probed: 0 }

  for (const record of batch) {
    const entry = await reapOne(record, ctx, counters)
    outcomes[entry.outcome] += 1
    entries.push(entry)
  }

  return {
    considered: batch.length,
    probed: counters.probed,
    outcomes,
    runs: entries,
  }
}
