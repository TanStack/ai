import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import {
  LogConflictError,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  LogWriter,
  emptyLogState,
  loadLogState,
  logMessageStore,
  sessionMessageStore,
} from '../src/log'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type {
  LogRecord,
  LogStore,
  MetadataStore,
} from '@tanstack/ai-persistence'
import type { ProjectOptions } from '../src/log'
import type { SessionEvent } from '../src/types'

const THREAD = 't1'

function newWriter(
  store: LogStore,
  options: {
    coalesceMs?: number
    project?: ProjectOptions
    metadata?: MetadataStore
    onFailure?: (error: unknown) => void
    state?: ReturnType<typeof emptyLogState>
  } = {},
) {
  return new LogWriter({
    store,
    threadId: THREAD,
    state: options.state ?? emptyLogState(),
    coalesceMs: options.coalesceMs ?? 0,
    onFailure: options.onFailure ?? (() => {}),
    ...(options.project ? { project: options.project } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  })
}

/** A store that records the record types of each append batch. */
function recordingStore(inner: LogStore = memoryLogStore()) {
  const batches: Array<Array<string>> = []
  const store: LogStore = {
    append: async (threadId, seq, records) => {
      await inner.append(threadId, seq, records)
      batches.push(records.map((record) => record.type))
    },
    read: (threadId, options) => inner.read(threadId, options),
    subscribe: (threadId, listener) => inner.subscribe(threadId, listener),
  }
  return { store, batches }
}

/** A view of `inner` that never notifies, like a store in another process. */
function silentStore(inner: LogStore): LogStore {
  return {
    append: (threadId, seq, records) => inner.append(threadId, seq, records),
    read: (threadId, options) => inner.read(threadId, options),
    subscribe: () => () => {},
  }
}

const records = async (store: LogStore, threadId = THREAD) =>
  (await store.read(threadId)).map((entry) => entry.record)

const user = (id: string, content: string): ModelMessage => ({
  id,
  role: 'user',
  content,
})
const assistant = (id: string, content: string): ModelMessage => ({
  id,
  role: 'assistant',
  content,
})

const textStart = (messageId: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_START,
  messageId,
  role: 'assistant',
  timestamp: 1,
})
const textDelta = (messageId: string, delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId,
  delta,
  timestamp: 2,
})
const textEnd = (messageId: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_END,
  messageId,
  timestamp: 3,
})

/** Signals become user messages. A compaction keeps a summary and a tail. */
const project: ProjectOptions = {
  version: 'v1',
  record: ({ messages, record }) => {
    if (record.type === 'app.signal' && typeof record.text === 'string') {
      return [...messages, { role: 'user', content: record.text }]
    }
    if (
      record.type === 'app.compact' &&
      typeof record.summary === 'string' &&
      typeof record.firstKept === 'number'
    ) {
      return [
        { role: 'assistant', content: record.summary },
        ...messages.slice(record.firstKept),
      ]
    }
    return undefined
  },
}

