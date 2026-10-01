import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import {
  LogConflictError,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  SharedLog,
  emptySharedLogState,
  engineMessageStore,
  loadLogState,
  logMessageStore,
  sessionMessageStore,
  sessionOf,
} from '../src/log'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type {
  LogRecord,
  LogStore,
  MetadataStore,
} from '@tanstack/ai-persistence'
import type { ProjectOptions, ReduceOptions } from '../src/log'
import type { SessionEvent } from '../src/types'

const THREAD = 't1'

function newWriter(
  store: LogStore,
  options: {
    coalesceMs?: number
    project?: ProjectOptions
    metadata?: MetadataStore
    onFailure?: (error: unknown) => void
    state?: ReturnType<typeof emptySharedLogState>
  } = {},
) {
  const log = new SharedLog({
    store,
    logId: THREAD,
    state: options.state ?? emptySharedLogState(),
    coalesceMs: options.coalesceMs ?? 0,
    ...(options.project ? { project: options.project } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  })
  return log.view(THREAD, options.onFailure ?? (() => {}))
}

/** The fold of the session `THREAD`. */
const loadSession = async (
  options: Omit<Parameters<typeof loadLogState>[0], 'logId'>,
) => sessionOf(await loadLogState({ ...options, logId: THREAD }), THREAD)

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
    expect((await loadSession({ store })).messages).toEqual([u1])
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

    const reloaded = await loadSession({ store, project })
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
    expect((await loadSession({ store })).messages).toEqual(expected)
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
    const state = await loadLogState({ store, logId: THREAD })
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
  it('stops a writer that sees another writer after it wrote', async () => {
    const store = memoryLogStore()
    const failures: Array<unknown> = []
    const first = newWriter(store, { onFailure: (e) => failures.push(e) })
    await first.append([{ type: 'app.mine' }])
    const state = await loadLogState({ store, logId: THREAD })
    const next = newWriter(store, { state })

    // The newer host writes. The first host is notified and stops.
    await next.append([{ type: 'app.newer' }])

    await expect.poll(() => failures.length).toBe(1)
    expect(failures[0]).toBeInstanceOf(LogConflictError)
    await expect(first.append([{ type: 'app.zombie' }])).rejects.toBeInstanceOf(
      LogConflictError,
    )
    expect((await records(store)).map((record) => record.type)).toEqual([
      'app.mine',
      'app.newer',
    ])
  })

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
    v: 2,
    seq: 1,
    version: 'v1',
    sessions: [
      [
        THREAD,
        {
          messages: [user('marker', 'from the checkpoint')],
          inputs: [],
          toolResults: [],
          steps: [],
        },
      ],
    ],
    reduced: null,
    ...overrides,
  })

  it('starts the fold from a valid checkpoint', async () => {
    const store = memoryLogStore()
    await seedLog(store)
    const { metadata } = memoryPersistence().stores
    await metadata.set(NAMESPACE, THREAD, checkpoint({}))

    const state = await loadSession({ store, metadata, project })

    // Record 2 folds on top of the checkpoint (keep 1, add u2).
    expect(state.messages).toEqual([
      user('marker', 'from the checkpoint'),
      user('u2', 'two'),
    ])
  })

  it.each([
    ['not an object', 'garbage'],
    ['another format', checkpoint({ v: 1 })],
    ['another projection version', checkpoint({ version: 'v0' })],
    ['a position past the end of the log', checkpoint({ seq: 99 })],
    ['a state that is not shaped', checkpoint({ sessions: 'x' })],
  ])('ignores a checkpoint with %s', async (_name, value) => {
    const store = memoryLogStore()
    await seedLog(store)
    const { metadata } = memoryPersistence().stores
    await metadata.set(NAMESPACE, THREAD, value)

    const state = await loadSession({ store, metadata, project })

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
      .toMatchObject({ v: 2, seq: 50, version: 'v1' })
  })

  /** Counts the host records of the log. */
  const countRecords: ReduceOptions<number> = {
    initial: 0,
    record: ({ state }) => state + 1,
  }

  it.each([
    ['no reduce fold', checkpoint({}), countRecords],
    [
      'another reduce version',
      checkpoint({ reduceVersion: 'r0' }),
      { ...countRecords, version: 'r1' },
    ],
  ])(
    'ignores a checkpoint with %s for a load with reduce',
    async (_name, value, reduce) => {
      const store = memoryLogStore()
      await store.append(THREAD, 1, [{ type: 'app.tick' }])
      await store.append(THREAD, 2, [{ type: 'app.tick' }])
      const { metadata } = memoryPersistence().stores
      await metadata.set(NAMESPACE, THREAD, value)

      const state = await loadLogState({
        store,
        logId: THREAD,
        metadata,
        project,
        reduce,
      })

      // The count includes record 1: the fold did not start at the checkpoint.
      expect(state.reduced).toBe(2)
    },
  )

  it('starts a reduce fold from the checkpoint that a shared log wrote', async () => {
    const store = memoryLogStore()
    const { metadata } = memoryPersistence().stores
    let calls = 0
    const reduce: ReduceOptions<number> = {
      initial: 0,
      record: ({ state }) => {
        calls += 1
        return state + 1
      },
    }
    const log = new SharedLog({
      store,
      logId: THREAD,
      state: emptySharedLogState(reduce),
      coalesceMs: 0,
      reduce,
      metadata,
    })
    const writer = log.view(THREAD, () => {})
    for (let index = 0; index < 50; index += 1) {
      await writer.append([{ type: 'app.tick', index }])
    }
    await expect
      .poll(() => metadata.get(NAMESPACE, THREAD))
      .toMatchObject({ seq: 50, reduceVersion: '' })
    calls = 0

    const state = await loadLogState({ store, logId: THREAD, metadata, reduce })

    expect(state.reduced).toBe(50)
    expect(state.reduced).toEqual(log.state.reduced)
    // The fold started at the checkpoint: no record folded again.
    expect(calls).toBe(0)
  })
})

