import { describe, expect, it, vi } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import {
  NO_OWNER_EPOCH,
  memoryLogState,
  memoryLogStore,
} from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin, logIdOf } from '../src'
import { OPEN_RETRY_MS } from '../src/ownership'
import {
  after,
  canOtherHostTake,
  gate,
  mockAdapter,
  stoppedRun,
  text,
  wrapLogStore,
} from './helpers'
import type { LogRecord, LogStore } from '@tanstack/ai-persistence'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })
const NAME = 'test/resume-pending'

/**
 * The host that wrote the log `logId` stopped while it owned it: its
 * ownership expires at once. Wait with `expired()`.
 */
const stopOwner = (log: LogStore, logId = LOG, harness = NAME) =>
  log.acquireOwnership({ logId, harness, ownerId: 'host-gone', ttlMs: 1 })

/** Wait until the ownerships of `stopOwner` expired. */
const expired = () => new Promise((resolve) => setTimeout(resolve, 5))

/** Append `records` to the log `logId`, as a host does before it owns it. */
const seed = (log: LogStore, records: Array<LogRecord>, logId = LOG) =>
  log.append({ logId, seq: 1, epoch: NO_OWNER_EPOCH, records })

/** The log and run of a host that stopped during a turn. */
async function seedStoppedTurn(log: LogStore) {
  await seed(log, [
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
    stoppedRun('op-stopped', THREAD, {
      checkpoint: { at: 1, pendingTools: [] },
    }),
  ])
  await stopOwner(log)
}

/** A detached agent run `op-agent` of `agent` whose host stopped. */
async function seedStoppedAgent(
  log: LogStore,
  agent: string,
  input: { runAgainAfterCrash?: true } = {},
) {
  await seed(log, [
    {
      type: 'harness.input',
      inputId: 'in-agent',
      input: { op: 'agent', agent, detached: true, ...input },
      at: 1,
    },
    {
      type: 'harness.input.applied',
      inputId: 'in-agent',
      operationId: 'op-agent',
      attempt: 1,
    },
    stoppedRun('op-agent', THREAD, { kind: 'agent', agent }),
  ])
  await stopOwner(log)
}

/** The settle record of `inputId` in the log of `THREAD`, or undefined. */
const settledRecord = async (log: LogStore, inputId: string) =>
  (await log.read({ logId: LOG }))
    .map((entry) => entry.record)
    .find(
      (record) =>
        record.type === 'harness.input.settled' && record.inputId === inputId,
    )

/** A log store whose writes take about 30 ms. */
function slowLogStore() {
  const log = memoryLogStore()
  return wrapLogStore(log, {
    append: async (batch) => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return log.append(batch)
    },
  })
}

const hostOn = (log: LogStore) =>
  createHarnessHost({ persistence: { stores: { log } } })

