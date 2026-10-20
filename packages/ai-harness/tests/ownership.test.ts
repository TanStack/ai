import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  LogOwnedElsewhereError,
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
  logIdOf,
} from '../src'
import { HostOwnership } from '../src/ownership'
import {
  CRASHING_OWNERSHIP,
  after,
  canOtherHostTake,
  gate,
  mockAdapter,
  ownershipExpired,
  text,
  toolCall,
  untilAborted,
  wrapLogStore,
} from './helpers'
import type { AnyTool } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { HarnessPlugin, HarnessRunContext, OwnershipOptions } from '../src'
import type { StepRun } from '../src/durable-tool'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })

/** A host on `log` that runs one harness, with its replies and tools. */
async function openOn(
  log: LogStore,
  replies: Array<Reply>,
  options: {
    tools?: Array<AnyTool>
    ownership?: OwnershipOptions
    threadId?: string
    plugins?: () => ReadonlyArray<HarnessPlugin>
  } = {},
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({
    persistence: { stores: { log } },
    ...(options.ownership ? { ownership: options.ownership } : {}),
  })
  const harness = defineHarness({
    name: 'test/ownership',
    adapter,
    tools: options.tools ?? [],
    ...(options.plugins ? { plugins: options.plugins } : {}),
  })
  const session = await host.open(harness, {
    threadId: options.threadId ?? THREAD,
  })
  return { host, session, calls, harness }
}

/** Two hosts on one database: two log stores on one memory backend. */
function twoHosts() {
  const logState = memoryLogState()
  return {
    logA: memoryLogStore({ state: logState }),
    logB: memoryLogStore({ state: logState }),
  }
}

/** The text of each assistant message in a transcript. */
const assistantTexts = (
  messages: ReadonlyArray<{ role: string; content: unknown }>,
) =>
  messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content)

