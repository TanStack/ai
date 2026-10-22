import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import { gate, mockAdapter } from './helpers'
import type { AnyAgent, HarnessPersistence, HarnessSession } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
const LOG = logIdOf({ logId: THREAD })
const alice = { id: 'alice' }

/**
 * The agent `child`. Each run records its `n` in `started`, waits for
 * `gates[n]` when there is one, and returns `done ${n}`. A run with `fail`
 * set to its `n` throws. `active` and `max` count the runs at the same time.
 */
function children(options: { count: number; fail?: number }) {
  const gates = Array.from({ length: options.count }, () => gate())
  const state = { started: [] as Array<number>, active: 0, max: 0 }
  const child = defineAgent({
    name: 'child',
    description: 'Works',
    inputSchema: z.object({ n: z.number() }),
    run: async (ctx) => {
      const { n } = ctx.input
      state.started.push(n)
      state.active += 1
      state.max = Math.max(state.max, state.active)
      try {
        await gates[n]?.opened
        if (n === options.fail) throw new Error(`child ${n} failed`)
        return `done ${n}`
      } finally {
        state.active -= 1
      }
    },
  })
  return { child, gates, state }
}

/** Open a harness with `agents` for alice. */
async function open(
  agents: Array<AnyAgent>,
  persistence: HarnessPersistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/agent-group',
      adapter: mockAdapter([]).adapter,
      agents,
    }),
    { threadId: THREAD, user: alice },
  )
  return { host, session }
}

/** Start the agent `lead` of `session`. */
function startLead(
  session: Pick<HarnessSession, 'agent'>,
  options?: { runAgainAfterCrash?: boolean },
) {
  const run = session.agent('lead')?.start(undefined, options)
  if (!run) throw new Error('No lead agent.')
  return run
}

describe('group', () => {
  it('runs at most `concurrency` children at a time, with the results in order', async () => {
    const { child, gates, state } = children({ count: 5 })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs children',
      run: (ctx) =>
        ctx.harness!.agents.group({ concurrency: 2 }, (g) =>
          [0, 1, 2, 3, 4].map((n) => g.start(child, { n })),
        ),
    })
    const { host, session } = await open([lead, child])

    const run = startLead(session)
    await waitFor(() => expect(state.started).toEqual([0, 1]))
    // The children that wait for a slot are queued.
    expect(
      session
        .agentRuns()
        .filter((item) => item.agent === 'child')
        .map((item) => item.status),
    ).toEqual(['running', 'running', 'queued', 'queued', 'queued'])
    gates[1]?.open()
    await waitFor(() => expect(state.started).toEqual([0, 1, 2]))
    gates[0]?.open()
    await waitFor(() => expect(state.started).toEqual([0, 1, 2, 3]))
    for (const item of gates) item.open()

    await expect(run).resolves.toEqual([
      'done 0',
      'done 1',
      'done 2',
      'done 3',
      'done 4',
    ])
    expect(state.max).toBe(2)
    await host.close()
  })

  it('cancels the other children, also the ones that wait, on the first failure', async () => {
    const { child, gates, state } = children({ count: 5, fail: 1 })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs children',
      run: (ctx) =>
        ctx.harness!.agents.group({ concurrency: 3 }, (g) =>
          [0, 1, 2, 3, 4].map((n) => g.start(child, { n })),
        ),
    })
    const { host, session } = await open([lead, child])

    const run = startLead(session)
    await waitFor(() => expect(state.started).toEqual([0, 1, 2]))
    gates[1]?.open()

    await expect(run).rejects.toThrow('child 1 failed')
    // The children that waited for a slot never started.
    expect(state.started).toEqual([0, 1, 2])
    const statuses = session
      .agentRuns()
      .filter((item) => item.agent === 'child')
      .map((item) => item.status)
    expect(statuses).toEqual([
      'cancelled',
      'failed',
      'cancelled',
      'cancelled',
      'cancelled',
    ])
    await host.close()
  })

  it('with collect, runs every child and returns one entry per child', async () => {
    const { child, gates, state } = children({ count: 5, fail: 1 })
    for (const item of gates) item.open()
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs children',
      run: (ctx) =>
        ctx.harness!.agents.group(
          { concurrency: 3, onFailure: 'collect' },
          (g) => [0, 1, 2, 3, 4].map((n) => g.start(child, { n })),
        ),
    })
    const { host, session } = await open([lead, child])

    const entries = (await startLead(session)) as Array<{
      ok: boolean
      value?: unknown
      error?: unknown
    }>

    expect(entries.map((entry) => entry.ok)).toEqual([
      true,
      false,
      true,
      true,
      true,
    ])
    expect(entries[0]?.value).toBe('done 0')
    expect(String(entries[1]?.error)).toContain('child 1 failed')
    expect(state.max).toBeLessThanOrEqual(3)
    await host.close()
  })

  it('refuses a concurrency under 1', async () => {
    const { child } = children({ count: 1 })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs children',
      run: (ctx) =>
        ctx.harness!.agents.group({ concurrency: 0 }, (g) => [
          g.start(child, { n: 0 }),
        ]),
    })
    const { host, session } = await open([lead, child])

    await expect(startLead(session)).rejects.toThrow(
      'The concurrency of a group must be 1 or more.',
    )
    await host.close()
  })
})

