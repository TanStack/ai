import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  logIdOf,
  logMessageStore,
} from '../src'
import {
  CRASHING_OWNERSHIP,
  appendToLog,
  gate,
  messageTexts,
  mockAdapter,
  ownershipExpired,
  text,
  untilAborted,
  wrapLogStore,
} from './helpers'
import type { LogRecord, LogStore } from '@tanstack/ai-persistence'
import type { OwnershipOptions, ReduceOptions } from '../src'
import type { Reply } from './helpers'

const LOG = 'agent-1'
/** The id of the log `LOG` in the store. */
const STORE_LOG = logIdOf({ logId: LOG })

function durablePersistence(log: LogStore = memoryLogStore()) {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log, runs, metadata } }
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

function hostFor(persistence: Durable, ownership?: OwnershipOptions) {
  return createHarnessHost({ persistence, ...(ownership ? { ownership } : {}) })
}

/** A harness whose `reduce` folds the logs it opens. */
const harnessWith = (replies: Array<Reply>) => {
  const { adapter, calls } = mockAdapter(replies)
  return {
    harness: defineHarness({
      name: 'test/shared',
      adapter,
      durability: { reduce },
    }),
    calls,
  }
}

/** A harness with no `reduce`. */
const plainHarness = () =>
  defineHarness({ name: 'test/shared', adapter: mockAdapter([]).adapter })

