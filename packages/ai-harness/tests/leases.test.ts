import { describe, expect, it, vi } from 'vitest'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { INTERRUPTED_TOOL_RESULT } from '../src/resume'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
} from './helpers'
import type { AnyTool, StreamChunk } from '@tanstack/ai'
import { EventType } from '@tanstack/ai'
import type {
  LeaseStore,
  TurnLease,
  TurnLeaseKey,
} from '@tanstack/ai-persistence'
import type { Reply } from './helpers'

const THREAD = 't1'

/** A background agent that runs until it is cancelled. */
const waiter = defineAgent({
  name: 'waiter',
  description: 'Waits until it is cancelled',
  run: (ctx) =>
    new Promise<string>((resolve) =>
      ctx.abortSignal?.addEventListener('abort', () => resolve('stopped')),
    ),
})

/** A lease store in memory, like a job queue's leases. */
function memoryLeases() {
  const leases = new Map<string, TurnLease>()
  const calls: Array<string> = []
  const keyOf = (key: TurnLeaseKey) => `${key.inputId}:${key.attempt}`
  const store: LeaseStore = {
    acquire: async (lease) => {
      calls.push(`acquire ${keyOf(lease)}`)
      leases.set(keyOf(lease), lease)
    },
    renew: async (lease) => {
      calls.push(`renew ${keyOf(lease)}`)
      leases.set(keyOf(lease), lease)
    },
    release: async (lease) => {
      calls.push(`release ${keyOf(lease)}`)
      leases.delete(keyOf(lease))
    },
    isAlive: async (key) => {
      const lease = leases.get(keyOf(key))
      return lease !== undefined && lease.expiresAt >= Date.now()
    },
  }
  const expire = () => {
    for (const lease of leases.values()) lease.expiresAt = Date.now() - 1
  }
  return { store, calls, leases, expire }
}

function leasedPersistence(leases: LeaseStore) {
  return { stores: { log: memoryLogStore(), leases } }
}

async function openLeased(
  persistence: ReturnType<typeof leasedPersistence>,
  replies: Array<Reply>,
  tools: Array<AnyTool> = [],
  lease?: { renewMs?: number; ttlMs?: number },
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({ persistence, lease })
  const session = await host.open(
    defineHarness({ name: 'test/leases', adapter, tools }),
    { threadId: THREAD },
  )
  return { host, session, calls }
}

/** A model call that waits until the call is aborted, like a host that stopped. */
const hangs: Reply = (options: any) =>
  (async function* (): AsyncGenerator<StreamChunk> {
    yield {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: 1,
    }
    await new Promise<void>((resolve) =>
      options.request?.signal?.addEventListener('abort', () => resolve(), {
        once: true,
      }),
    )
  })()

