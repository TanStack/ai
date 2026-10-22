import { describe, expect, it } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text } from './helpers'
import type { HarnessPersistence, RetentionLimits } from '../src'
import type { SessionImpl } from '../src/session/harness-session'

/**
 * A session with `retention`. The model answers `done` to every call, and
 * the agent `writer` runs one model call.
 */
async function openWith(
  retention: RetentionLimits,
  persistence: HarnessPersistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence, lifecycle: { retention } })
  const { adapter } = mockAdapter(() => text('done'))
  const writer = defineAgent({
    name: 'writer',
    description: 'Writes',
    run: (ctx) => ctx.chat({ adapter }),
  })
  const harness = defineHarness({
    name: 'test/retention',
    adapter,
    agents: [writer],
  })
  const session = await host.open(harness, { threadId: 't1' })
  return { host, session }
}

/**
 * The size of the private set `name` of `owner`. A leak in these sets has no
 * public signal, so the test reads the set by name.
 */
function privateSetSize(owner: object, name: string) {
  const value: unknown = Reflect.get(owner, name)
  return value instanceof Set ? value.size : undefined
}

describe('retention', () => {
  it('keeps a turn in the window while many agent runs settle', async () => {
    const { host, session } = await openWith({
      keepSettledOperations: 5,
      keepSettledAgentRuns: 2,
    })
    const first = session.send('Hi', { inputId: 't-0' })
    await first
    for (const inputId of ['t-1', 't-2']) {
      await session.send('Hi', { inputId })
    }
    for (let index = 0; index < 12; index += 1) {
      await session.agents.writer.run()
    }
    for (const inputId of ['t-3', 't-4']) {
      await session.send('Hi', { inputId })
    }

    expect(session.operation(first.id)).toBe(first)
    // A sixth turn pushes the oldest turn out of the window. The log still
    // has how it ended.
    await session.send('Hi', { inputId: 't-5' })
    expect(session.operation(first.id)).toBe(undefined)
    await expect(session.settled({ inputId: 't-0' })).resolves.toMatchObject({
      inputId: 't-0',
      outcome: 'completed',
    })
    await host.close()
  })

  it('keeps the receipt of a turn while many inputs with no turn end', async () => {
    const { host, session } = await openWith({ keepSettledOperations: 3 })
    const first = session.send('Hi', { inputId: 't-0' })
    await first
    for (let index = 0; index < 10; index += 1) {
      // Nothing runs, so each cancel is refused.
      await session.cancel()
      await session.updateThreadSettings({
        settings: { instructions: `Rule ${index}.` },
      })
    }

    const again = session.send('Hi', { inputId: 't-0' })

    expect(again.id).toBe(first.id)
    expect(await again.receipt).toEqual(await first.receipt)
    await host.close()
  })

  it('forgets agent runs past keepSettledAgentRuns, and still lists them from the log', async () => {
    const { host, session } = await openWith({ keepSettledAgentRuns: 3 })
    const ids: Array<string> = []
    for (let index = 0; index < 10; index += 1) {
      const run = session.agents.writer.run()
      ids.push(run.id)
      await run
    }

    const kept = ids.slice(7)
    expect(ids.filter((id) => session.operation(id) !== undefined)).toEqual(
      kept,
    )
    // The log has every run, also the ones the window forgot.
    expect(session.agentRuns().map((run) => run.operationId)).toEqual(ids)
    expect(session.agentRun(ids[0] ?? '')?.id).toBe(ids[0])
    await host.close()
  })

  it('keeps the ids of forgotten operations only as long as both windows, and the log refuses the id after', async () => {
    const { host, session } = await openWith({
      keepSettledOperations: 2,
      keepSettledAgentRuns: 1,
    })
    await (session as unknown as SessionImpl).sendForRun('Hi', {
      runId: 'run-0',
    })
    for (let index = 0; index < 2; index += 1) await session.send('Hi')
    expect(session.operation('run-0')).toBe(undefined)
    // Both windows keep 3 operations.
    for (let index = 0; index < 4; index += 1) await session.send('Hi')
    expect(privateSetSize(session, 'retiredIds')).toBe(3)

    // The log keeps every run, so the id stays taken.
    const reused = (session as unknown as SessionImpl).sendForRun('Hi', {
      runId: 'run-0',
    })
    expect(await reused.receipt).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    await reused.then(
      () => undefined,
      () => undefined,
    )
    await host.close()
  })

  it('settles a duplicate of an input past the window from the log, and keeps no follower', async () => {
    const { host, session } = await openWith({ keepSettledOperations: 1 })
    await session.send('Hi', { inputId: 't-0' })
    // The next turn pushes the first one out of the window.
    await session.send('Hi', { inputId: 't-1' })

    await expect(session.send('Hi', { inputId: 't-0' })).resolves.toEqual({
      text: 'done',
      media: [],
    })
    expect(privateSetSize(session, 'followers')).toBe(0)
    await host.close()
  })
})