describe('transcript fold', () => {
  it('writes each change as one splice record and folds it back', async () => {
    const store = memoryLogStore()
    const writer = newWriter(store)
    const u1 = user('u1', 'hi')
    const a1 = assistant('a1', 'hello')

    await writer.commit({ messages: [u1, a1] })
    await writer.commit({ messages: [u1, a1, user('u2', 'more')] })
    await writer.commit({ messages: [u1, assistant('x', 'edited')] })
    await writer.commit({ messages: [u1] })
    // No change: no record.
    await writer.commit({ messages: [u1] })

    expect(await records(store)).toEqual([
      { type: 'harness.transcript', keep: 0, add: [u1, a1] },
      { type: 'harness.transcript', keep: 2, add: [user('u2', 'more')] },
      { type: 'harness.transcript', keep: 1, add: [assistant('x', 'edited')] },
      { type: 'harness.transcript', keep: 1, add: [] },
    ])
    expect(writer.state.messages).toEqual([u1])
    expect((await loadLogState({ store, threadId: THREAD })).messages).toEqual([
      u1,
    ])
  })

  it('folds host records through the projection, live and after a reload', async () => {
    const store = memoryLogStore()
    const writer = newWriter(store, { project })
    const u1 = user('u1', 'hi')
    const a1 = assistant('a1', 'hello')
    await writer.commit({ messages: [u1, a1] })

    await writer.append([{ type: 'app.signal', text: 'ping' }])
    expect(writer.state.messages).toEqual([
      u1,
      a1,
      { role: 'user', content: 'ping' },
    ])

    await writer.append([
      { type: 'app.compact', summary: 'Earlier: greetings.', firstKept: 2 },
    ])
    const compacted = [
      { role: 'assistant', content: 'Earlier: greetings.' },
      { role: 'user', content: 'ping' },
    ]
    expect(writer.state.messages).toEqual(compacted)

    // The next save adds only its new message. The projected messages are
    // not written twice.
    const a2 = assistant('a2', 'pong')
    await writer.commit({ messages: [...writer.state.messages, a2] })
    expect((await records(store)).at(-1)).toEqual({
      type: 'harness.transcript',
      keep: 2,
      add: [a2],
    })

    const reloaded = await loadLogState({ store, threadId: THREAD, project })
    expect(reloaded.messages).toEqual([...compacted, a2])
  })

  it('keeps live state equal to reloaded state for values that are not JSON', async () => {
    const store = memoryLogStore()
    const writer = newWriter(store)
    const createdAt = new Date('2026-09-30T10:00:00.000Z')

    await writer.commit({
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'hi',
          createdAt,
          metadata: { dropped: undefined },
        },
      ],
    })

    const expected = [
      { id: 'u1', role: 'user', content: 'hi', createdAt, metadata: {} },
    ]
    expect(writer.state.messages).toEqual(expected)
    expect((await loadLogState({ store, threadId: THREAD })).messages).toEqual(
      expected,
    )
  })
})

describe('events and batches', () => {
  it('merges adjacent deltas and flushes at a boundary', async () => {
    const store = memoryLogStore()
    // A long window: only the boundary can flush in time.
    const writer = newWriter(store, { coalesceMs: 60_000 })

    writer.publish('op-1', textStart('m1'))
    writer.publish('op-1', textDelta('m1', 'a'))
    writer.publish('op-1', textDelta('m1', 'b'))
    writer.publish('op-1', textDelta('m2', 'other message'))
    writer.publish('op-1', textDelta('m2', ' again'))
    writer.publish('op-1', textEnd('m1'))
    await writer.flush()

    const events = (await records(store)).map((record) => record.event)
    expect(events).toEqual([
      textStart('m1'),
      textDelta('m1', 'ab'),
      textDelta('m2', 'other message again'),
      textEnd('m1'),
    ])
  })

  it('puts host records in the same batch as the pending events, in order', async () => {
    const { store, batches } = recordingStore()
    const writer = newWriter(store, { coalesceMs: 60_000 })

    writer.publish('op-1', textDelta('m1', 'streaming'))
    await writer.append([{ type: 'app.state_write', name: 'x', value: 1 }])

    expect(batches).toEqual([['harness.event', 'app.state_write']])
  })

  it('writes concurrent appends in order, with no gap', async () => {
    const store = memoryLogStore()
    const failures: Array<unknown> = []
    const writer = newWriter(store, { onFailure: (e) => failures.push(e) })

    writer.publish('op-1', textStart('m1'))
    await Promise.all([
      writer.append([{ type: 'app.a' }]),
      writer.append([{ type: 'app.b' }]),
      writer.commit({ messages: [user('u1', 'hi')] }),
      writer.flush(),
    ])

    const entries = await store.read(THREAD)
    expect(entries.map((entry) => [entry.seq, entry.record.type])).toEqual([
      [1, 'harness.event'],
      [2, 'app.a'],
      [3, 'app.b'],
      [4, 'harness.transcript'],
    ])
    expect(failures).toEqual([])
    expect(writer.state.seq).toBe(4)
  })

  it('reads events after a cursor from the store, then live', async () => {
    const store = memoryLogStore()
    const first = newWriter(store)
    first.publish('op-a', textStart('m1'))
    first.publish('op-b', textStart('m2'))
    first.publish('op-a', textEnd('m1'))
    await first.flush()
    first.close()

    // A new session: the first events are only in the store.
    const state = await loadLogState({ store, threadId: THREAD })
    const writer = newWriter(store, { state })
    let done = false
    const seen: Array<SessionEvent> = []
    const reading = (async () => {
      for await (const entry of writer.read({
        from: '1',
        filter: (item) => item.operationId === 'op-a',
        until: () => done,
      })) {
        seen.push(entry)
      }
    })()
    writer.publish('op-a', textStart('m3'))
    await writer.flush()
    done = true
    writer.publish('op-a', textEnd('m3'))
    await writer.flush()
    await reading

    expect(seen.map((entry) => [entry.cursor, entry.event])).toEqual([
      ['3', textEnd('m1')],
      ['4', textStart('m3')],
      ['5', textEnd('m3')],
    ])
  })

  it('folds records that another writer appends to the same store', async () => {
    const store = memoryLogStore()
    const reader = newWriter(store)
    const other = newWriter(silentStore(store))

    other.publish('op-1', textStart('m1'))
    await other.flush()
    await other.commit({ messages: [user('u1', 'from the other host')] })

    await expect.poll(() => reader.state.seq).toBe(2)
    expect(reader.state.messages).toEqual([user('u1', 'from the other host')])
  })
})