describe('a durable host with a lease store and no run store', () => {
  it('takes, renews, and releases the lease of a turn', async () => {
    const leases = memoryLeases()
    const { host, session } = await openLeased(
      leasedPersistence(leases.store),
      [() => text('done')],
    )

    await session.prompt('go', { inputId: 'in-1' })

    expect(leases.calls).toEqual(['acquire in-1:1', 'release in-1:1'])
    await host.close()
  })

  it('renews the lease while a turn runs, and stops at the release', async () => {
    const leases = memoryLeases()
    const hold = gate()
    const { host, session } = await openLeased(
      leasedPersistence(leases.store),
      [after(hold.opened, 'done')],
      [],
      { renewMs: 5, ttlMs: 50 },
    )

    const turn = session.prompt('go', { inputId: 'in-1' })
    await vi.waitFor(() => expect(leases.calls).toContain('renew in-1:1'))
    hold.open()
    await turn
    // A timer that the release did not stop would renew again in this time.
    await new Promise((resolve) => setTimeout(resolve, 30))

    const release = leases.calls.indexOf('release in-1:1')
    expect(release).toBeGreaterThan(-1)
    expect(leases.calls.slice(release)).not.toContain('renew in-1:1')
    await host.close()
  })

  it('lets the caller answer an interrupted turn as soon as it ends', async () => {
    const leases = memoryLeases()
    // A store that releases after a timer, like one over the network.
    const slow: LeaseStore = {
      ...leases.store,
      release: async (lease) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        await leases.store.release(lease)
      },
    }
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(async () => ({ ok: true }))
    const { host, session } = await openLeased(
      leasedPersistence(slow),
      [
        () => toolCall('remove', { path: 'a.txt' }, 'call_1'),
        () => text('removed'),
      ],
      [remove],
    )

    const turn = await session.prompt('remove a.txt')
    const interrupt = turn.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    expect(session.snapshot().status).toBe('requires_action')
    const receipt = await session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    expect(receipt.status).toBe('accepted')
    await host.close()
  })

  it('keeps a turn with a live lease, and runs one with an expired lease again', async () => {
    const leases = memoryLeases()
    const persistence = leasedPersistence(leases.store)
    const first = await openLeased(persistence, [hangs])
    first.session.prompt('go', { inputId: 'in-1' })
    await vi.waitFor(() => expect(leases.leases.size).toBe(1))

    // A second host while the lease is alive: it leaves the turn alone.
    const watcher = await openLeased(persistence, [() => text('never')])
    expect(watcher.calls).toHaveLength(0)
    expect(watcher.session.snapshot().status).toBe('idle')
    await watcher.host.close()

    leases.expire()
    const next = await openLeased(persistence, [() => text('recovered')])
    expect(await next.session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(next.calls).toHaveLength(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('fails a background agent with an expired lease, and keeps a finished one', async () => {
    const leases = memoryLeases()
    const persistence = leasedPersistence(leases.store)
    const pricer = defineAgent({
      name: 'pricer',
      description: 'Prices',
      run: async () => 'priced',
    })
    const first = createHarnessHost({ persistence })
    const session = await first.open(
      defineHarness({
        name: 'test/leases',
        adapter: mockAdapter([]).adapter,
        agents: [pricer, waiter],
      }),
      { threadId: THREAD },
    )
    await session.agents.pricer.run()
    session.agents.waiter.start(undefined, { wake: true })
    await vi.waitFor(() => expect(leases.leases.size).toBe(1))

    leases.expire()
    const next = await openLeased(persistence, [() => text('noted')])
    await vi.waitFor(() => expect(next.calls).toHaveLength(1))
    await vi.waitFor(() => expect(next.session.snapshot().status).toBe('idle'))

    // One wake, for the agent that stopped. The finished agent stays settled.
    expect(next.calls).toHaveLength(1)
    expect(messageTexts(next.calls[0]).at(-1)).toBe(
      'Background agent waiter failed: [waiter failed] The host stopped during this agent run.',
    )
    await first.close().catch(() => {})
    await next.host.close()
  })

  it('repairs a cut batch from the log', async () => {
    const leases = memoryLeases()
    const persistence = leasedPersistence(leases.store)
    const mailStarted = gate()
    const charge = vi.fn(async () => 'charged')
    const tools = [
      toolDefinition({ name: 'charge', description: 'Charge' }).server(charge),
      toolDefinition({ name: 'mail', description: 'Mail' }).server(
        async (_args, context) => {
          mailStarted.open()
          // Wait like a host that stopped, until the call is aborted at close.
          return new Promise<never>((_resolve, reject) => {
            context?.abortSignal?.addEventListener(
              'abort',
              () => reject(new Error('stopped')),
              { once: true },
            )
          })
        },
      ),
    ]
    const twoCalls: Reply = () => {
      const now = Date.now()
      return [
        {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
        },
        ...['charge', 'mail'].flatMap(
          (name): Array<StreamChunk> => [
            {
              type: EventType.TOOL_CALL_START,
              toolCallId: `call-${name}`,
              toolCallName: name,
              timestamp: now,
            },
            {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: `call-${name}`,
              delta: '{}',
              timestamp: now,
            },
            {
              type: EventType.TOOL_CALL_END,
              toolCallId: `call-${name}`,
              timestamp: now,
            },
          ],
        ),
        {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
          metadata: { tanstack: { finishReason: 'tool_calls' } },
        },
      ]
    }
    const first = await openLeased(persistence, [twoCalls], tools)
    first.session.prompt('charge and mail', { inputId: 'batch-1' })
    await mailStarted.opened
    await vi.waitFor(async () =>
      expect(
        (await persistence.stores.log.read(THREAD)).filter(
          (entry) => entry.record.type === 'harness.tool.result',
        ),
      ).toHaveLength(1),
    )
    leases.expire()

    const next = await openLeased(persistence, [() => text('done')], tools)
    await next.session.settled('batch-1')

    const results = (await next.session.transcript()).filter(
      (message) => message.role === 'tool',
    )
    expect(results).toEqual([
      { role: 'tool', toolCallId: 'call-charge', content: 'charged' },
      {
        role: 'tool',
        toolCallId: 'call-mail',
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: INTERRUPTED_TOOL_RESULT.note,
      },
    ])
    expect(charge).toHaveBeenCalledTimes(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('throws a clear error for a durable host with neither runs nor leases', () => {
    expect(() =>
      createHarnessHost({
        persistence: { stores: { log: memoryLogStore() } } as never,
      }),
    ).toThrow('stores.runs or stores.leases')
  })
})

describe('a durable host with runs and leases', () => {
  it('asks the lease store, and still writes run records', async () => {
    const leases = memoryLeases()
    const { runs } = memoryPersistence().stores
    const persistence = {
      stores: { log: memoryLogStore(), runs, leases: leases.store },
    }
    const { adapter } = mockAdapter([() => text('done')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/leases', adapter }),
      {
        threadId: THREAD,
      },
    )

    const turn = session.prompt('go', { inputId: 'in-1' })
    await turn

    expect(leases.calls).toEqual(['acquire in-1:1', 'release in-1:1'])
    expect((await runs.get(turn.id))?.status).toBe('completed')
    await host.close()
  })

  it('keeps the failed run when the stopped host ends its agent later', async () => {
    const leases = memoryLeases()
    const { runs } = memoryPersistence().stores
    const persistence = {
      stores: { log: memoryLogStore(), runs, leases: leases.store },
    }
    const harness = defineHarness({
      name: 'test/leases',
      adapter: mockAdapter([]).adapter,
      agents: [waiter],
    })
    const first = createHarnessHost({ persistence })
    const run = (
      await first.open(harness, { threadId: THREAD })
    ).agents.waiter.start()
    await vi.waitFor(() => expect(leases.leases.size).toBe(1))

    leases.expire()
    const next = createHarnessHost({ persistence })
    await next.open(harness, { threadId: THREAD })
    // The first host sees the writes of the second host, so it stops and
    // cancels its agent.
    await expect(Promise.resolve(run)).rejects.toThrow('Cancelled.')

    expect((await runs.get(run.id))?.status).toBe('failed')
    await first.close().catch(() => {})
    await next.close()
  })
})