describe('engine message store', () => {
  const toolCallMessage: ModelMessage = {
    id: 'a1',
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'check', arguments: '{}' },
      },
    ],
  }
  const toolResult: ModelMessage = {
    role: 'tool',
    toolCallId: 'call-1',
    content: 'checked',
  }
  const signal: ModelMessage = {
    role: 'user',
    content: '[signal] build failed',
  }

  async function engineOnLog() {
    const store = memoryLogStore()
    const writer = newWriter(store, { project })
    const engine = engineMessageStore({ writer, store, project })
    return { writer, engine }
  }

  it('puts a host message that arrives in a tool phase after the tool result', async () => {
    const { writer, engine } = await engineOnLog()
    const u1 = user('u1', 'go')
    await engine.loadThread(THREAD)
    // The engine saves before the first tool call of the phase.
    await engine.saveThread(THREAD, [u1, toolCallMessage])

    // During the tool call, a host record projects a user message.
    await writer.append([{ type: 'app.signal', text: '[signal] build failed' }])
    // At the end of the phase the engine saves again, still without the
    // result: the engine adds tool results after this hook.
    await engine.saveThread(THREAD, [u1, toolCallMessage])
    const forModel = await engine.beforeModel([u1, toolCallMessage, toolResult])

    const expected = [u1, toolCallMessage, toolResult, signal]
    expect(forModel).toEqual(expected)
    expect(writer.state.messages).toEqual(expected)
  })

  it('adds engine messages after a host rewrite of the fold', async () => {
    const { writer, engine } = await engineOnLog()
    await engine.loadThread(THREAD)
    await engine.saveThread(THREAD, [user('u1', 'one'), assistant('a1', 'two')])

    await writer.append([
      { type: 'app.compact', summary: 'Earlier: one, two.', firstKept: 2 },
    ])
    await engine.saveThread(THREAD, [
      user('u1', 'one'),
      assistant('a1', 'two'),
      user('u2', 'three'),
    ])

    expect(writer.state.messages).toEqual([
      { role: 'assistant', content: 'Earlier: one, two.' },
      user('u2', 'three'),
    ])
  })

  it('lets an engine save that changes older messages win', async () => {
    const { writer, engine } = await engineOnLog()
    await engine.loadThread(THREAD)
    await engine.saveThread(THREAD, [user('u1', 'one'), assistant('a1', 'two')])
    await writer.append([{ type: 'app.signal', text: '[signal] late' }])

    await engine.saveThread(THREAD, [assistant('s', 'engine summary')])

    expect(writer.state.messages).toEqual([assistant('s', 'engine summary')])
  })

  it('commits the engine list before a model call and changes it only for a host record', async () => {
    const { writer, engine } = await engineOnLog()
    await engine.loadThread(THREAD)
    await engine.saveThread(THREAD, [user('u1', 'one'), toolCallMessage])

    // No host record: the tool result is committed, and the engine keeps its list.
    expect(
      await engine.beforeModel([
        user('u1', 'one'),
        toolCallMessage,
        toolResult,
      ]),
    ).toBeUndefined()
    expect(writer.state.messages).toEqual([
      user('u1', 'one'),
      toolCallMessage,
      toolResult,
    ])

    await writer.append([{ type: 'app.signal', text: '[signal] build failed' }])

    expect(
      await engine.beforeModel([
        user('u1', 'one'),
        toolCallMessage,
        toolResult,
      ]),
    ).toEqual([user('u1', 'one'), toolCallMessage, toolResult, signal])
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

describe('a log shared by sessions', () => {
  const sharedWriter = (store: LogStore) => {
    const log = new SharedLog({
      store,
      logId: 'log-1',
      state: emptySharedLogState(),
      coalesceMs: 0,
    })
    return {
      log,
      root: log.view('log-1', () => {}),
      child: log.view('child', () => {}),
    }
  }

  it('writes no thread field for the log own session', async () => {
    const store = memoryLogStore()
    const { root } = sharedWriter(store)

    await root.append([{ type: 'app.note', text: 'one' }])

    expect((await store.read('log-1')).map((entry) => entry.record)).toEqual([
      { type: 'app.note', text: 'one' },
    ])
  })

  it('stamps the records of another session, and keeps a named thread', async () => {
    const store = memoryLogStore()
    const { root, child } = sharedWriter(store)

    await child.append([{ type: 'app.note', text: 'from the child' }])
    await root.append([
      { type: 'app.child_created', thread: 'child' },
      { type: 'app.child_linked', child: 'child' },
    ])

    expect((await store.read('log-1')).map((entry) => entry.record)).toEqual([
      { type: 'app.note', text: 'from the child', thread: 'child' },
      { type: 'app.child_created', thread: 'child' },
      { type: 'app.child_linked', child: 'child' },
    ])
  })

  it('folds each session on its own', async () => {
    const store = memoryLogStore()
    const { root, child } = sharedWriter(store)

    await root.commit({ messages: [user('r1', 'root message')] })
    await child.commit({ messages: [user('c1', 'child message')] })

    expect(root.state.messages).toEqual([user('r1', 'root message')])
    expect(child.state.messages).toEqual([user('c1', 'child message')])
    const state = await loadLogState({ store, logId: 'log-1' })
    expect(sessionOf(state, 'child').messages).toEqual([
      user('c1', 'child message'),
    ])
  })

  it('folds every host record of the log with reduce, in log order', async () => {
    const store = memoryLogStore()
    const reduce = {
      initial: {} as Record<string, unknown>,
      record: ({
        state,
        record,
      }: {
        state: Record<string, unknown>
        record: LogRecord
      }) =>
        record.type === 'app.state_write' && typeof record.name === 'string'
          ? { ...state, [record.name]: record.value }
          : state,
    }
    const log = new SharedLog({
      store,
      logId: 'log-1',
      state: emptySharedLogState(reduce),
      coalesceMs: 0,
      reduce,
    })
    const root = log.view('log-1', () => {})
    const child = log.view('child', () => {})

    await root.append([{ type: 'app.state_write', name: 'x', value: 1 }])
    await child.append([{ type: 'app.state_write', name: 'x', value: 2 }])

    expect(log.state.reduced).toEqual({ x: 2 })
    expect(
      (await loadLogState({ store, logId: 'log-1', reduce })).reduced,
    ).toEqual({
      x: 2,
    })
  })

  it('reads only the events of its own session', async () => {
    const store = memoryLogStore()
    const { root, child } = sharedWriter(store)
    const chunk = (delta: string): StreamChunk => ({
      type: EventType.CUSTOM,
      name: 'app.ping',
      value: { delta },
      timestamp: 1,
    })

    root.publish('op-root', chunk('root'))
    child.publish('op-child', chunk('child'))
    await root.flush()
    child.close()

    const seen: Array<string> = []
    for await (const entry of child.read({})) seen.push(entry.operationId)
    expect(seen).toEqual(['op-child'])
  })

  it('closes after the last view closes, and opens no view after that', () => {
    const { log, root, child } = sharedWriter(memoryLogStore())

    root.close()
    expect(log.isOpen).toBe(true)
    child.close()

    expect(log.isOpen).toBe(false)
    expect(() => log.view('log-1', () => {})).toThrow(
      'The log "log-1" is closed.',
    )
  })

  it('stops every view and closes when another writer appends', async () => {
    const store = memoryLogStore()
    const onIdle = vi.fn()
    const log = new SharedLog({
      store,
      logId: 'log-1',
      state: emptySharedLogState(),
      coalesceMs: 0,
      onIdle,
    })
    const rootFailure = vi.fn()
    const childFailure = vi.fn()
    const root = log.view('log-1', rootFailure)
    const child = log.view('child', childFailure)
    await root.append([{ type: 'app.mine' }])

    // Another writer takes the next position.
    await store.append('log-1', 2, [{ type: 'app.other' }])
    await expect(root.append([{ type: 'app.late' }])).rejects.toBeInstanceOf(
      LogConflictError,
    )

    expect(rootFailure).toHaveBeenCalledTimes(1)
    expect(childFailure).toHaveBeenCalledTimes(1)
    expect(onIdle).toHaveBeenCalled()
    expect(log.isOpen).toBe(false)
    await expect(root.append([{ type: 'app.x' }])).rejects.toBeInstanceOf(
      LogConflictError,
    )
    await expect(child.append([{ type: 'app.x' }])).rejects.toBeInstanceOf(
      LogConflictError,
    )
  })

  it('opens one view per thread at a time', async () => {
    const store = memoryLogStore()
    const { log, root } = sharedWriter(store)

    expect(() => log.view('log-1', () => {})).toThrow(
      'The thread "log-1" already has an open session on this log.',
    )
    root.close()

    // The child view keeps the log open, so the thread opens again.
    const again = log.view('log-1', () => {})
    await again.append([{ type: 'app.note' }])
    expect(await records(store, 'log-1')).toEqual([{ type: 'app.note' }])
  })

  it('drops the staged records of a closed view', async () => {
    const store = memoryLogStore()
    // The root view keeps the log open.
    const { log, child } = sharedWriter(store)

    child.stage([{ type: 'app.x' }])
    child.close()
    const next = log.view('child', () => {})
    await next.commit({ messages: [user('c1', 'hi')] })

    expect(
      (await records(store, 'log-1')).map((record) => record.type),
    ).toEqual(['harness.transcript'])
  })
})
