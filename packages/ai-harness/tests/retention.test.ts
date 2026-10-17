import { describe, expect, it } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text } from './helpers'
import type { HarnessPersistence, RetentionLimits, SessionEvent } from '../src'

/**
 * A session on a host without a log, with `retention`. The model answers
 * `done` to every call, and the agent `writer` runs one model call.
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

async function collect(events: AsyncIterable<SessionEvent>) {
  const kept: Array<SessionEvent> = []
  for await (const entry of events) kept.push(entry)
  return kept
}

describe('retention', () => {
  it('keeps the settlement of a turn in the window while many agent runs settle', async () => {
    const { host, session } = await openWith({
      settledOperations: 5,
      settledAgentRuns: 2,
    })
    for (const inputId of ['t-0', 't-1', 't-2']) {
      await session.send('Hi', { inputId })
    }
    for (let index = 0; index < 12; index += 1) {
      await session.agents.writer.run()
    }
    for (const inputId of ['t-3', 't-4']) {
      await session.send('Hi', { inputId })
    }

    await expect(session.settled('t-0')).resolves.toMatchObject({
      inputId: 't-0',
      outcome: 'completed',
    })
    // A sixth turn pushes the oldest turn out of the window.
    await session.send('Hi', { inputId: 't-5' })
    await expect(session.settled('t-0')).rejects.toThrow('knows no chat input')
    await host.close()
  })

  it('keeps the receipt of a turn while many inputs with no turn end', async () => {
    const { host, session } = await openWith({ settledOperations: 3 })
    const first = session.send('Hi', { inputId: 't-0' })
    await first
    for (let index = 0; index < 10; index += 1) {
      // Nothing runs, so each cancel is refused.
      await session.cancel()
      await session.configure({ settings: { instructions: `Rule ${index}.` } })
    }

    const again = session.send('Hi', { inputId: 't-0' })

    expect(again.id).toBe(first.id)
    expect(await again.receipt).toEqual(await first.receipt)
    await host.close()
  })

  it('forgets agent runs past settledAgentRuns', async () => {
    const { host, session } = await openWith({ settledAgentRuns: 3 })
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
    expect(session.agentRuns().map((run) => run.operationId)).toEqual(kept)
    expect(session.agentRun(ids[0] ?? '')).toBe(undefined)
    await host.close()
  })

  it('keeps at most eventBytes of events for events()', async () => {
    // Every event is longer than 1 byte, so only the newest one stays.
    const { host, session } = await openWith({ eventBytes: 1 })
    await session.send('Hi')
    // The read gets the kept events at once, then ends at the abort.
    const reading = new AbortController()
    setTimeout(() => reading.abort(), 0)

    const events = session.events({ from: '0', signal: reading.signal })
    expect(await collect(events)).toHaveLength(1)
    await host.close()
  })

  it('keeps the ids of forgotten operations only as long as both windows', async () => {
    // Without `stores.runs`, only the session refuses a reused run id. The
    // interrupts store needs the runs store, so it goes too.
    const persistence = {
      stores: {
        ...memoryPersistence().stores,
        runs: undefined,
        interrupts: undefined,
      },
    }
    const { host, session } = await openWith(
      { settledOperations: 2, settledAgentRuns: 1 },
      persistence,
    )
    await session.send('Hi', { runId: 'run-0' })
    for (let index = 0; index < 2; index += 1) await session.send('Hi')
    expect(session.operation('run-0')).toBe(undefined)

    const reused = session.send('Hi', { runId: 'run-0' })
    expect(await reused.receipt).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    await reused.then(
      () => undefined,
      () => undefined,
    )
    // Both windows keep 3 operations. Then the id is free again.
    for (let index = 0; index < 4; index += 1) await session.send('Hi')

    expect(privateSetSize(session, 'retiredIds')).toBe(3)
    await expect(session.send('Hi', { runId: 'run-0' })).resolves.toEqual({
      text: 'done',
      media: [],
    })
    await host.close()
  })

  it('keeps no follower of a duplicate input on a host without a log', async () => {
    const { host, session } = await openWith({ settledOperations: 1 })
    await session.send('Hi', { inputId: 't-0' })
    // The next turn pushes the first one out of the window.
    await session.send('Hi', { inputId: 't-1' })

    await expect(session.send('Hi', { inputId: 't-0' })).rejects.toThrow(
      'its result is gone',
    )
    expect(privateSetSize(session, 'followers')).toBe(0)
    await host.close()
  })
})
