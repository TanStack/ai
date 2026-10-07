import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { after, gate, mockAdapter, text, toolCall } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { LogStore, WorkClaimStore } from '@tanstack/ai-persistence'
import type { Reply } from './helpers'

const THREAD = 't1'
const NAME = 'test/work-claims'
const later = () => Date.now() + 60 * 60_000

/** A durable host's stores, with work claims. */
function durablePersistence() {
  const { runs, metadata, workClaims } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata, workClaims } }
}

/** A reply that waits for `until`, then calls the tool `name`. */
function toolCallAfter(
  until: Promise<void>,
  name: string,
  args: Record<string, unknown>,
): Reply {
  return () =>
    (async function* (): AsyncGenerator<StreamChunk> {
      await until
      yield* toolCall(name, args)
    })()
}

/** Can another host claim the thread now? It takes the thread when it can. */
const otherHostCanClaim = (claims: WorkClaimStore, threadId = THREAD) =>
  claims.claim({
    threadId,
    harness: NAME,
    ownerId: 'other-host',
    until: later(),
  })

describe('work claims while a session runs', () => {
  it('claims a busy thread for its host, and gives it back when the thread is idle', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    const release = gate()
    const { adapter } = mockAdapter([after(release.opened, 'Done.')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(defineHarness({ name: NAME, adapter }), {
      threadId: THREAD,
    })

    const turn = session.prompt('Go.')
    await turn.receipt
    expect(await otherHostCanClaim(claims)).toBe(false)

    release.open()
    await turn
    await vi.waitFor(async () =>
      expect(await otherHostCanClaim(claims)).toBe(true),
    )
    await host.close()
  })

  it('gives the claim back when a turn stops for an approval', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    const reply = gate()
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ env: z.string() }),
    }).server(async () => ({ ok: true }))
    const { adapter } = mockAdapter([
      toolCallAfter(reply.opened, 'deploy', { env: 'prod' }),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: NAME, adapter, tools: [deploy] }),
      { threadId: THREAD },
    )

    const turn = session.prompt('Deploy.')
    await turn.receipt
    expect(await otherHostCanClaim(claims)).toBe(false)

    reply.open()
    expect((await turn).interrupts).toHaveLength(1)
    // The thread waits for a human: it is idle, so a sweep never lists it.
    await vi.waitFor(async () =>
      expect(await claims.listExpired({ now: later() })).toEqual([]),
    )
    await host.close()
  })

  it('keeps the thread busy while a background agent runs', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    const finish = gate()
    const waiter = defineAgent({
      name: 'waiter',
      description: 'Waits until it is told to finish',
      run: async () => {
        await finish.opened
        return 'done'
      },
    })
    const { adapter } = mockAdapter([() => text('Noted.')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: NAME, adapter, agents: [waiter] }),
      { threadId: THREAD },
    )

    const run = session.agents.waiter.start(undefined)
    await vi.waitFor(async () =>
      expect(await otherHostCanClaim(claims)).toBe(false),
    )

    finish.open()
    await run
    await vi.waitFor(async () =>
      expect(await otherHostCanClaim(claims)).toBe(true),
    )
    await host.close()
  })

  it('runs and settles the input when the claim store throws, with a warning', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    vi.spyOn(claims, 'claim').mockRejectedValue(new Error('claim failed'))
    vi.spyOn(claims, 'release').mockRejectedValue(new Error('release failed'))
    const { adapter } = mockAdapter([() => text('Done.')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(defineHarness({ name: NAME, adapter }), {
      threadId: THREAD,
    })
    const warnings: Array<unknown> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: controller.signal })) {
        if (
          entry.event.type === EventType.CUSTOM &&
          entry.event.name === 'harness.plugin.warning'
        ) {
          warnings.push(entry.event.value)
        }
      }
    })()

    const turn = session.prompt('Go.')
    const { inputId } = await turn.receipt
    expect((await turn).text).toBe('Done.')
    expect(await session.settled(inputId)).toMatchObject({
      outcome: 'completed',
    })
    // The failed writes are warnings: one for the claim, one for the release.
    await vi.waitFor(() =>
      expect(warnings).toEqual(
        expect.arrayContaining([
          { plugin: 'harness:work-claims', message: 'claim failed' },
          { plugin: 'harness:work-claims', message: 'release failed' },
        ]),
      ),
    )
    controller.abort()
    await reading
    await host.close()
  })
})