describe('ownership of a log by two hosts', () => {
  it('sends the inputs of a host to the owner of the log, and refuses its other writes', async () => {
    const { logA, logB } = twoHosts()
    const release = gate()
    // A renews well before its ownership would expire.
    const a = await openOn(
      logA,
      [after(release.opened, 'from A'), () => text('for B')],
      { ownership: { expiresAfterMs: 100, renewEveryMs: 20 } },
    )
    const b = await openOn(logB, [() => text('from B')])
    const turn = a.session.send('go', { inputId: 'in-a' })
    await waitFor(() => expect(a.calls).toHaveLength(1))
    // Longer than the ownership lasts without a renewal.
    await new Promise((resolve) => setTimeout(resolve, 150))

    // The prompt of B waits for A in the log. A runs it after its turn.
    expect(await b.session.send('hi', { inputId: 'in-b' }).receipt).toEqual({
      inputId: 'in-b',
      status: 'queued',
    })
    // An append is an input too: it waits for A, and A writes it.
    expect(
      await b.session.appendRecords({
        records: [{ type: 'app.from-b' }],
        inputId: 'in-append',
      }),
    ).toEqual({ inputId: 'in-append', status: 'queued' })
    // A write that is not an input is refused.
    await expect(
      b.session.schedule({
        at: Date.now() + 60_000,
        input: { op: 'prompt', message: 'later' },
      }),
    ).rejects.toThrow('Another host owns the log')

    // B still reads: it gets the answers of A.
    release.open()
    expect(await turn).toEqual({ text: 'from A', media: [] })
    await waitFor(async () =>
      expect(assistantTexts(await b.session.transcript())).toEqual([
        'from A',
        'for B',
      ]),
    )
    expect(b.calls).toHaveLength(0)
    const types = async () =>
      (await logA.read({ logId: LOG })).map((entry) => entry.record.type)
    await waitFor(async () => expect(await types()).toContain('app.from-b'))
    expect(await types()).not.toContain('harness.schedule')
    await a.host.close()
    await b.host.close()
  })

  it('aborts the work of a host that lost the log, and runs no side effect twice', async () => {
    const { logA, logB } = twoHosts()
    const aWakes = gate()
    const aWaits = gate()
    const steps: Array<{ host: string } & StepRun> = []
    let charges = 0
    /** The durable tool of a host: A pauses before its step. */
    const chargeOn = (host: 'A' | 'B') =>
      durableTool(
        toolDefinition({ name: 'charge', description: 'Charge the card' }),
        async (_args, { step }) => {
          if (host === 'A') {
            aWaits.open()
            await aWakes.opened
          }
          return step.do('charge', (run) => {
            steps.push({ host, ...run })
            charges += 1
            return 'paid'
          })
        },
      )
    const a = await openOn(
      logA,
      [() => toolCall('charge', {}, 'call-1'), () => text('A done')],
      { tools: [chargeOn('A')], ownership: CRASHING_OWNERSHIP },
    )
    const turnA = a.session.send('charge it', { inputId: 'in-1' })
    // A pauses in the tool, past the end of its ownership.
    await aWaits.opened
    await ownershipExpired()

    // B takes the log over and runs the turn again.
    const b = await openOn(logB, [() => text('B done')], {
      tools: [chargeOn('B')],
    })
    expect(await b.session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(charges).toBe(1)

    // A wakes up. Its turn stopped when B wrote, and its step does not run.
    aWakes.open()
    await expect(Promise.resolve(turnA)).rejects.toThrow(
      'Another host took this thread over',
    )
    expect(charges).toBe(1)
    expect(steps).toEqual([
      { host: 'B', idempotencyKey: `${LOG}:call-1:charge`, epoch: 2 },
    ])
    const entries = await logA.read({ logId: LOG })
    expect(
      entries.filter((entry) => entry.record.type === 'harness.tool.step'),
    ).toHaveLength(1)
    // A reads on: it has the records of B.
    expect(assistantTexts(await a.session.transcript())).toContain('B done')
    expect(a.session.snapshot().status).toBe('idle')
    await a.host.close()
    await b.host.close()
  })

  it('keeps the plugin state of another host off the log while the owner runs a tool', async () => {
    const { logA, logB } = twoHosts()
    const release = gate()
    const wait = toolDefinition({
      name: 'wait',
      description: 'Wait',
    }).server(async () => {
      await release.opened
      return 'waited'
    })
    // Like the MCP plugin: a host writes the state of its connection on
    // mount. The test keeps the outcome of that write.
    let stateWrite: Promise<unknown> | undefined
    const status = definePlugin({
      name: 'test/status',
      setup: (ctx) => {
        stateWrite = ctx
          .state({ connected: false })
          .update(() => ({ connected: true }))
          .then(
            () => 'written',
            (error: unknown) => error,
          )
        return {}
      },
    })
    const a = await openOn(
      logA,
      [() => toolCall('wait', {}), () => text('One.'), () => text('Two.')],
      { tools: [wait] },
    )
    const turn = a.session.send('Go.', { inputId: 'in-a' })
    await waitFor(() => expect(a.calls).toHaveLength(1))

    // B opens the thread while A runs the tool. The state write of its
    // plugin is refused: A owns the log.
    const b = await openOn(logB, [], { tools: [wait], plugins: () => [status] })
    expect(await stateWrite).toBeInstanceOf(LogOwnedElsewhereError)
    // The input of B waits for A on the input lane.
    expect(
      await b.session.send('And then?', {
        inputId: 'in-b',
        mode: 'followUp',
      }).receipt,
    ).toEqual({ inputId: 'in-b', status: 'queued' })

    // The turn of A did not stop, and A runs the input of B after it.
    release.open()
    expect(await turn).toEqual({ text: 'One.', media: [] })
    expect(await a.session.settled({ inputId: 'in-b' })).toMatchObject({
      outcome: 'completed',
    })
    expect(a.calls).toHaveLength(3)
    expect(b.calls).toHaveLength(0)
    expect(await a.session.transcript()).toMatchObject([
      { role: 'user', content: 'Go.' },
      { role: 'assistant' },
      { role: 'tool', content: 'waited' },
      { role: 'assistant', content: 'One.' },
      { role: 'user', content: 'And then?' },
      { role: 'assistant', content: 'Two.' },
    ])
    // The log has no record of the plugin state of B.
    const types = (await logA.read({ logId: LOG })).map(
      (entry) => entry.record.type,
    )
    expect(types).not.toContain('harness.plugin.state')
    expect(a.session.snapshot().plugins).toEqual({})
    await a.host.close()
    await b.host.close()
  })
})

describe('a host that lost the log and takes it back', () => {
  it('runs again the turn that it stopped, when the next owner stopped too', async () => {
    const log = memoryLogStore()
    const a = await openOn(log, [untilAborted(), () => text('A again')], {
      ownership: CRASHING_OWNERSHIP,
    })
    const turn = a.session.send('go', { inputId: 'in-1' })
    await waitFor(() => expect(a.calls).toHaveLength(1))
    await ownershipExpired()

    // B takes the log, writes once, and crashes before the turn settles.
    const owned = await log.acquireOwnership({
      logId: LOG,
      harness: 'test/ownership',
      ownerId: 'host-b',
      ttlMs: CRASHING_OWNERSHIP.expiresAfterMs,
    })
    if (owned === null) throw new Error('B did not get the log.')
    const head = (await log.read({ logId: LOG })).at(-1)?.seq ?? 0
    await log.append({
      logId: LOG,
      seq: head + 1,
      epoch: owned.epoch,
      records: [{ type: 'app.from-b' }],
    })
    await expect(Promise.resolve(turn)).rejects.toThrow(
      'Another host took this thread over',
    )
    await ownershipExpired()

    // The worker of A takes the log, with the session of A still open.
    await a.host.resumePending({ harnesses: [a.harness] })
    await waitFor(() => expect(a.calls).toHaveLength(2))
    expect(await a.session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    await a.host.close()
  })

  it('keeps writing when its own worker takes the log after a store outage', async () => {
    const inner = memoryLogStore()
    let isDown = false
    let renewals = 0
    const log = wrapLogStore(inner, {
      renewOwnership: async (input) => {
        if (isDown) throw new Error('The store is down.')
        renewals += 1
        return inner.renewOwnership(input)
      },
    })
    const release = gate()
    const a = await openOn(log, [after(release.opened, 'done')], {
      ownership: { expiresAfterMs: 200, renewEveryMs: 50 },
    })
    const turn = a.session.send('go', { inputId: 'in-1' })
    await waitFor(() => expect(a.calls).toHaveLength(1))

    // No renewal lands for longer than the ownership lasts.
    isDown = true
    await ownershipExpired()
    // The worker of the same host takes the expired log.
    await a.host.resumePending({ harnesses: [a.harness] })
    isDown = false
    renewals = 0
    await waitFor(() => expect(renewals).toBeGreaterThan(0))

    release.open()
    expect(await turn).toEqual({ text: 'done', media: [] })
    // The idle session gives the log back.
    await waitFor(async () =>
      expect(await canOtherHostTake(log, LOG)).toBe(true),
    )
    await a.host.close()
  })
})

describe('renewals', () => {
  it('renews every log that a host owns with one timer', async () => {
    // A value that no other timer uses.
    const renewMs = 37
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const log = memoryLogStore()
    const renew = vi.spyOn(log, 'renewOwnership')
    const release = gate()
    // Every model call waits for `release`.
    const { adapter } = mockAdapter(after(release.opened, 'done'))
    const host = createHarnessHost({
      persistence: { stores: { log } },
      ownership: { expiresAfterMs: 60_000, renewEveryMs: renewMs },
    })
    const harness = defineHarness({ name: 'test/ownership', adapter })
    const threads = ['t1', 't2', 't3']
    const logIds = threads.map((threadId) => logIdOf({ logId: threadId }))
    // An operation is a thenable: wrap it, so `Promise.all` does not wait
    // for the turn.
    const running = await Promise.all(
      threads.map(async (threadId) => {
        const session = await host.open(harness, { threadId })
        const turn = session.send('go')
        await turn.receipt
        return { turn }
      }),
    )
    // Each thread owns its log while its turn runs.
    for (const logId of logIds) {
      expect(await canOtherHostTake(log, logId)).toBe(false)
    }

    // The next rounds renew each owned log.
    const before = renew.mock.calls.length
    await waitFor(() =>
      expect(renew.mock.calls.length).toBeGreaterThanOrEqual(before + 6),
    )
    const renewed = renew.mock.calls.slice(before).map(([claim]) => claim.logId)
    expect(new Set(renewed)).toEqual(new Set(logIds))
    const timers = intervals.mock.calls.filter(([, ms]) => ms === renewMs)
    expect(timers).toHaveLength(1)

    release.open()
    await Promise.all(running.map(({ turn }) => turn))
    await waitFor(async () => {
      for (const logId of logIds) {
        expect(await canOtherHostTake(log, logId)).toBe(true)
      }
    })
    await host.close()
    intervals.mockRestore()
  })

  it('gives the log up when the session goes idle, and makes no more store calls', async () => {
    const log = memoryLogStore()
    const renew = vi.spyOn(log, 'renewOwnership')
    const release = gate()
    const { host, session } = await openOn(
      log,
      [after(release.opened, 'done')],
      { ownership: { expiresAfterMs: 60_000, renewEveryMs: 10 } },
    )

    const turn = session.send('go')
    await waitFor(() => expect(renew).toHaveBeenCalled())
    release.open()
    await turn

    await waitFor(async () =>
      expect(await canOtherHostTake(log, LOG)).toBe(true),
    )
    const calls = renew.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(renew).toHaveBeenCalledTimes(calls)
    await host.close()
  })

  it('keeps the log after a renewal that fails, and renews it at the next tick', async () => {
    const log = memoryLogStore()
    const ownership = new HostOwnership({
      store: log,
      ownerId: 'host-1',
      timing: { expiresAfterMs: 60_000, renewEveryMs: 10 },
    })
    const lost = vi.fn()
    ownership.onLost(LOG, lost)
    const epoch = await ownership.acquire(LOG, 'test/ownership')
    const renew = vi
      .spyOn(log, 'renewOwnership')
      .mockRejectedValueOnce(new Error('store down'))

    await waitFor(() =>
      expect(renew.mock.calls.length).toBeGreaterThanOrEqual(2),
    )

    expect(lost).not.toHaveBeenCalled()
    expect(ownership.epochOf(LOG)).toBe(epoch)
    expect(await canOtherHostTake(log, LOG)).toBe(false)
    await ownership.close()
    expect(await canOtherHostTake(log, LOG)).toBe(true)
  })

  it('tells the log when a renewal finds another owner', async () => {
    const log = memoryLogStore()
    const ownership = new HostOwnership({
      store: log,
      ownerId: 'host-1',
      timing: { ...CRASHING_OWNERSHIP, expiresAfterMs: 20, renewEveryMs: 40 },
    })
    const lost = vi.fn()
    ownership.onLost(LOG, lost)
    await ownership.acquire(LOG, 'test/ownership')
    // The ownership expires before the first renewal, and another host
    // takes the log.
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(await canOtherHostTake(log, LOG)).toBe(true)

    await waitFor(() => expect(lost).toHaveBeenCalledTimes(1))
    expect(ownership.epochOf(LOG)).toBeUndefined()
    await ownership.close()
  })
})

describe('pins', () => {
  it('gives a pinned log to the host with that affinity only', async () => {
    const log = memoryLogStore()
    const pinned = new HostOwnership({
      store: log,
      ownerId: 'host-1',
      affinity: 'machine-a',
    })
    const epoch = await pinned.acquire(LOG, 'test/ownership')
    if (epoch === null) throw new Error('Not acquired.')

    await pinned.pin(LOG, epoch, 'machine-a')
    await pinned.release(LOG)

    // A host with no affinity, or another one, does not get the log.
    expect(await canOtherHostTake(log, LOG)).toBe(false)
    const other = new HostOwnership({
      store: log,
      ownerId: 'host-2',
      affinity: 'machine-b',
    })
    expect(await other.acquire(LOG, 'test/ownership')).toBeNull()
    // The next process on machine-a gets it.
    const restarted = new HostOwnership({
      store: log,
      ownerId: 'host-3',
      affinity: 'machine-a',
    })
    expect(await restarted.acquire(LOG, 'test/ownership')).toBe(epoch + 1)
    await restarted.close()
  })
})

describe('the run context', () => {
  it('gives tools the epoch of the log and an idempotency key', async () => {
    const seen: Array<{ epoch: number; key: string; scoped: string }> = []
    const charge = toolDefinition({
      name: 'charge',
      description: 'Charge the card',
    }).server<HarnessRunContext>(async (_args, ctx) => {
      const { run } = ctx.context
      seen.push({
        epoch: run.epoch,
        key: run.idempotencyKey('charge'),
        scoped: run.idempotencyKey('charge', ctx.toolCallId),
      })
      return 'paid'
    })
    const persistence = memoryPersistence()
    const { host, session } = await openOn(
      persistence.stores.log,
      [() => toolCall('charge', {}, 'call-7'), () => text('done')],
      { tools: [charge] },
    )

    const turn = session.send('charge it', { inputId: 'in-1' })
    await turn

    expect(seen).toEqual([
      {
        epoch: 1,
        key: `${LOG}:${turn.id}:charge`,
        scoped: `${LOG}:call-7:charge`,
      },
    ])
    await host.close()
  })
})

describe('ownership timing', () => {
  it('renews at a third of expiresAfterMs when only expiresAfterMs is set', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const ownership = new HostOwnership({
      store: memoryLogStore(),
      ownerId: 'host-1',
      timing: { expiresAfterMs: 6_000 },
    })
    await ownership.acquire(LOG, 'test/ownership')

    expect(intervals.mock.calls.map(([, ms]) => ms)).toContain(2_000)
    await ownership.close()
    intervals.mockRestore()
  })

  it('refuses a renewEveryMs that is not less than expiresAfterMs', () => {
    expect(() =>
      createHarnessHost({
        persistence: memoryPersistence(),
        ownership: { expiresAfterMs: 5_000, renewEveryMs: 5_000 },
      }),
    ).toThrow(RangeError)
    expect(() =>
      createHarnessHost({
        persistence: memoryPersistence(),
        ownership: { renewEveryMs: 30_000 },
      }),
    ).toThrow('must be less than ownership.expiresAfterMs')
    expect(() =>
      createHarnessHost({
        persistence: memoryPersistence(),
        ownership: { expiresAfterMs: 0 },
      }),
    ).toThrow('more than 0')
  })
})
