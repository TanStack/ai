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

/**
 * Safety net for a single run's drive. Not the mechanism that decides whether a
 * run finished — see the module doc for why that design was rejected — so this is
 * generous rather than tight: it only has to stop a drive that has genuinely
 * wedged on a run the journal already said was over.
 *
 * On the expiry path it is not merely a net: it is what stops a still-producing
 * agent, since nothing polls the cancel recorded before that drive. A caller that
 * expires live agents may want a tighter value there than a finalization replay
 * needs.
 */
export const DEFAULT_RUN_BUDGET_MS = 30_000

/**
 * Runs one sweep will touch. A cron invocation is bounded (a Worker's CPU
 * budget, a Lambda timeout), and an unbounded sweep over a backlog of thousands
 * would be killed mid-run rather than finishing 25 and returning; the next tick
 * takes the next batch.
 */
export const DEFAULT_MAX_RUNS = 25

/** Journal tail bytes {@link probeRunExit} reads. The sentinel is the last line. */
export const /** Journal tail bytes {@link probeRunExit} reads. The sentinel is the last line. */
  DEFAULT_EXIT_PROBE_BYTES = 4096

/**
 * What the out-of-band probe learned about a detached run's agent.
 *
 * THREE ARMS, not a boolean, because "could not tell" must not be
 * indistinguishable from "still working": both leave the run alone, but only one
 * of them is a condition an operator should see. A two-valued probe would also
 * invite the caller to treat a provider `exec` failure as "finished" and drive a
 * live run — the exact defect this module exists to prevent.
 */
export type RunExitProbe =
  /** The `{"__exit":N}` sentinel is in the journal. The agent is over. */
  | {
      state: 'finished' /** The agent's exit code, when the probe read one. */
      exitCode: number
    }
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
  /**
   * THE BUDGET ANOMALY MARKER, and the only field whose mere PRESENCE carries a
   * fact: it is set if and only if the drive outran
   * {@link ReapOptions.runBudgetMs} on the finalization path — the condition
   * `'budget-exceeded'` names. Its value is whether the record nonetheless
   * reached a terminal status, practically always `true` since `pipeToRunLog` is
   * total; it is reported rather than assumed so an operator does not have to
   * infer it.
   *
   * SURVIVES A FAILED RECLAIM. `reclaim` runs after the outcome is classified
   * and overwrites it with `'reclaim-failed'`, which is the more urgent fact (a
   * leaked sandbox nothing will retry) and so wins the single `outcome` slot.
   * This field is therefore what keeps the budget anomaly on the entry: an
   * operator seeing `'reclaim-failed'` WITH `terminalizedAnyway` present is
   * looking at a run that blew its budget and then leaked, and needs both halves.
   */
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
  /**
   * Per-run event log factory, same shape `RunDeps.durability` takes.
   *
   * Generic in the offset type, defaulted to `string` so an existing call site
   * needs no change — see {@link SandboxRunDriverOptions.durability} for why
   * hardcoding the default locked out branded-cursor backends.
   */
  durability: (runId: string) => StreamDurability<TOffset>
  /**
   * The out-of-band "did the agent reach its sentinel?" probe. INJECTED, because
   * neither the delivery log nor this package can answer it — see the module doc.
   * {@link probeRunExit} is the implementation an application wires in once it has
   * resolved the run's `SandboxHandle`.
   */
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
  /**
   * Tear the run's sandbox down. Called ONLY after the run reached a terminal
   * status, and with the ORIGINALLY LISTED record — see {@link reapDetachedRuns}.
   * `sandboxReclaimer` in `reclaim.ts` is the ready-made implementation.
   */
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

/**
 * Read the END of a run's journal and answer whether the agent reached its
 * `{"__exit":N}` sentinel. Read-only: no append, no record write, no `close()`.
 *
 * This is the whole reason the reaper is safe. It is the ONLY way to learn that a
 * detached run is over without driving it, because the delivery log stops growing
 * the moment the viewer leaves while the journal does not.
 *
 * ANY failure answers `'unknown'`, never `'finished'`: the caller drives a run it
 * is told finished, so a provider `exec` that rejected, a sandbox that is gone, or
 * a frame the provider truncated must never be read as "the agent exited".
 *
 * An EMPTY tail answers `'producing'` — the fail-safe direction. A journal that
 * does not exist yet is indistinguishable here from one with no sentinel, and both
 * mean "do not touch this run".
 */
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

/**
 * Report through a consumer-supplied logger without letting it break the sweep.
 * Mirrors `run.ts`'s `safeLog`: this module's totality must not be defeated by a
 * sink that cannot serialize a thrown value.
 */
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
  /** Safety net per drive. Defaults to {@link DEFAULT_RUN_BUDGET_MS}. */
  runBudgetMs: number
  /** Quiescence window; defaults to `DEFAULT_FENCE_QUIET_MS`. */
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
  counters: {
    /** Runs {@link ReapOptions.hasFinished} was actually called for. */
    probed: number
  },
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

/**
 * Sweep ONE run. Never rejects: the caller folds the returned entry into the
 * summary and moves on.
 *
 * The ORDER of the steps below is the contract, not an implementation detail:
 *
 * 1. **Classify expiry first**, because an expired run needs no probe — its
 *    outcome is terminal whether or not the agent finished, so a probe would only
 *    add a provider round-trip and a way to fail.
 * 2. **Otherwise probe BEFORE touching anything.** `'producing'` and `'unknown'`
 *    return here, having made no claim, no append, no record write, and no
 *    `close()`. Driving past this point is the whole defect described in the
 *    module doc.
 * 3. Claim, so two hosts never drive one run.
 * 4. **Re-derive expiry from a record read INSIDE the lock**, and only then
 *    record the cancel. The listed record is stale by the time the claim is
 *    held, and the cancel is sticky.
 * 5. Quiesce, so a predecessor still writing is observed rather than raced.
 * 6. **Arm the run budget**, so it bounds the drive rather than the queue the
 *    two steps above stood in.
 * 7. Pipe with BOTH authoritative seams fenced, mirroring `driver.ts`.
 * 8. Reclaim, and ONLY once the record actually reached terminal.
 */
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

/**
 * Sweep the detached runs a `RunStore` surfaces, saving each finished run's
 * transcript and reclaiming its sandbox.
 *
 * A plain async function with no timer and no daemon: call it from a cron, a
 * queue consumer, a Durable Object `alarm()`, or a `waitUntil`. It NEVER rejects
 * — every failure is logged and counted in the returned {@link ReapResult}.
 *
 * ONE `listReclaimable({ now, ttlMs: 0 })` call, deliberately: `ttlMs: 0` is
 * every detached run, which is the candidate set for FINALIZATION (a run that hit
 * its sentinel one second after the viewer left has an unsaved transcript and
 * must not wait out the TTL), and expiry is then classified in-process against
 * the same inclusive cutoff. Listing twice with two TTLs would cost a second
 * store round-trip to compute a subset.
 *
 * `listReclaimable` is OPTIONAL on `RunStore`. A backend without it cannot be
 * reaped, which answers `{ considered: 0 }` plus one log line rather than
 * throwing — the same graceful degrade every other optional-method call site in
 * the repo does (`store.findActiveRun?.(threadId)`).
 */
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

  /** Batch cap. Defaults to {@link DEFAULT_MAX_RUNS}. */
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
