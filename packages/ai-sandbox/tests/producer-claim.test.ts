/**
 * The fresh producer must hold the run-driver claim until its terminal hook.
 * A takeover waits on that claim. A quiet tool call must not let it start.
 */
import { describe, expect, it } from 'vitest'
import { InMemoryRunStore, memoryStream } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { provideSandboxRuntime } from '@tanstack/ai/adapter-internals'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import { withRunClaim } from '../src/claim'
import { captureLogger, makeFakeProvider, makeMiddlewareCtx } from './fakes'
import type { LockStore } from '@tanstack/ai/locks'
import type { RunStore } from '@tanstack/ai'

function harness(input: {
  runId: string
  locks: LockStore
  runs: RunStore
  attach?: boolean
}) {
  const ctx = makeMiddlewareCtx({ threadId: 't1', runId: input.runId })
  provideSandboxRuntime(ctx, {
    logger: captureLogger().logger,
    emit: () => undefined,
    emitFileDiff: () => undefined,
  })
  const middleware = withSandbox(
    defineSandbox({
      id: 's',
      provider: makeFakeProvider(),
      lifecycle: { snapshot: 'none' },
      fileEvents: false,
    }),
    {
      locks: input.locks,
      runs: input.runs,
      durability: {
        adapter: memoryStream({ runId: input.runId }),
        ...(input.attach === true ? { attach: true } : {}),
      },
    },
  )
  return { ctx, middleware }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('fresh producer driver claim', () => {
  it('keeps a takeover out until the run ends', async () => {
    const locks = new InMemoryLockStore()
    const runs = new InMemoryRunStore()
    const { ctx, middleware } = harness({ runId: 'quiet', locks, runs })
    await middleware.setup?.(ctx)
    expect((await runs.get('quiet'))?.driverEpoch).toBe(1)

    let entered = false
    const takeover = withRunClaim({ runs, locks, runId: 'quiet' }, async () => {
      entered = true
    })
    await wait(30)
    expect(entered).toBe(false)

    await middleware.onFinish?.(ctx, {
      finishReason: 'stop',
      duration: 1,
      content: '',
    })
    await takeover
    expect(entered).toBe(true)
    expect((await runs.get('quiet'))?.driverEpoch).toBe(2)
  })

  it('does not take the claim again from inside an existing claim', async () => {
    const locks = new InMemoryLockStore()
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'inner',
      threadId: 't1',
      startedAt: 1,
    })
    await withRunClaim({ runs, locks, runId: 'inner' }, async () => {
      const { ctx, middleware } = harness({ runId: 'inner', locks, runs })
      await middleware.setup?.(ctx)
      expect((await runs.get('inner'))?.driverEpoch).toBe(1)
      await middleware.onFinish?.(ctx, {
        finishReason: 'stop',
        duration: 1,
        content: '',
      })
    })
  })

  it('an attach does not hold the claim', async () => {
    const locks = new InMemoryLockStore()
    const runs = new InMemoryRunStore()
    const { ctx, middleware } = harness({
      runId: 'attach',
      locks,
      runs,
      attach: true,
    })
    await middleware.setup?.(ctx)
    expect((await runs.get('attach'))?.driverEpoch).toBeUndefined()

    let entered = false
    await withRunClaim({ runs, locks, runId: 'attach' }, async () => {
      entered = true
    })
    expect(entered).toBe(true)
  })
})
