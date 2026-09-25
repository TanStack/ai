/**
 * Tear down the sandbox behind a terminal run.
 *
 * `RunRecord.sandboxKey` exists so this does not have to re-derive the compound
 * key: `definition.key(ctx)` folds in the thread, the workspace hash, the tenant
 * and the reuse strategy, and the reaper has none of those. Phase 3's detach path
 * records the key at the moment it still knows it.
 *
 * DELIBERATELY NOT AN ENUMERATION. `SandboxInstanceStore` is `get`/`upsert`/
 * `delete` only, and no `list` is added: it would force every backend and the
 * conformance suite to grow an enumeration for one hypothetical caller. The
 * consequence is real and documented rather than hidden — a sandbox whose run
 * record was deleted before a sweep saw it is unreachable from here and leaks
 * until the provider's own idle reclamation takes it.
 */
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunRecord } from '@tanstack/ai'
import type { SandboxProvider } from './contracts'
import type { SandboxInstanceStore } from './instance-store'

export interface ReclaimSandboxOptions {
  provider: SandboxProvider
  instances: SandboxInstanceStore
  logger?: InternalLogger
}

export type ReclaimOutcome =
  /** The provider was asked to destroy it and the instance record is gone. */
  | 'destroyed'
  /**
   * The provider's `destroy` THREW. The instance record was still deleted (see
   * the ordering note on {@link reclaimSandbox}), so the sandbox — if it is in
   * fact still running — is now unreachable from here and bills until the
   * provider's own idle reclamation, if any.
   *
   * This is the one outcome that means the cost leak the reaper exists to stop
   * is still leaking, so it is reported distinctly instead of being folded into
   * `'destroyed'`, and {@link sandboxReclaimer} logs it above debug level.
   */
  | 'destroy-failed'
  /** The run never ran in a sandbox. */
  | 'no-sandbox-key'
  /** No instance record for that key; nothing to do. */
  | 'not-found'
  /** The record belongs to a different provider; refused. */
  | 'provider-mismatch'

/**
 * Destroy the sandbox a terminal run was bound to.
 *
 * Two orderings are load-bearing:
 *
 * - **The provider check before either `destroy` or `delete`.** A multi-provider
 *   application would otherwise hand a Docker container id to Daytona's
 *   `destroy`, which at best errors and at worst matches an unrelated sandbox
 *   in the other provider's id namespace. Getting this wrong destroys a
 *   stranger's workload, so it is the first gate — a mismatch touches NOTHING,
 *   including the record, which the right provider still needs.
 * - **`destroy` before `delete`, and `delete` regardless of whether `destroy`
 *   succeeded.** The provider sandbox may already be gone (idle-reclaimed, the
 *   region wiped, the container pruned). Keeping an instance record that points
 *   at nothing guarantees a failed `resume` on the thread's next turn, which is
 *   strictly worse than an orphaned provider sandbox — one is a broken user
 *   experience, the other is a bounded cost the provider itself will reclaim.
 *   The delete is therefore unconditional — but a failed `destroy` returns
 *   `'destroy-failed'`, not `'destroyed'`: the record is gone either way, and an
 *   operator has to be able to tell "torn down" from "possibly still billing and
 *   no longer reachable from here".
 */
export async function reclaimSandbox(
  record: RunRecord,
  options: ReclaimSandboxOptions,
): Promise<ReclaimOutcome> {
  const key = record.sandboxKey
  if (key === undefined) return 'no-sandbox-key'

  // NOT guarded: a store failure here means we do not know what to destroy, and
  // the caller (the reaper) records it against the run. Swallowing it would hide
  // a leaking sandbox entirely.
  const instance = await options.instances.get(key)
  if (instance === null) return 'not-found'

  if (instance.provider !== options.provider.name) {
    options.logger?.warn(
      'reclaim: instance record belongs to a different provider; refusing to destroy',
      {
        runId: record.runId,
        sandboxKey: key,
        recordProvider: instance.provider,
        reclaimerProvider: options.provider.name,
      },
    )
    return 'provider-mismatch'
  }

  let destroyFailed = false
  try {
    await options.provider.destroy({ id: instance.providerSandboxId })
  } catch (error) {
    destroyFailed = true
    options.logger?.warn(
      'reclaim: provider destroy failed; deleting the record anyway',
      {
        runId: record.runId,
        sandboxKey: key,
        providerSandboxId: instance.providerSandboxId,
        error,
      },
    )
  }
  // Unconditional, per the ordering note above — but the OUTCOME must not claim
  // success when the destroy threw. Reporting `'destroyed'` here made a leaked,
  // now-unreachable sandbox indistinguishable from a clean teardown.
  await options.instances.delete(key)
  return destroyFailed ? 'destroy-failed' : 'destroyed'
}

