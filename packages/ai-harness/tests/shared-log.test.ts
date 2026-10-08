import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logMessageStore } from '../src'
import { gate, messageTexts, mockAdapter, text, untilAborted } from './helpers'
import type { LogRecord, LogStore } from '@tanstack/ai-persistence'
import type { HarnessHost, ReduceOptions } from '../src'
import type { Reply } from './helpers'

const LOG = 'agent-1'

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

function hostFor(persistence: Durable) {
  return createHarnessHost({ persistence, reduce })
}

const harnessWith = (replies: Array<Reply>) => {
  const { adapter, calls } = mockAdapter(replies)
  return { harness: defineHarness({ name: 'test/shared', adapter }), calls }
}

const expireLease = (persistence: Durable, runId: string) =>
  persistence.stores.runs.update(runId, { leaseExpiresAt: Date.now() - 1 })

describe('sessions that share one log', () => {
  it('run turns at the same time and each rebuilds its own transcript after a crash', async () => {
    const persistence = durablePersistence()
    const release = gate()
    const host = hostFor(persistence)
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

    const rootTurn = root.prompt('root question', { inputId: 'root-1' })
    // The child answers while the root turn still waits.
    expect(await child.prompt('child question')).toEqual({
      text: 'child answer',
    })
    release.open()
    expect(await rootTurn).toEqual({ text: 'root answer' })
    const childTurn = child.prompt('second child question', {
      inputId: 'child-2',
    })
    await vi.waitFor(() => expect(childModel.calls).toHaveLength(2))
    await expireLease(persistence, childTurn.id)

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
    expect(await persistence.stores.log.read('task-1')).toEqual([])
    await host.close().catch(() => {})
    await next.close()
  })

  it('lands a child record and a parent record in one append, or neither', async () => {
    const inner = memoryLogStore()
    const log: LogStore = {
      append: (logId, seq, records) => inner.append(logId, seq, records),
      read: (logId, options) => inner.read(logId, options),
      subscribe: (logId, listener) => inner.subscribe(logId, listener),
    }
    const persistence = durablePersistence(log)
    const host = hostFor(persistence)
    const root = await host.open(harnessWith([]).harness, { threadId: LOG })
    const pair: Array<LogRecord> = [
      { type: 'app.child_created', thread: 'task-1', task: 'research' },
      { type: 'app.child_linked', child: 'task-1' },
    ]

    await root.append(pair)
    const types = async () =>
      (await inner.read(LOG)).map((entry) => entry.record.type)
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

  it('folds state writes from two sessions in log order, also after a rebuild', async () => {
    const persistence = durablePersistence()
    const host = hostFor(persistence)
    const root = await host.open(harnessWith([]).harness, { threadId: LOG })
    const child = await host.open(harnessWith([]).harness, {
      threadId: 'task-1',
      logId: LOG,
    })

    await root.append([{ type: 'app.state_write', name: 'plan', value: 'a' }])
    await child.append([{ type: 'app.state_write', name: 'plan', value: 'b' }])
    await root.append([{ type: 'app.state_write', name: 'done', value: true }])

    expect(host.logState(LOG)).toEqual({ plan: 'b', done: true })
    expectTypeOf(host).toExtend<HarnessHost>()
    expectTypeOf(
      createHarnessHost({ persistence: durablePersistence() }).logState('x'),
    ).toEqualTypeOf<undefined>()
    await host.close()
    const next = hostFor(persistence)
    await next.open(harnessWith([]).harness, { threadId: 'task-1', logId: LOG })
    expect(next.logState(LOG)).toEqual({ plan: 'b', done: true })
    expect(next.logState('another-log')).toBeUndefined()
    await next.close()
  })

  it('gives project only the records of its own session', async () => {
    const host = createHarnessHost({
      persistence: durablePersistence(),
      project: {
        record: ({ messages, record }) =>
          record.type === 'app.signal' && typeof record.text === 'string'
            ? [...messages, { role: 'user', content: record.text }]
            : undefined,
      },
    })
    const root = await host.open(harnessWith([]).harness, { threadId: LOG })
    const child = await host.open(harnessWith([]).harness, {
      threadId: 'task-1',
      logId: LOG,
    })
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

  it('stops both sessions of the log when another host writes to it', async () => {
    const persistence = durablePersistence()
    const host = hostFor(persistence)
    const root = await host.open(harnessWith([]).harness, { threadId: LOG })
    const child = await host.open(harnessWith([]).harness, {
      threadId: 'task-1',
      logId: LOG,
    })
    await root.append([{ type: 'app.signal' }])

    // Another writer takes the next position of the log.
    const written = await persistence.stores.log.read(LOG)
    await persistence.stores.log.append(LOG, written.length + 1, [
      { type: 'app.other' },
    ])

    await expect(root.append([{ type: 'app.signal' }])).rejects.toThrow(
      'Log conflict',
    )
    await expect(child.append([{ type: 'app.signal' }])).rejects.toThrow(
      'Log conflict',
    )

    // The host replaces a stopped session on the next open.
    await vi.waitFor(async () =>
      expect(
        await host.open(harnessWith([]).harness, { threadId: LOG }),
      ).not.toBe(root),
    )
    await vi.waitFor(async () =>
      expect(
        await host.open(harnessWith([]).harness, {
          threadId: 'task-1',
          logId: LOG,
        }),
      ).not.toBe(child),
    )
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

    expect(await root.prompt('are you there?')).toEqual({ text: 'still here' })
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
    await child.prompt('child question')

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
    const root = await host.open(harnessWith([]).harness, { threadId: LOG })

    await expect(
      root.append([{ type: 'app.signal', thread: 7 }]),
    ).rejects.toThrow('thread')
    await host.close()
  })
})
