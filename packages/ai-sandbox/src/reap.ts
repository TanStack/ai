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
 * | returns on abort (the realistic `drive`)  | `aborted`     | called    |
 * | throws an AbortError                     | `failed`      | called    |
 *
 * The middle row USED to read `completed`, which was the fatal one: a signal-aware
 * producer exits its loop NORMALLY, and `pipeToRunLog` only checked its signal
 * per chunk, so a healthy mid-flight run was recorded as `'completed'` with a
 * `finishedAt` — a false transcript. That gap is fixed (`run.ts` re-checks the
 * signal after the loop), so the status is now honest on all three rows. The rule
 * above is UNCHANGED, because the status was never the whole harm: every row
 * writes a terminal record and closes a log that commit `5a1f821c9` deliberately
 * leaves OPEN for takeover (ending every attached client's stream), and a terminal
 * record drops out of `listReclaimable` forever, so TTL expiry can never reclaim
 * that run's sandbox. A cost leak with no recovery path. There is therefore no
 * "still running" outcome in {@link ReapRunOutcome}: it is unreachable by
 * construction, not merely unlikely.
 *
 * So sentinel-reached is detected OUT OF BAND, through the in-sandbox journal
 * ({@link probeRunExit}), and `pipeToRunLog` is entered only for a run already
 * KNOWN to have finished, or for one whose TTL has expired (terminal either way).
 * On the FINALIZATION path `runBudgetMs` therefore degrades from a load-bearing
 * mechanism into a safety net whose expiry is a genuine anomaly — see
 * `'budget-exceeded'`. On the EXPIRY path it stays load-bearing: nothing polls the
 * cancel this module records, so the budget is what ends the drive of an expired
 * run whose agent is still producing, and its expiry there is the designed path.
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
   *
   * Reported even when {@link ReapOptions.runBudgetMs} is what ended the drive —
   * on this path that is the mechanism rather than an anomaly, so `'expired'` is
   * the truthful outcome. The run's own `status` distinguishes the two shapes:
   * an agent that had already finished replays to `'completed'`, while one still
   * producing when the budget fired is `'aborted'`.
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
   *
   * FINALIZATION ONLY. An expired run that outran its budget reports `'expired'`:
   * there was no probe on that path and the agent may legitimately still have been
   * producing, so the budget firing is the designed stop, not a misbehaving replay.
   */
  | 'budget-exceeded'
  /**
   * Another host holds the claim, or held it and superseded us mid-drive. Normal:
   * a real viewer attaching mid-sweep is exactly this. Also covers a run that
   * reached terminal in another host's hands between the listing and the claim.
   */
  | 'not-claimed'
  /**
   * The transcript IS saved and the record IS terminal — only
   * {@link ReapOptions.reclaim} threw, so the sandbox is still up.
   *
   * A DISTINCT outcome rather than `'failed'`, because the two need opposite
   * operator responses and `'failed'` cannot express this one: it carries no
   * `status` and no `exitCode`, so "transcript saved, sandbox NOT reclaimed"
   * read identically to "the sweep failed and the run was never finalized".
   *
   * NOT RETRYABLE BY THE SWEEP. The record is terminal by now, so the run has
   * left `listReclaimable` for good; the sandbox leaks until something else
   * tears it down. This entry, with its `error`, is the only notice of that.
   *
   * OVERWRITES `'budget-exceeded'` when both happened, because the leak is what
   * needs acting on — {@link ReapRunEntry.terminalizedAnyway} is what preserves
   * the budget half of that pair.
   *
   * `sandboxReclaimer` REJECTS on its `'destroy-failed'` arm precisely so this
   * outcome is reachable through the shipped reclaimer and not only through a
   * custom one; see `SandboxReclaimFailedError` in `reclaim.ts`.
   */
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
    // `paths` supplies the per-run sentinel nonce: without it a mid-flight
    // agent that printed any JSON object carrying `__exit` would read as
    // `'finished'` here, and the caller would drive and reclaim a LIVE run.
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
  if (probe.state !== 'unknown' || probe.error === undefined) return {}
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
    // THE LEAVE-ALONE PATH. Deliberately returns before `withRunClaim`, so
    // not even `driverEpoch` moves — and above all `detachedSince` is left
    // exactly as it was, since it is both this run's TTL evidence and the
    // field the next sweep selects on.
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
  if (budgetAborted && !expired) return 'budget-exceeded'
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
    // CAUGHT HERE rather than in the outer catch, which would report a bare
    // `'failed'` with no `status` and no `exitCode`. `reclaimSandbox`
    // deliberately does not guard `instances.get` (its contract is that the
    // CALLER records the failure) and neither does `sandboxReclaimer`, so a
    // throwing instance store landed there. By this point the record is
    // terminal and the log closed, so the run is out of `listReclaimable`
    // forever and no later sweep will retry: the sandbox leaks, and an
    // operator reading `'failed'` cannot tell "transcript saved, sandbox NOT
    // reclaimed" from "the sweep failed and the run was never finalized".
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
    // INCLUSIVE, exactly as `RunStore.listReclaimable` documents its own cutoff:
    // a run detached at precisely `now - ttlMs` IS expired. The two must agree,
    // or a run would be listed as reclaimable and then classified as fresh on
    // every single sweep, forever.
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
          // RE-DERIVED FROM A RECORD READ INSIDE THE LOCK, never from the listed
          // one. `stream-to-response.ts`'s `startRunDriver` CLEARS
          // `detachedSince` when a real viewer attaches — deliberately stopping
          // the TTL clock — and it takes this same per-run lock, so an
          // expiry decided at listing time is stale by the time the claim is
          // held. Cancelling on the stale value poisoned a now-live run:
          // nothing in the tree ever clears `cancelRequested`, so on that
          // viewer's next ORDINARY disconnect `middleware.ts`'s
          // `wasCancelRequested` read skips the detach branch and destroys the
          // sandbox of a healthy, actively-viewed run.
          const current = await runs.get(runId)
          if (current === null) {
            throw new RunClaimNotAcquiredError(runId, 'unknown')
          }
          if (
            current.detachedSince === undefined ||
            current.detachedSince > ctx.cutoff
          ) {
            // The viewer came back. `'not-claimed'` already documents "a real
            // viewer attaching mid-sweep is exactly this", and refusing here
            // leaves the run as untouched as the leave-alone path does: no
            // cancel, no append, no terminal record, no `close()`.
            throw new RunClaimNotAcquiredError(runId, 'superseded')
          }
          // BEFORE the drive, never after — and never before the claim.
          // `withSandbox`'s `onAbort` resolves the out-of-band cancel band from
          // the record, so recording the intent first is what makes the teardown
          // an explicit cancel that DESTROYS the sandbox rather than a second
          // detach that re-arms `detachedSince` and leaves the run to be swept
          // again forever. Recorded after the drive it is pure bookkeeping on a
          // run that already tore down the wrong way. Recorded before the CLAIM
          // it is an unfenced, sticky write on a record this host does not own,
          // derived from a value the lock exists to make current.
          await requestRunCancel(runs, runId)
        }
        // Before the first append, never after: `pipeToRunLog` snapshots to align.
        await awaitLogQuiescence(
          ctx.options.durability(runId),
          ctx.fenceQuietMs,
        )
        // A safety net, not a mechanism (see the module doc). `AbortSignal.any`
        // is this package's idiom for linking one — see
        // `testkit/takeover-conformance.ts`.
        //
        // ARMED HERE, not before `withRunClaim`. Both the lock wait and the
        // quiescence wait consume a timer started earlier: quiescence always
        // sleeps at least one `fenceQuietMs` and may sleep six, and lock
        // acquisition waits behind whoever holds it, unbounded. The effective
        // budget was silently `runBudgetMs − fenceQuietMs − lockWait`, and once
        // it went negative the claim was acquired with the timer already fired:
        // `pipeToRunLog` hit its entry `signal.aborted` check before pulling one
        // chunk, so a FINISHED agent's transcript was recorded `'aborted'` and
        // its log closed — and a terminal record leaves `listReclaimable`
        // forever, so that transcript was then unreplayable while `reclaim`
        // destroyed the sandbox holding the only copy. The budget bounds the
        // DRIVE, not the queue.
        budget = AbortSignal.timeout(ctx.runBudgetMs)
        // `claim.signal` is in the composed signal because losing the lease MUST
        // stop the drive: a successor that took the run over is appending to the
        // same log, and this drive continuing would double every chunk.
        const signal = AbortSignal.any([claim.signal, budget])
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
    // `&& !expired` is the whole subtlety. The budget is an ANOMALY only on the
    // finalization path, where the probe already said the agent hit its sentinel
    // and a replay that will not finish in 30s means the journal read, the
    // translation, or the log is misbehaving. On the EXPIRY path there was no
    // probe and the agent may well be mid-sentence: `requestRunCancel` writes a
    // record field whose only reader is `withSandbox`'s `onAbort` (which runs
    // after something else has already aborted), so the budget is the sole thing
    // that ends the drive of a still-producing expired run. That is the designed
    // path, not a misbehaving one, and reporting it as the anomaly made
    // `'expired'` unreachable for exactly the runs the TTL exists to expire.
    // `budget` is armed inside the claim, so reaching here means it was armed;
    // `?? false` keeps the read total rather than asserting that.
    let outcome = classifyDriveOutcome(
      expired,
      terminal,
      budget?.aborted ?? false,
    )

    // CAPTURED BEFORE THE RECLAIM BLOCK, which may overwrite `outcome` with
    // `'reclaim-failed'`. Conditioning the `terminalizedAnyway` spread on the
    // post-reclaim `outcome` dropped the budget diagnostic from exactly the
    // entries that need it most: a run that blew its budget AND then failed to
    // reclaim reported neither fact but the leak, and an operator cannot
    // diagnose a leak on a run whose replay was already misbehaving without
    // knowing that it was.
    const budgetAnomaly = outcome === 'budget-exceeded'
    // `record`, NOT `final`. When the terminal `update` fails, `finish` returns
    // a LOCALLY REBUILT record that carries only `runId`/`threadId`/`startedAt`
    // plus the terminal patch — no `sandboxKey` — so `reclaimSandbox` would see
    // `undefined`, answer `'no-sandbox-key'`, and the sandbox would leak
    // silently on exactly the path where something already went wrong.
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

  // Capped so one invocation cannot outlive its platform's budget and be killed
  // mid-drive. `slice` and not a `break`, so `considered` reports the batch the
  // sweep actually took responsibility for.
  const maxRuns = Math.max(0, Math.trunc(options.maxRuns ?? DEFAULT_MAX_RUNS))
  const batch = candidates.slice(0, maxRuns)

  const ctx: ReapContext<TOffset> = {
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