describe('write failures', () => {
  it('calls onFailure on a conflict and rejects every later write', async () => {
    const store = memoryLogStore()
    const failures: Array<unknown> = []
    const stale = newWriter(silentStore(store), {
      onFailure: (error) => failures.push(error),
    })
    await store.append(THREAD, 1, [{ type: 'app.from-another-host' }])

    await expect(stale.append([{ type: 'app.late' }])).rejects.toBeInstanceOf(
      LogConflictError,
    )
    await expect(stale.append([{ type: 'app.later' }])).rejects.toBeInstanceOf(
      LogConflictError,
    )
    expect(failures).toHaveLength(1)
    expect((await records(store)).map((record) => record.type)).toEqual([
      'app.from-another-host',
    ])
  })

  it('counts a batch that landed before an error as written', async () => {
    const inner = memoryLogStore()
    let calls = 0
    const flaky: LogStore = {
      ...silentStore(inner),
      append: async (threadId, seq, batch) => {
        calls += 1
        await inner.append(threadId, seq, batch)
        if (calls === 1) throw new Error('timeout after the write')
      },
    }
    const writer = newWriter(flaky)

    await writer.append([{ type: 'app.one' }])
    await writer.append([{ type: 'app.two' }])

    expect((await records(inner)).map((record) => record.type)).toEqual([
      'app.one',
      'app.two',
    ])
    expect(calls).toBe(2)
  })

  it('tries once more after a store error, then fails with that error', async () => {
    let calls = 0
    const down: LogStore = {
      ...silentStore(memoryLogStore()),
      append: async () => {
        calls += 1
        throw new Error('network down')
      },
    }
    const failures: Array<unknown> = []
    const writer = newWriter(down, { onFailure: (e) => failures.push(e) })

    await expect(writer.append([{ type: 'app.one' }])).rejects.toThrow(
      'network down',
    )
    await expect(writer.append([{ type: 'app.two' }])).rejects.toThrow(
      'network down',
    )
    expect(calls).toBe(2)
    expect(failures).toHaveLength(1)
  })
})

