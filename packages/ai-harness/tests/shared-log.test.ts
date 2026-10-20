import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import { appendToLog, mockAdapter, wrapLogStore } from './helpers'
import type { LogRecord, LogStore } from '@tanstack/ai-persistence'
import type { ReduceOptions } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const ROOT = 'agent-1'
/** The id of the log of `ROOT` in the store. */
const STORE_LOG = logIdOf({ logId: ROOT })

function durablePersistence(log: LogStore = memoryLogStore()) {
  const { metadata } = memoryPersistence().stores
  return { stores: { log, metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

/** Host state: the last value of each name, across the whole log. */
const reduce: ReduceOptions<Record<string, unknown>> = {
  initial: {},
  record: ({ state, record }) =>
    record.type === 'app.state_write' && typeof record.name === 'string'
      ? { ...state, [record.name]: record.value }
      : state,
}

const hostFor = (persistence: Durable) => createHarnessHost({ persistence })

/** A harness whose `durability.logState` folds the log of its sessions. */
const tracked = defineHarness({
  name: 'test/shared',
  adapter: mockAdapter([]).adapter,
  durability: { logState: reduce },
})

/** A harness with no `durability.logState`. */
const plain = defineHarness({
  name: 'test/shared',
  adapter: mockAdapter([]).adapter,
})

describe('the log of a session tree', () => {
  it('lands a child record and a root record in one append, or neither', async () => {
    const inner = memoryLogStore()
    // The app record types of each store append.
    const batches: Array<Array<string>> = []
    // A plain object, so the test can swap `append` below.
    const log = wrapLogStore(inner, {
      append: async (batch) => {
        await inner.append(batch)
        batches.push(
          batch.records
            .map((record) => record.type)
            .filter((type) => type.startsWith('app.')),
        )
      },
    })
    const host = hostFor(durablePersistence(log))
    const root = await host.open(plain, { threadId: ROOT })
    const pair: Array<LogRecord> = [
      { type: 'app.child_created', thread: 'task-1', task: 'research' },
      { type: 'app.child_linked', child: 'task-1' },
    ]

    await root.appendRecords({ records: pair })
    // The append is an input, so the log has its input records too. The app
    // records are in one store append.
    const appTypes = async () =>
      (await inner.read({ logId: STORE_LOG }))
        .map((entry) => entry.record.type)
        .filter((type) => type.startsWith('app.'))
    expect(await appTypes()).toEqual(['app.child_created', 'app.child_linked'])
    expect(batches.filter((types) => types.length > 0)).toEqual([
      ['app.child_created', 'app.child_linked'],
    ])

    // The writer tries twice, so both tries fail.
    const original = log.append
    log.append = async () => {
      throw new Error('store down')
    }
    await expect(root.appendRecords({ records: pair })).rejects.toThrow(
      'store down',
    )
    log.append = original
    expect(await appTypes()).toEqual(['app.child_created', 'app.child_linked'])
    await host.close().catch(() => {})
  })

  it('folds the records of the root and of its child threads with session.logState(), on any machine', async () => {
    const persistence = durablePersistence()
    const host = hostFor(persistence)
    const root = await host.open(tracked, { threadId: ROOT })

    await root.appendRecords({
      records: [{ type: 'app.state_write', name: 'plan', value: 'a' }],
    })
    await root.appendRecords({
      records: [
        { type: 'app.state_write', thread: 'task-1', name: 'plan', value: 'b' },
      ],
    })
    await root.appendRecords({
      records: [{ type: 'app.state_write', name: 'done', value: true }],
    })

    const folded = { plan: 'b', done: true }
    expect(await root.logState()).toEqual(folded)
    expectTypeOf(root.logState).returns.resolves.toEqualTypeOf<
      Record<string, unknown> | undefined
    >()
    await host.close()

    // Another host folds the same log from the store.
    const next = hostFor(persistence)
    const view = await next.observe(tracked, { threadId: ROOT })
    expect(await view.logState()).toEqual(folded)
    const again = await next.open(tracked, { threadId: ROOT })
    expect(await again.logState()).toEqual(folded)
    await next.close()
  })

  it('gives undefined from session.logState() for a harness without reduce', async () => {
    const host = hostFor(durablePersistence())
    const root = await host.open(plain, { threadId: ROOT })
    await root.appendRecords({
      records: [{ type: 'app.state_write', name: 'plan', value: 'a' }],
    })

    expect(await root.logState()).toBeUndefined()
    expectTypeOf(root.logState).returns.resolves.toEqualTypeOf<undefined>()
    await host.close()
  })

  it('refuses to open a log with another reduce than the one that folds it', async () => {
    const host = hostFor(durablePersistence())
    await host.open(tracked, { threadId: ROOT })
    const other = defineHarness({
      name: 'test/other',
      adapter: mockAdapter([]).adapter,
    })

    await expect(host.open(other, { threadId: ROOT })).rejects.toThrow(
      'Pass the same addRecordsToModelContext and logState objects to every harness that shares a log.',
    )
    // A view reads the log through the fold too.
    const view = await host.observe(plain, { threadId: ROOT })
    await expect(view.logState()).rejects.toThrow('durability.logState')
    await host.close()
  })

  it('gives project only the records of its own thread', async () => {
    const host = createHarnessHost({ persistence: durablePersistence() })
    const harness = defineHarness({
      name: 'test/shared',
      adapter: mockAdapter([]).adapter,
      durability: {
        addRecordsToModelContext: {
          record: ({ messages, record }) =>
            record.type === 'app.signal' && typeof record.text === 'string'
              ? [...messages, { role: 'user', content: record.text }]
              : undefined,
        },
      },
    })
    const root = await host.open(harness, { threadId: ROOT })
    await root.appendRecords({
      records: [
        { type: 'app.signal', thread: 'task-1', text: 'for the child' },
        { type: 'app.signal', text: 'for the root' },
      ],
    })

    expect((await root.transcript()).map((m) => m.content)).toEqual([
      'for the root',
    ])
    await host.close()
  })

  it('keeps the session open when another host writes to its log', async () => {
    const persistence = durablePersistence()
    const host = hostFor(persistence)
    const root = await host.open(plain, { threadId: ROOT })
    await root.appendRecords({ records: [{ type: 'app.signal' }] })

    // The session has no work, so the host gave the log up. Another host
    // takes it and writes.
    await waitFor(() =>
      appendToLog(persistence.stores.log, { threadId: ROOT }, [
        { type: 'app.other', thread: 'task-1' },
      ]),
    )

    expect(host.isOpen(plain, { threadId: ROOT })).toBe(true)
    // The next write acquires the log again, after the record of the other
    // host.
    await root.appendRecords({ records: [{ type: 'app.root' }] })
    const records = await persistence.stores.log.read({ logId: STORE_LOG })
    const types = records
      .map((entry) => entry.record.type)
      .filter((type) => type.startsWith('app.'))
    expect(types).toEqual(['app.signal', 'app.other', 'app.root'])
    await host.close().catch(() => {})
  })

  it('refuses a record whose thread field is not a string', async () => {
    const host = hostFor(durablePersistence())
    const root = await host.open(plain, { threadId: ROOT })

    await expect(
      root.appendRecords({ records: [{ type: 'app.signal', thread: 7 }] }),
    ).rejects.toThrow('thread')
    await host.close()
  })
})
