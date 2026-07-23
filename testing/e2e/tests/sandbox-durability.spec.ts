import { expect, test } from '@playwright/test'

/**
 * Server-side sandbox-persistence durability.
 *
 * Two independent runs (separate HTTP requests → fresh middleware contexts) for
 * the same thread. The only shared state is the harness route's module-singleton
 * `SandboxStore` provided via `withSandboxPersistence`. The second run must
 * RESUME the sandbox the first created, proving durable resume survives across
 * runs rather than re-creating on every request.
 *
 * Provider-free (fixed AG-UI stream + fake sandbox provider), so it is exempt
 * from the aimock policy.
 */
interface DurabilityResult {
  create: number
  resume: number
  providerSandboxId: string | null
  latestRunId: string | null
}

test.describe('sandbox persistence durability (server-side resume)', () => {
  test('a second run resumes the persisted sandbox instead of creating a new one', async ({
    request,
  }) => {
    const threadId = `sandbox-durability-${Date.now()}`

    const first = await request.post('/api/sandbox-durability', {
      data: { threadId, runId: 'run-1' },
    })
    expect(first.ok()).toBe(true)
    const firstBody = (await first.json()) as DurabilityResult
    expect(firstBody.create).toBe(1)
    expect(firstBody.resume).toBe(0)
    expect(firstBody.providerSandboxId).not.toBeNull()

    const second = await request.post('/api/sandbox-durability', {
      data: { threadId, runId: 'run-2' },
    })
    expect(second.ok()).toBe(true)
    const secondBody = (await second.json()) as DurabilityResult

    // No second create: the run resumed the sandbox persisted by run-1.
    expect(secondBody.create).toBe(1)
    expect(secondBody.resume).toBe(1)
    expect(secondBody.providerSandboxId).toBe(firstBody.providerSandboxId)
    // The store advanced the record's latest run to the resuming run.
    expect(secondBody.latestRunId).toBe('run-2')
  })
})
