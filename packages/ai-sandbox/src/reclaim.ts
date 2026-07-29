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

  try {
    await options.provider.destroy({ id: instance.providerSandboxId })
  } catch (error) {
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
  await options.instances.delete(key)
  return 'destroyed'
}

/** Adapt {@link reclaimSandbox} to `ReapOptions.reclaim`. */
export function sandboxReclaimer(
  options: ReclaimSandboxOptions,
): (record: RunRecord) => Promise<void> {
  return async (record) => {
    const outcome = await reclaimSandbox(record, options)
    options.logger?.sandbox(`reclaim: ${outcome}`, {
      runId: record.runId,
      ...(record.sandboxKey === undefined
        ? {}
        : { sandboxKey: record.sandboxKey }),
    })
  }
}