/** An expired claim: the host that held the thread stopped. */
const expireClaim = (
  claims: WorkClaimStore,
  threadId = THREAD,
  harness = NAME,
) =>
  claims.claim({
    threadId,
    harness,
    ownerId: 'host-gone',
    until: Date.now() - 1_000,
  })

/** The log and run of a host that stopped during a turn, and its claim. */
async function seedStoppedTurn(
  persistence: ReturnType<typeof durablePersistence>,
) {
  await persistence.stores.log.append(THREAD, 1, [
    {
      type: 'harness.input',
      inputId: 'in-1',
      input: { op: 'prompt', message: 'go', busy: 'queue' },
      at: 1,
    },
    {
      type: 'harness.input.applied',
      inputId: 'in-1',
      operationId: 'op-stopped',
      attempt: 1,
    },
    {
      type: 'harness.transcript',
      keep: 0,
      add: [{ id: 'u1', role: 'user', content: 'go' }],
    },
  ])
  await persistence.stores.runs.createOrResume({
    runId: 'op-stopped',
    threadId: THREAD,
    startedAt: Date.now() - 60_000,
  })
  await persistence.stores.runs.update('op-stopped', {
    leaseOwner: 'host-gone',
    leaseExpiresAt: Date.now() - 1_000,
    checkpoint: { at: 1, pendingTools: [] },
  })
  await expireClaim(persistence.stores.workClaims)
}

/** The settle record of `inputId` in the log, or undefined. */
const settledRecord = async (
  persistence: ReturnType<typeof durablePersistence>,
  inputId: string,
) =>
  (await persistence.stores.log.read(THREAD))
    .map((entry) => entry.record)
    .find(
      (record) =>
        record.type === 'harness.input.settled' && record.inputId === inputId,
    )

/** A detached agent run `op-agent` whose host stopped. */
async function seedStoppedAgent(
  persistence: ReturnType<typeof durablePersistence>,
) {
  await persistence.stores.log.append(THREAD, 1, [
    {
      type: 'harness.input',
      inputId: 'in-agent',
      input: { op: 'agent', agent: 'waiter', detached: true },
      at: 1,
    },
    {
      type: 'harness.input.applied',
      inputId: 'in-agent',
      operationId: 'op-agent',
      attempt: 1,
    },
  ])
  await persistence.stores.runs.createOrResume({
    runId: 'op-agent',
    threadId: THREAD,
    startedAt: Date.now() - 60_000,
    kind: 'agent',
    agent: 'waiter',
  })
  await persistence.stores.runs.update('op-agent', {
    leaseOwner: 'host-gone',
    leaseExpiresAt: Date.now() - 1_000,
  })
}

/** A log store whose writes take about 30 ms. */
function slowLogStore(): LogStore {
  const log = memoryLogStore()
  return {
    append: async (threadId, seq, records) => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return log.append(threadId, seq, records)
    },
    read: (threadId, options) => log.read(threadId, options),
    subscribe: (threadId, listener) => log.subscribe(threadId, listener),
  }
}

