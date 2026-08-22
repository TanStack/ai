import { afterEach, describe, expect, it, vi } from 'vitest'
import { SandboxCoordinator } from '../src/coordinator'
import { runWithCallbackActivity } from '../src/coordinator-callbacks'
import { deferred, fakeCoordinatorState } from './fixtures'
import type { StartRunInput } from '../src/coordinator'
import type { StreamChunk } from '@tanstack/ai'

class TestCoordinator extends SandboxCoordinator<Record<string, never>> {
  readonly settledRuns = new Set<string>()

  constructor(state: DurableObjectState, stallTimeoutMs?: number | false) {
    super(state, {}, stallTimeoutMs)
  }
  open(input: { runId: string; threadId: string }): Promise<unknown> {
    return this.log.open(input)
  }
  touch(runId: string): Promise<void> {
    return this.log.touch(runId)
  }
  protected buildRunStream(_input: StartRunInput): AsyncIterable<StreamChunk> {
    return (async function* () {})()
  }
  protected override onRunSettled(runId: string): void {
    this.settledRuns.add(runId)
  }
}

describe('SandboxCoordinator watchdog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('enforces the strict lifecycle around callback activity', async () => {
    const startedAt = 100
    const stallTimeoutMs = 300
    const now = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    const fixture = fakeCoordinatorState()
    const coordinator = new TestCoordinator(fixture.state, stallTimeoutMs)
    await coordinator.open({ runId: 'run-1', threadId: 'thread-1' })

    now.mockReturnValue(startedAt + stallTimeoutMs)
    await fixture.invokeAlarm(coordinator)
    expect((await coordinator.status('run-1'))?.status).toBe('running')

    const entered = deferred()
    const operation = deferred()
    const callback = runWithCallbackActivity(
      coordinator,
      'run-1',
      (runId) => coordinator.touch(runId),
      async () => {
        entered.resolve()
        return operation.promise
      },
    )
    await entered.promise

    const staleDuringCallback = startedAt + 2 * stallTimeoutMs + 1
    now.mockReturnValue(staleDuringCallback)
    await fixture.invokeAlarm(coordinator)
    expect((await coordinator.status('run-1'))?.status).toBe('running')
    expect(fixture.storage.alarm).toBeGreaterThan(staleDuringCallback)

    operation.resolve()
    await callback
    now.mockReturnValue(staleDuringCallback + stallTimeoutMs + 1)
    await fixture.invokeAlarm(coordinator)

    expect(await coordinator.status('run-1')).toMatchObject({
      status: 'failed',
      error: {
        message: 'run watchdog: no progress; orchestrator presumed dead',
      },
    })
    expect(coordinator.settledRuns.has('run-1')).toBe(true)
    expect(fixture.storage.alarm).toBeNull()
  })

  it('schedules the next check within a sub-30s stall timeout', async () => {
    const startedAt = 100
    vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    const fixture = fakeCoordinatorState()
    const coordinator = new TestCoordinator(fixture.state, 1_000)
    await coordinator.open({ runId: 'run-1', threadId: 'thread-1' })

    await fixture.invokeAlarm(coordinator)

    expect(fixture.storage.alarm).toBe(startedAt + 1_000)
  })

  it('fails closed when arming cannot persist an alarm', async () => {
    const fixture = fakeCoordinatorState()
    const coordinator = new TestCoordinator(fixture.state)
    vi.spyOn(fixture.storage, 'setAlarm').mockRejectedValueOnce(
      new Error('setAlarm failed'),
    )

    await expect(
      coordinator.startRun({
        runId: 'run-1',
        threadId: 'thread-1',
        messages: [],
      }),
    ).rejects.toThrow('setAlarm failed')
    expect(await coordinator.status('run-1')).toBeNull()
  })
})
