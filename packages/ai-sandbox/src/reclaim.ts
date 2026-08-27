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
  | 'destroy-failed'
  /** The run never ran in a sandbox. */
  | 'no-sandbox-key'
  /** No instance record for that key; nothing to do. */
  | 'not-found'
  /** The record belongs to a different provider; refused. */
  | 'provider-mismatch'

export async function reclaimSandbox(
  record: RunRecord,
  options: ReclaimSandboxOptions,
): Promise<ReclaimOutcome> {
  const key = record.sandboxKey
  if (key === undefined) return 'no-sandbox-key'

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
  await options.instances.delete(key)
  return destroyFailed ? 'destroy-failed' : 'destroyed'
}

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
      options.logger?.errors(
        'reclaim: destroy failed; sandbox may still be running',
        meta,
      )
      throw new SandboxReclaimFailedError(record.runId, record.sandboxKey)
    }
    options.logger?.sandbox(`reclaim: ${outcome}`, meta)
  }
}