describe('sessions that share one log', () => {
  it('run turns at the same time and each rebuilds its own transcript after a crash', async () => {
    const persistence = durablePersistence()
    const release = gate()
    const host = hostFor(persistence, CRASHING_OWNERSHIP)
    const rootModel = harnessWith([
      () =>
        (async function* () {
          await release.opened
          yield* text('root answer')
        })(),
    ])
    const childModel = harnessWith([() => text('child answer'), untilAborted()])
    const root = await host.open(rootModel.harness, { threadId: LOG })
    const child = await host.open(childModel.harness, {
      threadId: 'task-1',
      logId: LOG,
    })

    const rootTurn = root.send('root question', { inputId: 'root-1' })
    // The child answers while the root turn still waits.
    expect(await child.send('child question')).toEqual({
      text: 'child answer',
      media: [],
    })
    release.open()
    expect(await rootTurn).toEqual({ text: 'root answer', media: [] })
    void child.send('second child question', { inputId: 'child-2' }).then(
      () => {},
      () => {},
    )
    await vi.waitFor(() => expect(childModel.calls).toHaveLength(2))
    // The host stops: its ownership of the log expires.
    await ownershipExpired()

    const next = hostFor(persistence)
    const rootAgain = await next.open(harnessWith([]).harness, {
      threadId: LOG,
    })
    const childNext = harnessWith([() => text('child recovered')])
    const childAgain = await next.open(childNext.harness, {
      threadId: 'task-1',
      logId: LOG,
    })

    expect(
      (await rootAgain.transcript()).map((message) => message.content),
    ).toEqual(['root question', 'root answer'])
    expect(await childAgain.settled('child-2')).toMatchObject({
      outcome: 'completed',
    })
    expect(messageTexts(childNext.calls[0])).toEqual([
      'child question',
      'child answer',
      'second child question',
    ])
    expect(
      await persistence.stores.log.read({
        logId: logIdOf({ logId: 'task-1' }),
      }),
    ).toEqual([])
    await host.close().catch(() => {})
    await next.close()
  })

  it('lands a child record and a parent record in one append, or neither', async () => {
    const inner = memoryLogStore()
    // A plain object, so the test can swap `append` below.
    const log = wrapLogStore(inner, {})
    const persistence = durablePersistence(log)
    const host = hostFor(persistence)
    const root = await host.open(harnessWith([]).harness, {
      threadId: LOG,
    })
    const pair: Array<LogRecord> = [
      { type: 'app.child_created', thread: 'task-1', task: 'research' },
      { type: 'app.child_linked', child: 'task-1' },
    ]

    await root.append(pair)
    const types = async () =>
      (await inner.read({ logId: STORE_LOG })).map((entry) => entry.record.type)
    expect(await types()).toEqual(['app.child_created', 'app.child_linked'])

    // The writer tries twice, so both tries fail.
    const original = log.append
    log.append = async () => {
      throw new Error('store down')
    }
    await expect(root.append(pair)).rejects.toThrow('store down')
    log.append = original
    expect(await types()).toEqual(['app.child_created', 'app.child_linked'])
    await host.close().catch(() => {})
  })

  it('folds state writes from two sessions in log order, with the reduce of the first harness, also after a rebuild', async () => {
    const persistence = durablePersistence()
    const host = hostFor(persistence)
    const tracked = harnessWith([]).harness
    const plain = plainHarness()
    const root = await host.open(tracked, { threadId: LOG })
    // The harness of the root opened the log first, so its reduce folds the
    // records of this child too.
    const child = await host.open(plain, {
      threadId: 'task-1',
      logId: LOG,
    })

    await root.append([{ type: 'app.state_write', name: 'plan', value: 'a' }])
    await child.append([{ type: 'app.state_write', name: 'plan', value: 'b' }])
    await root.append([{ type: 'app.state_write', name: 'done', value: true }])

    expect(host.logState({ harness: tracked, logId: LOG })).toEqual({
      plan: 'b',
      done: true,
    })
    // The reduce of `plain` did not fold this log.
    expect(host.logState({ harness: plain, logId: LOG })).toBeUndefined()
    expectTypeOf(host.logState({ harness: tracked, logId: LOG })).toEqualTypeOf<
      Record<string, unknown> | undefined
    >()
    expectTypeOf(
      host.logState({ harness: plain, logId: LOG }),
    ).toEqualTypeOf<undefined>()
    await host.close()
    const next = hostFor(persistence)
    await next.open(tracked, { threadId: 'task-1', logId: LOG })
    expect(next.logState({ harness: tracked, logId: LOG })).toEqual({
      plan: 'b',
      done: true,
    })
    expect(
      next.logState({ harness: tracked, logId: 'another-log' }),
    ).toBeUndefined()
    await next.close()
  })

  it('gives project only the records of its own session', async () => {
    const host = createHarnessHost({ persistence: durablePersistence() })
    const harness = defineHarness({
      name: 'test/shared',
      adapter: mockAdapter([]).adapter,
      durability: {
        project: {
          record: ({ messages, record }) =>
            record.type === 'app.signal' && typeof record.text === 'string'
              ? [...messages, { role: 'user', content: record.text }]
              : undefined,
        },
      },
    })
    const root = await host.open(harness, { threadId: LOG })
    const child = await host.open(harness, { threadId: 'task-1', logId: LOG })
    await root.append([
      { type: 'app.signal', thread: 'task-1', text: 'for the child' },
      { type: 'app.signal', text: 'for the root' },
    ])

    expect((await root.transcript()).map((m) => m.content)).toEqual([
      'for the root',
    ])
    expect((await child.transcript()).map((m) => m.content)).toEqual([
      'for the child',
    ])
    await host.close()
  })

  it('keeps both sessions of the log open when another host writes to it', async () => {
    const persistence = durablePersistence()
    const host = hostFor(persistence)
    const root = await host.open(harnessWith([]).harness, {
      threadId: LOG,
    })
    const child = await host.open(harnessWith([]).harness, {
      threadId: 'task-1',
      logId: LOG,
    })
    await root.append([{ type: 'app.signal' }])

    // The sessions have no work, so the host gave the log up. Another host
    // takes it and writes.
    await vi.waitFor(() =>
      appendToLog(persistence.stores.log, { threadId: LOG }, [
        { type: 'app.other' },
      ]),
    )

    const isOpen = (threadId: string) =>
      host.isOpen(harnessWith([]).harness, { threadId })
    expect(isOpen(LOG)).toBe(true)
    expect(isOpen('task-1')).toBe(true)
    // The next write acquires the log again, after the record of the other
    // host.
    await child.append([{ type: 'app.child' }])
    await root.append([{ type: 'app.root' }])
    const records = await persistence.stores.log.read({ logId: STORE_LOG })
    const types = records
      .map((entry) => entry.record.type)
      .filter((type) => type.startsWith('app.'))
    expect(types).toEqual(['app.signal', 'app.other', 'app.child', 'app.root'])
    await host.close().catch(() => {})
  })

  it('keeps the other session running when one closes', async () => {
    const persistence = durablePersistence()
    const host = hostFor(persistence)
    const root = await host.open(
      harnessWith([() => text('still here')]).harness,
      {
        threadId: LOG,
      },
    )
    const child = await host.open(harnessWith([]).harness, {
      threadId: 'task-1',
      logId: LOG,
    })

    await child.close()

    expect(await root.send('are you there?')).toEqual({
      text: 'still here',
      media: [],
    })
    await host.close()
  })

  it('reads one thread of a shared log with logMessageStore', async () => {
    const persistence = durablePersistence()
    const host = hostFor(persistence)
    const child = await host.open(
      harnessWith([() => text('child answer')]).harness,
      {
        threadId: 'task-1',
        logId: LOG,
      },
    )
    await child.send('child question')

    const messages = logMessageStore({
      store: persistence.stores.log,
      logId: LOG,
    })
    expect((await messages.loadThread('task-1')).map((m) => m.content)).toEqual(
      ['child question', 'child answer'],
    )
    expect(await messages.loadThread(LOG)).toEqual([])
    await host.close()
  })

  it('refuses a record whose thread field is not a string', async () => {
    const host = hostFor(durablePersistence())
    const root = await host.open(harnessWith([]).harness, {
      threadId: LOG,
    })

    await expect(
      root.append([{ type: 'app.signal', thread: 7 }]),
    ).rejects.toThrow('thread')
    await host.close()
  })
})