describe('host.resumePending', () => {
  it('resumes a turn whose host stopped, and gives the log back', async () => {
    const log = memoryLogStore()
    await seedStoppedTurn(log)
    await expired()
    const { adapter, calls } = mockAdapter([() => text('Recovered.')])
    const host = hostOn(log)

    expect(
      await host.resumePending({
        harnesses: [defineHarness({ name: NAME, adapter })],
      }),
    ).toEqual([{ threadId: THREAD, harness: NAME }])
    await waitFor(async () =>
      expect(await settledRecord(log, 'in-1')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(calls).toHaveLength(1)
    await waitFor(async () =>
      expect(await canOtherHostTake(log, LOG)).toBe(true),
    )
    await host.close()
  })

  it('runs an input that was stored just before the host stopped', async () => {
    const log = memoryLogStore()
    await seed(log, [
      {
        type: 'harness.input',
        inputId: 'in-early',
        input: { op: 'prompt', message: 'go', busy: 'queue' },
        at: 1,
      },
    ])
    await stopOwner(log)
    await expired()
    const { adapter, calls } = mockAdapter([() => text('Ran.')])
    const host = hostOn(log)

    await host.resumePending({
      harnesses: [defineHarness({ name: NAME, adapter })],
    })
    await waitFor(async () =>
      expect(await settledRecord(log, 'in-early')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('fails a stopped background agent and wakes the thread, as an open does', async () => {
    const log = memoryLogStore()
    await seedStoppedAgent(log, 'waiter')
    await expired()
    const { adapter, calls } = mockAdapter([() => text('Noted.')])
    const host = hostOn(log)

    await host.resumePending({
      harnesses: [defineHarness({ name: NAME, adapter })],
    })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(await settledRecord(log, 'in-agent')).toMatchObject({
      outcome: 'failed',
    })
    await host.close()
  })

  it('with close: whenIdle, runs the wake turn of a stopped agent when the log store is slow', async () => {
    const log = slowLogStore()
    await seedStoppedAgent(log, 'waiter')
    await expired()
    const { adapter, calls } = mockAdapter([() => text('Noted.')])
    const host = hostOn(log)

    await host.resumePending({
      harnesses: [defineHarness({ name: NAME, adapter })],
      close: 'whenIdle',
    })
    await waitFor(() => expect(calls).toHaveLength(1), { timeout: 2_000 })
    expect(await settledRecord(log, 'in-agent')).toMatchObject({
      outcome: 'failed',
    })
    await host.close()
  })

  it('continues a resumable background agent whose host stopped', async () => {
    const log = memoryLogStore()
    await seedStoppedAgent(log, 'worker', { runAgainAfterCrash: true })
    await expired()
    const agentModel = mockAdapter([() => text('Worked.')])
    const worker = defineAgent({
      name: 'worker',
      description: 'Works',
      run: (ctx) => ctx.chat({ adapter: agentModel.adapter }),
    })
    const main = mockAdapter([() => text('Noted.')])
    const host = hostOn(log)

    await host.resumePending({
      harnesses: [
        defineHarness({ name: NAME, adapter: main.adapter, agents: [worker] }),
      ],
    })
    await waitFor(async () =>
      expect(await settledRecord(log, 'in-agent')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(agentModel.calls).toHaveLength(1)
    await host.close()
  })

  it('gives each log to one of two hosts that sweep at once', async () => {
    const log = memoryLogStore()
    await seedStoppedTurn(log)
    await expired()
    const { adapter, calls } = mockAdapter([
      () => text('Recovered.'),
      () => text('Twice.'),
    ])
    const harness = defineHarness({ name: NAME, adapter })
    const a = hostOn(log)
    const b = hostOn(log)

    const [fromA, fromB] = await Promise.all([
      a.resumePending({ harnesses: [harness] }),
      b.resumePending({ harnesses: [harness] }),
    ])
    expect([...fromA, ...fromB]).toEqual([{ threadId: THREAD, harness: NAME }])
    await waitFor(() => expect(calls).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toHaveLength(1)
    await a.close()
    await b.close()
  })

  it('leaves a log alone while its host still works on it', async () => {
    const log = memoryLogStore()
    const release = gate()
    const { adapter } = mockAdapter([after(release.opened, 'Done.')])
    const harness = defineHarness({ name: NAME, adapter })
    const live = hostOn(log)
    const session = await live.open(harness, { threadId: THREAD })
    const turn = session.send('Go.')
    await turn.receipt

    const sweeper = hostOn(log)
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
      const log = memoryLogStore()
      await seedStoppedTurn(log)
      await expired()
      const setup = vi.fn(() => ({}))
      const counter = definePlugin({ name: 'test/count', setup })
      const { adapter, calls } = mockAdapter([() => text('Recovered.')])
      const harness = defineHarness({
        name: NAME,
        adapter,
        plugins: () => [counter],
      })
      const host = hostOn(log)

      await host.resumePending({ harnesses: [harness], close })
      await waitFor(() => expect(calls).toHaveLength(1))
      // Give a 'whenIdle' close time to happen, so 'never' is a real check.
      await new Promise((resolve) => setTimeout(resolve, 50))
      // A session that closed sets its plugins up again on the next open.
      await waitFor(async () => {
        await host.open(harness, { threadId: THREAD })
        expect(setup).toHaveBeenCalledTimes(setups)
      })
      await host.close()
    },
  )

  it('skips a log of a harness it was not given, and leaves it listed', async () => {
    const log = memoryLogStore()
    const other = logIdOf({ logId: 'other-thread' })
    await stopOwner(log, other, 'test/other')
    await expired()
    const host = hostOn(log)

    expect(
      await host.resumePending({
        harnesses: [
          defineHarness({ name: NAME, adapter: mockAdapter([]).adapter }),
        ],
      }),
    ).toEqual([])
    expect(await log.listLogsWithoutOwner({ limit: 10 })).toEqual([
      { logId: other, harness: 'test/other', reason: 'expired' },
    ])
    await host.close()
  })

  it('with close: whenIdle, runs a prompt that arrives as the swept session closes', async () => {
    const base = memoryLogStore()
    await seedStoppedTurn(base)
    await expired()
    const recovered = gate()
    const { adapter, calls } = mockAdapter([
      after(recovered.opened, 'Recovered.'),
      () => text('Answered.'),
    ])
    const harness = defineHarness({ name: NAME, adapter })
    let arriving: Promise<string> | undefined
    // The thread goes idle: the session gives the log back, and the sweep
    // closes it. A new prompt arrives right then, the way a request does.
    const log = wrapLogStore(base, {
      releaseOwnership: (claim) => {
        if (arriving === undefined) {
          queueMicrotask(() => {
            arriving = host
              .open(harness, { threadId: THREAD })
              .then(async (session) => (await session.send('Again.')).text)
          })
        }
        return base.releaseOwnership(claim)
      },
    })
    const host = hostOn(log)
    await host.resumePending({ harnesses: [harness] })

    recovered.open()
    await waitFor(() => expect(arriving).toBeDefined())
    await expect(arriving).resolves.toBe('Answered.')
    expect(calls).toHaveLength(2)
    await host.close()
  })

  it('goes on after a thread that fails to open, and names the threads it opened', async () => {
    let skew = 0
    const log = memoryLogStore({
      state: memoryLogState({ now: () => Date.now() + skew }),
    })
    // The failing thread expired first, so it comes first.
    await stopOwner(log, logIdOf({ logId: 't-bad' }))
    await seedStoppedTurn(log)
    await expired()
    const { adapter, calls } = mockAdapter([() => text('Recovered.')])
    const broken = definePlugin({
      name: 'test/broken',
      setup: (ctx) => {
        if (ctx.session.threadId === 't-bad') throw new Error('bad thread')
        return {}
      },
    })
    const host = hostOn(log)

    const failure = await host
      .resumePending({
        harnesses: [
          defineHarness({ name: NAME, adapter, plugins: () => [broken] }),
        ],
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure).toMatchObject({
      errors: [expect.any(Error)],
      opened: [{ threadId: THREAD, harness: NAME }],
    })
    await waitFor(async () =>
      expect(await settledRecord(log, 'in-1')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(calls).toHaveLength(1)
    // The log of the thread that failed goes back with a wake, so a later
    // sweep lists it again.
    const listed = async () =>
      (await log.listLogsWithoutOwner({ limit: 10, harnesses: [NAME] })).map(
        (orphan) => orphan.logId,
      )
    expect(await listed()).not.toContain(logIdOf({ logId: 't-bad' }))
    skew = OPEN_RETRY_MS
    expect(await listed()).toContain(logIdOf({ logId: 't-bad' }))
    await host.close()
  })

  it('opens at most limit threads per call, and the next call opens the rest', async () => {
    const log = memoryLogStore()
    // Three logs whose host stopped, the oldest first.
    for (const threadId of ['t-a', 't-b', 't-c']) {
      await stopOwner(log, logIdOf({ logId: threadId }))
      await expired()
    }
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter([]).adapter,
    })
    const host = hostOn(log)

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