describe('run', () => {
  it('runs children in series when each one is awaited', async () => {
    const { child, gates, state } = children({ count: 2 })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs children in series',
      run: async (ctx) => {
        const first = await ctx.harness!.agents.run(child, { n: 0 })
        const second = await ctx.harness!.agents.run(child, { n: 1 })
        return [first, second]
      },
    })
    const { host, session } = await open([lead, child])

    const run = startLead(session)
    await waitFor(() => expect(state.started).toEqual([0]))
    // The second starts only after the first resolved.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.started).toEqual([0])
    gates[0]?.open()
    await waitFor(() => expect(state.started).toEqual([0, 1]))
    gates[1]?.open()

    await expect(run).resolves.toEqual(['done 0', 'done 1'])
    await host.close()
  })
})

/**
 * Host A runs the agent `lead` with `runAgainAfterCrash: true`, until `stopWhen` is
 * true. Then host A stops: its log refuses writes. `hold` waits on host A,
 * and goes on at once on host B, which opens the thread on the same
 * stores. Returns how the run of `lead` ended on host B.
 */
async function stopAndRunAgain(
  makeLead: (hold: () => Promise<void>) => AnyAgent,
  child: AnyAgent,
  stopWhen: (session: Awaited<ReturnType<typeof open>>['session']) => void,
) {
  const stores = memoryPersistence().stores
  const log = memoryLogStore()
  const persistence = { stores: { log, metadata: stores.metadata } }
  let isHeld = true
  const lead = makeLead(() =>
    isHeld ? new Promise<void>(() => undefined) : Promise.resolve(),
  )

  const a = await open([lead, child], persistence)
  const operation = startLead(a.session, { runAgainAfterCrash: true })
  await waitFor(() => stopWhen(a.session))
  const refuse = vi
    .spyOn(log, 'append')
    .mockRejectedValue(new Error('the host is gone'))
  await expect(
    a.session.appendRecords({ records: [{ type: 'app.ping' }] }),
  ).rejects.toThrow()
  await expect(operation).rejects.toThrow()
  refuse.mockRestore()

  const record = (await log.read({ logId: LOG }))
    .map((entry) => entry.record)
    .find(
      (entry) =>
        entry.type === 'harness.input' &&
        (entry.input as { agent?: string }).agent === 'lead',
    )
  isHeld = false
  const b = await open([lead, child], persistence)
  const settlement = await b.session.settled({
    inputId: String(record?.inputId),
  })
  const result = b.session.agentResult({
    runId: String(settlement.operationId),
  })
  await b.host.close()
  return { settlement, result }
}

/** The children of `session` that completed. */
const completedChildren = (session: {
  agentRuns: () => Array<{ agent: string; status: string }>
}) =>
  session
    .agentRuns()
    .filter((item) => item.agent === 'child' && item.status === 'completed')

describe('a resumable run that runs again', () => {
  it('binds the group children it started before a host stop, and starts only the rest', async () => {
    const { child, gates, state } = children({ count: 5 })
    for (const item of gates) item.open()

    const { settlement, result } = await stopAndRunAgain(
      (hold) =>
        defineAgent({
          name: 'lead',
          description: 'Runs children',
          run: (ctx) =>
            ctx.harness!.agents.group({ concurrency: 3 }, async (g) => {
              const first = [0, 1, 2].map((n) => g.start(child, { n }))
              await Promise.all(first)
              await hold()
              return [
                ...first,
                g.start(child, { n: 3 }),
                g.start(child, { n: 4 }),
              ]
            }),
        }),
      child,
      (session) => expect(completedChildren(session)).toHaveLength(3),
    )

    expect(settlement).toMatchObject({ outcome: 'completed' })
    // The first three children did not run again, and resolve to their
    // stored results.
    expect(state.started).toEqual([0, 1, 2, 3, 4])
    expect(result).toEqual(['done 0', 'done 1', 'done 2', 'done 3', 'done 4'])
  })

  it('binds a child that `run` started before a host stop', async () => {
    const { child, gates, state } = children({ count: 2 })
    for (const item of gates) item.open()

    const { settlement, result } = await stopAndRunAgain(
      (hold) =>
        defineAgent({
          name: 'lead',
          description: 'Runs children in series',
          run: async (ctx) => {
            const first = await ctx.harness!.agents.run(child, { n: 0 })
            await hold()
            const second = await ctx.harness!.agents.run(child, { n: 1 })
            return [first, second]
          },
        }),
      child,
      (session) => expect(completedChildren(session)).toHaveLength(1),
    )

    expect(settlement).toMatchObject({ outcome: 'completed' })
    expect(state.started).toEqual([0, 1])
    expect(result).toEqual(['done 0', 'done 1'])
  })
})
