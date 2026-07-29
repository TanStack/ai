/**
 * The sweep `RunStore.listReclaimable` was always missing a consumer for: take a
 * detached run whose viewer never came back, save its transcript, terminalize its
 * record, and tear its sandbox down.
 *
 * THE ONE RULE THAT SHAPES EVERYTHING HERE: **never drive a run to find out
 * whether it finished.**
 *
 * The obvious design — hand the run to `pipeToRunLog` under a short
 * `runBudgetMs` and see whether it terminalizes — was measured and is broken.
 * `pipeToRunLog` is total by construction: it ALWAYS writes a terminal status and
 * ALWAYS calls `durability.close()`. Against a run that has not finished, all
 * three producer shapes are destructive:
 *
 * | producer's reaction to the budget signal | stored status | `close()` |
 * | ---------------------------------------- | ------------- | --------- |
 * | ignores it and keeps producing           | `aborted`     | called    |
 * | returns on abort (the realistic `drive`)  | `completed`   | called    |
 * | throws an AbortError                     | `failed`      | called    |
 *
 * The middle row is the fatal one, and it is the shape a well-behaved `drive`
 * actually has: a signal-aware producer exits its loop NORMALLY, so
 * `pipeToRunLog` sees a stream that ended and records a healthy mid-flight run as
 * `'completed'` with a `finishedAt`. That is a false transcript, it closes a log
 * that commit `5a1f821c9` deliberately leaves OPEN for takeover (ending every
 * attached client's stream), and — worst — a terminal record drops out of
 * `listReclaimable` forever, so TTL expiry can never reclaim that run's sandbox.
 * A cost leak with no recovery path. There is therefore no "still running"
 * outcome in {@link ReapRunOutcome}: it is unreachable by construction, not
 * merely unlikely.
 *
 * So sentinel-reached is detected OUT OF BAND, through the in-sandbox journal
 * ({@link probeRunExit}), and `pipeToRunLog` is entered only for a run already
 * KNOWN to have finished, or for one whose TTL has expired (terminal either way).
 * `runBudgetMs` degrades from a load-bearing mechanism into a safety net whose
 * expiry is a genuine anomaly — see `'budget-exceeded'`.
 *
 * WHY THE PROBE IS INJECTED (`ReapOptions.hasFinished`) rather than resolved
 * here, exactly like `ReapOptions.reclaim`:
 *
 * - It cannot read `durability.snapshot()`. After a detach nothing appends to the
 *   delivery log — the host that would have appended is the host that left — so
 *   the log is frozen at the last delivered chunk while the JOURNAL keeps
 *   growing. The log can only ever say "no news".
 * - It cannot resolve a `SandboxHandle` either. `SandboxInstanceStore` is
 *   `get`/`upsert`/`delete` with no `list` (see `reclaim.ts` for why that is
 *   deliberate), and only the application maps a `sandboxKey` to a live handle.
 *
 * NEVER REJECTS. This runs from a cron, an `alarm()`, or a `waitUntil` with
 * nobody to catch it, so every per-run failure is logged and folded into
 * {@link ReapResult} rather than escaping.
 *
 * NEVER CLEARS `detachedSince`. That field is what the reaper SELECTS on, and
 * `packages/ai/src/stream-to-response.ts`'s `startRunDriver` clears it because a
 * real viewer stopping the TTL clock is the opposite job. Its comment there names
 * borrowing that path "the single most likely bug in this phase"; clearing the
 * marker would reset the TTL on every sweep and a detached run would never
 * expire.
 */