describe('host.resumePending', () => {
  it('resumes a turn whose host stopped, and gives the claim back', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence)
    const { adapter, calls } = mockAdapter([() => text('Recovered.')])
    const host = createHarnessHost({ persistence })

    expect(
      await host.resumePending({
        harnesses: [defineHarness({ name: NAME, adapter })],
      }),
    ).toEqual([{ threadId: THREAD, harness: NAME }])
    await vi.waitFor(async () =>
      expect(await settledRecord(persistence, 'in-1')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(calls).toHaveLength(1)
    await vi.waitFor(async () =>
      expect(
        await persistence.stores.workClaims.listExpired({ now: later() }),
      ).toEqual([]),
    )
    await host.close()
  })

  it('runs an input that was stored just before the host stopped', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append(THREAD, 1, [
      {
        type: 'harness.input',
        inputId: 'in-early',
        input: { op: 'prompt', message: 'go', busy: 'queue' },
        at: 1,
      },
    ])
    await expireClaim(persistence.stores.workClaims)
    const { adapter, calls } = mockAdapter([() => text('Ran.')])
    const host = createHarnessHost({ persistence })

    await host.resumePending({
      harnesses: [defineHarness({ name: NAME, adapter })],
    })
    await vi.waitFor(async () =>
      expect(await settledRecord(persistence, 'in-early')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('runs a pending inbox input on a host without a log', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.inbox.append({
      inputId: 'in-1',
      threadId: THREAD,
      input: { op: 'prompt', message: 'go', busy: 'queue' },
      createdAt: Date.now() - 1_000,
    })
    await expireClaim(persistence.stores.workClaims)
    const { adapter, calls } = mockAdapter([() => text('Ran.')])
    const host = createHarnessHost({ persistence })

    await host.resumePending({
      harnesses: [defineHarness({ name: NAME, adapter })],
    })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await vi.waitFor(async () =>
      expect((await persistence.stores.inbox.get('in-1'))?.status).toBe(
        'applied',
      ),
    )
    await host.close()
  })

  it('fails a stopped background agent and wakes the thread, as an open does', async () => {
    const persistence = durablePersistence()
    await seedStoppedAgent(persistence)
    await expireClaim(persistence.stores.workClaims)
    const { adapter, calls } = mockAdapter([() => text('Noted.')])
    const host = createHarnessHost({ persistence })

    await host.resumePending({
      harnesses: [defineHarness({ name: NAME, adapter })],
    })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(await settledRecord(persistence, 'in-agent')).toMatchObject({
      outcome: 'failed',
    })
    await host.close()
  })

  it('with close: whenIdle, runs the wake turn of a stopped agent when the log store is slow', async () => {
    const { runs, metadata, workClaims } = memoryPersistence().stores
    const persistence = {
      stores: { log: slowLogStore(), runs, metadata, workClaims },
    }
    await seedStoppedAgent(persistence)
    await expireClaim(workClaims)
    const { adapter, calls } = mockAdapter([() => text('Noted.')])
    const host = createHarnessHost({ persistence })

    await host.resumePending({
      harnesses: [defineHarness({ name: NAME, adapter })],
      close: 'whenIdle',
    })
    await vi.waitFor(() => expect(calls).toHaveLength(1), { timeout: 2_000 })
    expect(await settledRecord(persistence, 'in-agent')).toMatchObject({
      outcome: 'failed',
    })
    await host.close()
  })

  it('continues a resumable background agent whose host stopped', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append(THREAD, 1, [
      {
        type: 'harness.input',
        inputId: 'in-agent',
        input: { op: 'agent', agent: 'worker', detached: true, resume: true },
        at: 1,
      },
      {
        type: 'harness.input.applied',
        inputId: 'in-agent',
        operationId: 'op-agent',
        attempt: 1,
      },
    ])
    await persistence.stores.runs.createOrResume({
      runId: 'op-agent',
      threadId: THREAD,
      startedAt: Date.now() - 60_000,
      kind: 'agent',
      agent: 'worker',
    })
    await persistence.stores.runs.update('op-agent', {
      leaseOwner: 'host-gone',
      leaseExpiresAt: Date.now() - 1_000,
    })
    await expireClaim(persistence.stores.workClaims)
    const agentModel = mockAdapter([() => text('Worked.')])
    const worker = defineAgent({
      name: 'worker',
      description: 'Works',
      run: (ctx) => ctx.chat({ adapter: agentModel.adapter }),
    })
    const main = mockAdapter([() => text('Noted.')])
    const host = createHarnessHost({ persistence })

    await host.resumePending({
      harnesses: [
        defineHarness({ name: NAME, adapter: main.adapter, agents: [worker] }),
      ],
    })
    await vi.waitFor(async () =>
      expect(await settledRecord(persistence, 'in-agent')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(agentModel.calls).toHaveLength(1)
    await host.close()
  })

  it('gives each thread to one of two hosts that sweep at once', async () => {
    const persistence = durablePersistence()
    await seedStoppedTurn(persistence)
    const { adapter, calls } = mockAdapter([
      () => text('Recovered.'),
      () => text('Twice.'),
    ])
    const harness = defineHarness({ name: NAME, adapter })
    const a = createHarnessHost({ persistence })
    const b = createHarnessHost({ persistence })

    const [fromA, fromB] = await Promise.all([
      a.resumePending({ harnesses: [harness] }),
      b.resumePending({ harnesses: [harness] }),
    ])
    expect([...fromA, ...fromB]).toEqual([{ threadId: THREAD, harness: NAME }])
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toHaveLength(1)
    await a.close()
    await b.close()
  })

  it('leaves a thread alone while its host still works on it', async () => {
    const persistence = durablePersistence()
    const release = gate()
    const { adapter } = mockAdapter([after(release.opened, 'Done.')])
    const harness = defineHarness({ name: NAME, adapter })
    const live = createHarnessHost({ persistence })
    const session = await live.open(harness, { threadId: THREAD })
    const turn = session.prompt('Go.')
    await turn.receipt

    const sweeper = createHarnessHost({ persistence })
    expect(await sweeper.resumePending({ harnesses: [harness] })).toEqual([])

    release.open()
    await turn
    await live.close()
    await sweeper.close()
  })

  it.each([
    { close: 'whenIdle' as const, setups: 2 },
    { close: 'never' as const, setups: 1 },
  ])(
    'with close: $close, a swept session ends as asked',
    async ({ close, setups }) => {
      const persistence = durablePersistence()
      await seedStoppedTurn(persistence)
      const setup = vi.fn(() => ({}))
      const counter = definePlugin({ name: 'test/count', setup })
      const { adapter, calls } = mockAdapter([() => text('Recovered.')])
      const harness = defineHarness({
        name: NAME,
        adapter,
        plugins: () => [counter],
      })
      const host = createHarnessHost({ persistence })

      await host.resumePending({ harnesses: [harness], close })
      await vi.waitFor(() => expect(calls).toHaveLength(1))
      // Give a 'whenIdle' close time to happen, so 'never' is a real check.
      await new Promise((resolve) => setTimeout(resolve, 50))
      // A session that closed sets its plugins up again on the next open.
      await vi.waitFor(async () => {
        await host.open(harness, { threadId: THREAD })
        expect(setup).toHaveBeenCalledTimes(setups)
      })
      await host.close()
    },
  )

  it('skips a thread of a harness it was not given, and leaves it listed', async () => {
    const persistence = durablePersistence()
    await expireClaim(
      persistence.stores.workClaims,
      'other-thread',
      'test/other',
    )
    const { adapter } = mockAdapter([])
    const host = createHarnessHost({ persistence })

    expect(
      await host.resumePending({
        harnesses: [defineHarness({ name: NAME, adapter })],
      }),
    ).toEqual([])
    expect(
      await persistence.stores.workClaims.listExpired({ now: Date.now() }),
    ).toEqual([{ threadId: 'other-thread', harness: 'test/other' }])
    await host.close()
  })

  it('throws a clear error without stores.workClaims', async () => {
    const { runs, metadata } = memoryPersistence().stores
    const host = createHarnessHost({
      persistence: { stores: { log: memoryLogStore(), runs, metadata } },
    })
    await expect(host.resumePending({ harnesses: [] })).rejects.toThrow(
      'resumePending needs stores.workClaims.',
    )
    await host.close()
  })

  it('with close: whenIdle, runs a prompt that arrives as the swept session closes', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    await seedStoppedTurn(persistence)
    const recovered = gate()
    const { adapter, calls } = mockAdapter([
      after(recovered.opened, 'Recovered.'),
      () => text('Answered.'),
    ])
    const harness = defineHarness({ name: NAME, adapter })
    const host = createHarnessHost({ persistence })
    await host.resumePending({ harnesses: [harness] })

    // The thread goes idle: the session gives its claim back, and the sweep
    // closes it. A new prompt arrives right then, the way a request does.
    const release = claims.release.bind(claims)
    let arriving: Promise<string> | undefined
    vi.spyOn(claims, 'release').mockImplementationOnce((threadId, ownerId) => {
      queueMicrotask(() => {
        arriving = host
          .open(harness, { threadId: THREAD })
          .then(async (session) => (await session.prompt('Again.')).text)
      })
      return release(threadId, ownerId)
    })
    recovered.open()
    await vi.waitFor(() => expect(arriving).toBeDefined())

    await expect(arriving).resolves.toBe('Answered.')
    expect(calls).toHaveLength(2)
    await host.close()
  })

  it('opens at most limit threads per call, and the next call opens the rest', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    const now = Date.now()
    // Three threads whose host stopped, the oldest claim first.
    for (const [index, threadId] of ['t-a', 't-b', 't-c'].entries()) {
      await claims.claim({
        threadId,
        harness: NAME,
        ownerId: 'host-gone',
        until: now - 3_000 + index,
      })
    }
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter([]).adapter,
    })
    const host = createHarnessHost({ persistence })

    expect(
      await host.resumePending({ harnesses: [harness], limit: 2 }),
    ).toEqual([
      { threadId: 't-a', harness: NAME },
      { threadId: 't-b', harness: NAME },
    ])
    expect(
      await host.resumePending({ harnesses: [harness], limit: 2 }),
    ).toEqual([{ threadId: 't-c', harness: NAME }])
    await host.close()
  })
})
