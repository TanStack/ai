import { describe, expect, it, vi } from 'vitest'
import { InMemorySandboxInstanceStore } from '../src/instance-store'
import { reclaimSandbox, sandboxReclaimer } from '../src/reclaim'
import { captureLogger, makeFakeProvider } from './fakes'
import type { RunRecord } from '@tanstack/ai'
import type { FakeProvider } from './fakes'

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: 'r1',
    threadId: 't1',
    status: 'completed',
    startedAt: 1,
    finishedAt: 2,
    ...overrides,
  }
}

/**
 * `makeFakeProvider`'s `destroy` only bumps a call counter, not which id was
 * passed — every assertion here needs to know exactly which
 * `providerSandboxId` was handed to `destroy`, so wrap it to also record that.
 */
function trackDestroys(provider: FakeProvider): {
  provider: FakeProvider
  destroyed: Array<string>
} {
  const destroyed: Array<string> = []
  const originalDestroy = provider.destroy
  provider.destroy = (input) => {
    destroyed.push(input.id)
    return originalDestroy(input)
  }
  return { provider, destroyed }
}

async function storeWith(
  key: string,
  providerName: string,
  providerSandboxId: string,
): Promise<InMemorySandboxInstanceStore> {
  const instances = new InMemorySandboxInstanceStore()
  await instances.upsert({
    key,
    provider: providerName,
    providerSandboxId,
    threadId: 't1',
    updatedAt: 1,
  })
  return instances
}

describe('reclaimSandbox', () => {
  it('destroys the provider sandbox and deletes the instance record', async () => {
    const { provider, destroyed } = trackDestroys(makeFakeProvider())
    const instances = await storeWith('k1', 'fake', 'sbx-1')
    const outcome = await reclaimSandbox(record({ sandboxKey: 'k1' }), {
      provider,
      instances,
    })
    expect(outcome).toBe('destroyed')
    expect(destroyed).toEqual(['sbx-1'])
    // Leaving the record would make the next `ensure` try to resume a sandbox
    // that no longer exists.
    expect(await instances.get('k1')).toBeNull()
  })

  it('deletes the instance record even when destroy fails', async () => {
    // The provider sandbox may already be gone (idle-reclaimed, region wiped).
    // Keeping a record that points at nothing guarantees a failed resume on the
    // thread's next turn, which is worse than an orphaned provider sandbox.
    const { provider, destroyed } = trackDestroys(makeFakeProvider())
    provider.destroy = () => Promise.reject(new Error('already gone'))
    const instances = await storeWith('k1', 'fake', 'sbx-1')
    const outcome = await reclaimSandbox(record({ sandboxKey: 'k1' }), {
      provider,
      instances,
    })
    // The delete is unconditional — but the outcome must NOT claim success.
    expect(outcome).toBe('destroy-failed')
    expect(await instances.get('k1')).toBeNull()
    expect(destroyed).toEqual([])
  })

  it('reports destroy-failed, distinctly from destroyed, when the provider throws', async () => {
    /*
     * `destroy-failed` is the ONE outcome meaning the cost leak the reaper exists
     * to stop is still leaking: the sandbox may still be running and, with its
     * record deleted and no `list` on the store, is now unreachable. Folding it
     * into `'destroyed'` reported that as a clean teardown.
     */
    const { provider } = trackDestroys(makeFakeProvider())
    provider.destroy = () => Promise.reject(new Error('provider 500'))
    const failing = await storeWith('k1', 'fake', 'sbx-1')
    const okProvider = trackDestroys(makeFakeProvider()).provider
    const succeeding = await storeWith('k2', 'fake', 'sbx-2')

    const failed = await reclaimSandbox(record({ sandboxKey: 'k1' }), {
      provider,
      instances: failing,
    })
    const ok = await reclaimSandbox(record({ sandboxKey: 'k2' }), {
      provider: okProvider,
      instances: succeeding,
    })

    expect(failed).toBe('destroy-failed')
    expect(ok).toBe('destroyed')
    expect(failed).not.toBe(ok)
  })

  it('reports no-sandbox-key when the run never ran in a sandbox', async () => {
    const { provider, destroyed } = trackDestroys(makeFakeProvider())
    const outcome = await reclaimSandbox(record(), {
      provider,
      instances: new InMemorySandboxInstanceStore(),
    })
    expect(outcome).toBe('no-sandbox-key')
    expect(destroyed).toEqual([])
  })

  it('reports not-found when the instance record is already gone', async () => {
    const { provider, destroyed } = trackDestroys(makeFakeProvider())
    const outcome = await reclaimSandbox(record({ sandboxKey: 'k1' }), {
      provider,
      instances: new InMemorySandboxInstanceStore(),
    })
    expect(outcome).toBe('not-found')
    expect(destroyed).toEqual([])
  })

  it('refuses to destroy through a DIFFERENT provider than the one that created it', async () => {
    // A multi-provider app could otherwise hand a Docker container id to
    // Daytona's destroy, which at best errors and at worst matches an unrelated
    // sandbox id in the other provider's namespace.
    const { provider, destroyed } = trackDestroys(
      makeFakeProvider({ name: 'docker' }),
    )
    const instances = await storeWith('k1', 'daytona', 'sbx-1')
    const outcome = await reclaimSandbox(record({ sandboxKey: 'k1' }), {
      provider,
      instances,
    })
    expect(outcome).toBe('provider-mismatch')
    expect(destroyed).toEqual([])
    // And it must NOT delete a record it did not act on.
    expect(await instances.get('k1')).not.toBeNull()
  })

  it('rejects when the instance store fails, so the reaper records it against the run', async () => {
    // Swallowing this here would hide a leaking sandbox entirely: the caller
    // wouldn't know it failed to even look up what to destroy.
    const { provider, destroyed } = trackDestroys(makeFakeProvider())
    const instances = new InMemorySandboxInstanceStore()
    vi.spyOn(instances, 'get').mockRejectedValue(new Error('store down'))
    await expect(
      reclaimSandbox(record({ sandboxKey: 'k1' }), { provider, instances }),
    ).rejects.toThrow('store down')
    expect(destroyed).toEqual([])
  })
})