import { isTerminalRunStatus, requestRunCancel } from '@tanstack/ai'
import {
  DEFAULT_FENCE_QUIET_MS,
  RunClaimLostError,
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
export const DEFAULT_EXIT_PROBE_BYTES = 4096

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
  | { state: 'finished'; exitCode: number }
  /** No sentinel. The agent is mid-flight (or never started). LEAVE IT ALONE. */
  | { state: 'producing' }
  /** The probe could not answer — no sandbox, `exec` rejected, frame undecodable. */
  | { state: 'unknown'; error?: unknown }

/** What one sweep did to one run. */
export type ReapRunOutcome =
  /**
   * The probe saw `{"__exit":N}`, the run was driven to a terminal status, and
   * its transcript is saved. The happy path.
   */
  | 'finalized'
  /**
   * Past `detachedRunTtlMs`. Cancelled first, then driven to terminal. The probe
   * is skipped: the outcome is terminal whether the agent finished or not.
   */
  | 'expired'
  /**
   * Still producing. `pipeToRunLog` was NEVER entered — nothing appended, no
   * terminal record written, `close()` not called, `detachedSince` untouched.
   */
  | 'producing'
  /** The probe could not answer. Left exactly as untouched as `'producing'`. */
  | 'unknown'
  /**
   * ANOMALY. The drive outran {@link ReapOptions.runBudgetMs} on a run the
   * journal already said was finished. The record IS terminal and the log IS
   * closed (`pipeToRunLog` guarantees both), so this is a diagnostic, not a leak
   * — but a finished run that would not replay in 30s means the journal read, the
   * translation, or the log is misbehaving.
   */
  | 'budget-exceeded'
  /**
   * Another host holds the claim, or held it and superseded us mid-drive. Normal:
   * a real viewer attaching mid-sweep is exactly this. Also covers a run that
   * reached terminal in another host's hands between the listing and the claim.
   */
  | 'not-claimed'
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
   * `'budget-exceeded'` only: whether the record nonetheless reached a terminal
   * status. Practically always `true`, since `pipeToRunLog` is total — it is
   * reported rather than assumed so an operator does not have to infer it.
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

export interface ReapOptions {
  runs: RunStore
  locks: LockStore
  /** Per-run event log factory, same shape `RunDeps.durability` takes. */
  durability: (runId: string) => StreamDurability
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
  for await (const bytes of decodeBase64Stream(singleValue(stdout))) {
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
    const exitCode = parseJournalExit(await decodeFrame(result.stdout))
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
interface ReapContext {
  options: ReapOptions
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
 * 4. Quiesce, so a predecessor still writing is observed rather than raced.
 * 5. Pipe with BOTH authoritative seams fenced, mirroring `driver.ts`.
 * 6. Reclaim, and ONLY once the record actually reached terminal.
 */
async function reapOne(
  record: RunRecord,
  ctx: ReapContext,
  counters: { probed: number },
): Promise<ReapRunEntry> {
  const { runs, locks, logger } = ctx.options
  const { runId, threadId } = record

  try {
    // INCLUSIVE, exactly as `RunStore.listReclaimable` documents its own cutoff:
    // a run detached at precisely `now - ttlMs` IS expired. The two must agree,
    // or a run would be listed as reclaimable and then classified as fresh on
    // every single sweep, forever.
    const expired =
      record.detachedSince !== undefined && record.detachedSince <= ctx.cutoff

    let exitCode: number | undefined
    if (!expired) {
      counters.probed += 1
      const probe = await ctx.options.hasFinished(record)
      if (probe.state !== 'finished') {
        // THE LEAVE-ALONE PATH. Deliberately returns before `withRunClaim`, so
        // not even `driverEpoch` moves — and above all `detachedSince` is left
        // exactly as it was, since it is both this run's TTL evidence and the
        // field the next sweep selects on.
        safeLog(logger, 'sandbox', `reap: leaving run ${runId} alone`, {
          runId,
          state: probe.state,
          ...(probe.state === 'unknown' && probe.error !== undefined
            ? { error: probe.error }
            : {}),
        })
        return {
          runId,
          outcome: probe.state,
          ...(probe.state === 'unknown' && probe.error !== undefined
            ? { error: probe.error }
            : {}),
        }
      }
      exitCode = probe.exitCode
    }

    if (expired) {
      // BEFORE the drive, never after. `withSandbox`'s `onAbort` resolves the
      // out-of-band cancel band from the record, so recording the intent first is
      // what makes the teardown an explicit cancel that DESTROYS the sandbox
      // rather than a second detach that re-arms `detachedSince` and leaves the
      // run to be swept again forever. Recorded after the drive it is pure
      // bookkeeping on a run that already tore down the wrong way.
      await requestRunCancel(runs, runId)
    }

    // A safety net, not a mechanism (see the module doc). `AbortSignal.any` is
    // this package's idiom for linking one — see `testkit/takeover-conformance.ts`.
    const budget = AbortSignal.timeout(ctx.runBudgetMs)
    const final = await withRunClaim(
      {
        runs,
        locks,
        runId,
        fenceQuietMs: ctx.fenceQuietMs,
        ...(logger === undefined ? {} : { logger }),
      },
      async (claim) => {
        // `claim.signal` is in the composed signal because losing the lease MUST
        // stop the drive: a successor that took the run over is appending to the
        // same log, and this drive continuing would double every chunk.
        const signal = AbortSignal.any([claim.signal, budget])
        // Before the first append, never after: `pipeToRunLog` snapshots to align.
        await awaitLogQuiescence(
          ctx.options.durability(runId),
          ctx.fenceQuietMs,
        )
        return pipeToRunLog(ctx.options.drive({ runId, threadId, signal }), {
          // BOTH seams, over the SAME claim, as `driver.ts` explains: fencing the
          // log alone just moves the harm to "a dead host marks the successor's
          // live run failed".
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
    let outcome: ReapRunOutcome
    if (budget.aborted) {
      outcome = 'budget-exceeded'
    } else if (!terminal) {
      // The terminal write was SUPPRESSED and `finish`'s re-read answered with a
      // live record, which `fenceRunStore` only does when this host lost the claim
      // to another one. That is the same fact as a refused claim, reported the
      // same way rather than as a success that wrote nothing.
      outcome = 'not-claimed'
    } else {
      outcome = expired ? 'expired' : 'finalized'
    }

    if (terminal && ctx.options.reclaim !== undefined) {
      // `record`, NOT `final`. When the terminal `update` fails, `finish` returns
      // a LOCALLY REBUILT record that carries only `runId`/`threadId`/`startedAt`
      // plus the terminal patch — no `sandboxKey` — so `reclaimSandbox` would see
      // `undefined`, answer `'no-sandbox-key'`, and the sandbox would leak
      // silently on exactly the path where something already went wrong.
      await ctx.options.reclaim(record)
    }

    return {
      runId,
      outcome,
      status: final.status,
      ...(exitCode === undefined ? {} : { exitCode }),
      ...(outcome === 'budget-exceeded'
        ? { terminalizedAnyway: terminal }
        : {}),
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
export async function reapDetachedRuns(
  options: ReapOptions,
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

  // Capped so one invocation cannot outlive its platform's budget and be killed
  // mid-drive. `slice` and not a `break`, so `considered` reports the batch the
  // sweep actually took responsibility for.
  const maxRuns = Math.max(0, Math.trunc(options.maxRuns ?? DEFAULT_MAX_RUNS))
  const batch = candidates.slice(0, maxRuns)

  const ctx: ReapContext = {
    options,
    runBudgetMs: options.runBudgetMs ?? DEFAULT_RUN_BUDGET_MS,
    fenceQuietMs: options.fenceQuietMs ?? DEFAULT_FENCE_QUIET_MS,
    cutoff: options.now - options.detachedRunTtlMs,
  }
  const counters = { probed: 0 }

  // Sequential on purpose: each run costs a lock, a provider round-trip, and a
  // full replay, and a cron invocation's budget is the scarce resource. Fanning
  // out would multiply peak load against the provider for no throughput a
  // subsequent tick cannot supply.
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