describe('fold checkpoints', () => {
  const NAMESPACE = 'harness:log-checkpoint'

  async function seedLog(store: LogStore) {
    const writer = newWriter(store)
    await writer.commit({ messages: [user('u1', 'one')] })
    await writer.commit({ messages: [user('u1', 'one'), user('u2', 'two')] })
    writer.close()
  }

  const checkpoint = (overrides: Record<string, unknown>) => ({
    v: 1,
    seq: 1,
    version: 'v1',
    state: {
      messages: [user('marker', 'from the checkpoint')],
      inputs: [],
      toolResults: [],
      steps: [],
    },
    ...overrides,
  })

  it('starts the fold from a valid checkpoint', async () => {
    const store = memoryLogStore()
    await seedLog(store)
    const { metadata } = memoryPersistence().stores
    await metadata.set(NAMESPACE, THREAD, checkpoint({}))

    const state = await loadLogState({
      store,
      threadId: THREAD,
      metadata,
      project,
    })

    // Record 2 folds on top of the checkpoint (keep 1, add u2).
    expect(state.messages).toEqual([
      user('marker', 'from the checkpoint'),
      user('u2', 'two'),
    ])
  })

  it.each([
    ['not an object', 'garbage'],
    ['another format', checkpoint({ v: 2 })],
    ['another projection version', checkpoint({ version: 'v0' })],
    ['a position past the end of the log', checkpoint({ seq: 99 })],
    ['a state that is not shaped', checkpoint({ state: { messages: 'x' } })],
  ])('ignores a checkpoint with %s', async (_name, value) => {
    const store = memoryLogStore()
    await seedLog(store)
    const { metadata } = memoryPersistence().stores
    await metadata.set(NAMESPACE, THREAD, value)

    const state = await loadLogState({
      store,
      threadId: THREAD,
      metadata,
      project,
    })

    expect(state.messages).toEqual([user('u1', 'one'), user('u2', 'two')])
  })

  it('writes a checkpoint every 50 appends', async () => {
    const store = memoryLogStore()
    const { metadata } = memoryPersistence().stores
    const writer = newWriter(store, { metadata, project })

    for (let index = 0; index < 50; index += 1) {
      await writer.append([{ type: 'app.tick', index }])
    }

    await expect
      .poll(() => metadata.get(NAMESPACE, THREAD))
      .toMatchObject({ v: 1, seq: 50, version: 'v1' })
  })
})

describe('message stores', () => {
  it('logMessageStore writes a change as one record and reads the fold', async () => {
    const store = memoryLogStore()
    const messages = logMessageStore({ store })
    const u1 = user('u1', 'hi')
    const a1 = assistant('a1', 'hello')

    await messages.saveThread('t9', [u1])
    await messages.saveThread('t9', [u1, a1])

    expect(await messages.loadThread('t9')).toEqual([u1, a1])
    expect(await records(store, 't9')).toEqual([
      { type: 'harness.transcript', keep: 0, add: [u1] },
      { type: 'harness.transcript', keep: 1, add: [a1] },
    ])
  })

  it('logMessageStore reloads and tries once more after a conflict', async () => {
    const inner = memoryLogStore()
    let raced = false
    const racing: LogStore = {
      ...silentStore(inner),
      append: async (threadId, seq, batch) => {
        if (!raced) {
          raced = true
          // Another writer takes the position first.
          await inner.append(threadId, seq, [{ type: 'app.other' }])
        }
        await inner.append(threadId, seq, batch)
      },
    }

    await logMessageStore({ store: racing }).saveThread('t9', [
      user('u1', 'hi'),
    ])

    expect((await records(inner, 't9')).map((record) => record.type)).toEqual([
      'app.other',
      'harness.transcript',
    ])
  })

  it('sessionMessageStore uses the writer for its thread and the log for others', async () => {
    const store = memoryLogStore()
    const writer = newWriter(store)
    const messages = sessionMessageStore({ writer, store })

    await messages.saveThread(THREAD, [user('u1', 'main')])
    await messages.saveThread('subagent:1', [user('c1', 'child')])

    expect(writer.state.messages).toEqual([user('u1', 'main')])
    expect(await messages.loadThread(THREAD)).toEqual([user('u1', 'main')])
    expect(await messages.loadThread('subagent:1')).toEqual([
      user('c1', 'child'),
    ])
    const child: Array<LogRecord> = await records(store, 'subagent:1')
    expect(child).toHaveLength(1)
  })
})