describe('sandboxReclaimer', () => {
  it("adapts reclaimSandbox to the reaper's reclaim callback", async () => {
    const { provider, destroyed } = trackDestroys(makeFakeProvider())
    const instances = await storeWith('k1', 'fake', 'sbx-1')
    const reclaim = sandboxReclaimer({ provider, instances })
    await expect(reclaim(record({ sandboxKey: 'k1' }))).resolves.toBeUndefined()
    expect(destroyed).toEqual(['sbx-1'])
    expect(await instances.get('k1')).toBeNull()
  })

  it('rejects when the instance store itself fails, so the reaper records it', async () => {
    // The reaper catches this and reports a `finalized` outcome carrying the
    // error. Swallowing it here would hide a leaking sandbox entirely.
    const instances = new InMemorySandboxInstanceStore()
    vi.spyOn(instances, 'get').mockRejectedValue(new Error('store down'))
    const reclaim = sandboxReclaimer({
      provider: makeFakeProvider(),
      instances,
    })
    await expect(reclaim(record({ sandboxKey: 'k1' }))).rejects.toThrow(
      'store down',
    )
  })

  it('logs a failed destroy ABOVE debug level, so an operator sees the leak', async () => {
    const { provider } = trackDestroys(makeFakeProvider())
    provider.destroy = () => Promise.reject(new Error('provider 500'))
    const instances = await storeWith('k1', 'fake', 'sbx-1')
    const { logger, calls } = captureLogger()

    await sandboxReclaimer({ provider, instances, logger })(
      record({ sandboxKey: 'k1' }),
    )

    // `logger.sandbox` routes to `debug`, which is off unless someone opted into
    // sandbox debugging — exactly the wrong level for "a sandbox may still be
    // billing and is no longer reachable from here".
    const errors = calls.filter((c) => c.level === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]?.msg).toContain('destroy failed')
  })

  it('keeps a successful teardown at debug level', async () => {
    const { provider } = trackDestroys(makeFakeProvider())
    const instances = await storeWith('k1', 'fake', 'sbx-1')
    const { logger, calls } = captureLogger()

    await sandboxReclaimer({ provider, instances, logger })(
      record({ sandboxKey: 'k1' }),
    )

    expect(calls.filter((c) => c.level === 'error')).toHaveLength(0)
    expect(calls.some((c) => c.level === 'debug')).toBe(true)
  })
})