/**
 * Thrown by {@link sandboxReclaimer} when {@link reclaimSandbox} answers
 * `'destroy-failed'`.
 *
 * WHY AN EXCEPTION AND NOT A RETURN VALUE. `ReapOptions.reclaim` is
 * `(record) => Promise<void>`, and the sweep's only channel for "the sandbox was
 * NOT reclaimed" is a rejection — `reapOne` catches one and reports the run
 * `'reclaim-failed'` with its `status` and `exitCode` intact. A reclaimer that
 * logged this arm and returned normally therefore reported `'finalized'`, and
 * `outcomes['reclaim-failed']` read `0` on precisely the leak it watches for.
 *
 * It carries no `cause`: `reclaimSandbox` returns a {@link ReclaimOutcome}, not
 * the provider's rejection, and widening that return to smuggle the error out
 * would change an outcome contract whose ordering and arms are load-bearing. The
 * underlying `destroy` rejection is on `reclaimSandbox`'s own `warn` line, which
 * carries the same `runId` and `sandboxKey` this error does.
 */
export class SandboxReclaimFailedError extends Error {
  readonly runId: string
  /** Absent only in the impossible case; see the throw site in `sandboxReclaimer`. */
  readonly sandboxKey: string | undefined

  constructor(runId: string, sandboxKey: string | undefined) {
    super(
      `Reclaiming the sandbox for run "${runId}" failed: the provider's destroy rejected and the instance record${
        sandboxKey === undefined ? '' : ` for "${sandboxKey}"`
      } was deleted anyway, so the sandbox may still be running and is no longer reachable from the instance store.`,
    )
    this.name = 'SandboxReclaimFailedError'
    this.runId = runId
    this.sandboxKey = sandboxKey
  }
}

/**
 * Adapt {@link reclaimSandbox} to `ReapOptions.reclaim`.
 *
 * REJECTS on `'destroy-failed'` — see {@link SandboxReclaimFailedError} for why
 * that arm must not resolve. Every other outcome resolves: `'destroyed'` did the
 * job, and `'no-sandbox-key'` / `'not-found'` / `'provider-mismatch'` all mean
 * there is nothing for this reclaimer to tear down, which is not a sweep failure.
 */
export function sandboxReclaimer(
  options: ReclaimSandboxOptions,
): (record: RunRecord) => Promise<void> {
  return async (record) => {
    const outcome = await reclaimSandbox(record, options)
    const meta = {
      runId: record.runId,
      ...(record.sandboxKey === undefined
        ? {}
        : { sandboxKey: record.sandboxKey }),
    }
    if (outcome === 'destroy-failed') {
      // ABOVE DEBUG DELIBERATELY. Every other outcome is bookkeeping an operator
      // never needs to see; this one says a billed sandbox may still be running
      // with its only lookup row deleted, which nothing downstream will retry.
      options.logger?.errors(
        'reclaim: destroy failed; sandbox may still be running',
        meta,
      )
      // AND THEN THROWS, so the sweep's `'reclaim-failed'` outcome is reachable
      // through the shipped reclaimer and not only through a custom one. The log
      // line alone is invisible to a `ReapResult` consumer.
      //
      // `record.sandboxKey` is defined on this arm — `reclaimSandbox` answers
      // `'no-sandbox-key'` before it ever reaches `destroy` otherwise — so this
      // is passed through rather than asserted: a non-null assertion is banned
      // here, and inventing a placeholder key would put a fake id in the message.
      throw new SandboxReclaimFailedError(record.runId, record.sandboxKey)
    }
    options.logger?.sandbox(`reclaim: ${outcome}`, meta)
  }
}
