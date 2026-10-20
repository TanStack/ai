import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import {
  LogConflictError,
  LogTruncatedError,
  OwnershipLostError,
  NO_OWNER_EPOCH,
  memoryLogStore,
} from '@tanstack/ai-persistence'
import {
  LogVersionError,
  SNAPSHOT_VERSION,
  SharedLog,
  commonPrefix,
  emptyLogState,
  emptySharedLogState,
  engineMessageStore,
  foldEntry,
  loadLogState,
  logIdOf,
  logMessageStore,
  sessionMessageStore,
  sessionOf,
} from '../src/log'
import { HostOwnership, LogOwnedElsewhereError } from '../src/ownership'
import { CRASHING_OWNERSHIP, wrapLogStore, writeAsOtherHost } from './helpers'
import { HARNESS_EVENTS } from '../src/types'
import { emptyUsage } from '../src/usage'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { LogRecord, LogSnapshot, LogStore } from '@tanstack/ai-persistence'
import type {
  LogRecordRetention,
  LogViewHooks,
  ProjectOptions,
  ReduceOptions,
  SnapshotTiming,
} from '../src/log'
import type { OwnershipOptions } from '../src/ownership'
import type { SessionEvent } from '../src/types'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })
/** The tail of a test log: room for every event of a test. */
const EVENT_BYTES = 1_000_000
/** The harness name in the ownership records. */
const HARNESS = 'test-harness'

let hosts = 0
/** The host of each store: the writers of one store object are one host. */
const hostsByStore = new WeakMap<LogStore, HostOwnership>()
/**
 * The ownership of the host of `store`. With `timing`, a new host. A wrapped
 * store (`silentStore`) is another object, so its writers are another host.
 */
function hostOwnership(store: LogStore, timing?: OwnershipOptions) {
  const known = timing ? undefined : hostsByStore.get(store)
  if (known) return known
  const ownership = new HostOwnership({
    store,
    ownerId: `host-${(hosts += 1)}`,
    ...(timing ? { timing } : {}),
  })
  if (!timing) hostsByStore.set(store, ownership)
  return ownership
}

/**
 * The hooks of a view. By default its session has no work, so the host gives
 * the log back after each write.
 */
function hooksOf(options: Partial<LogViewHooks> = {}): LogViewHooks {
  return {
    onFailure: options.onFailure ?? (() => {}),
    onLost: options.onLost ?? (() => {}),
    isBusy: options.isBusy ?? (() => false),
    onOffers: options.onOffers ?? (() => {}),
  }
}

function newWriter(
  store: LogStore,
  options: {
    coalesceMs?: number
    eventBytes?: number
    project?: ProjectOptions
    snapshot?: SnapshotTiming
    logRecords?: LogRecordRetention
    isBusy?: () => boolean
    onFailure?: (error: unknown) => void
    state?: ReturnType<typeof emptySharedLogState>
  } = {},
) {
  const log = new SharedLog({
    store,
    ownership: hostOwnership(store),
    harness: HARNESS,
    logId: LOG,
    rootThread: THREAD,
    state: options.state ?? emptySharedLogState(),
    coalesceMs: options.coalesceMs ?? 0,
    eventBytes: options.eventBytes ?? EVENT_BYTES,
    ...(options.project ? { project: options.project } : {}),
    ...(options.snapshot ? { snapshot: options.snapshot } : {}),
    ...(options.logRecords ? { logRecords: options.logRecords } : {}),
  })
  return log.view(
    THREAD,
    hooksOf({ onFailure: options.onFailure, isBusy: options.isBusy }),
  )
}

/** The fold of the session `THREAD`. */
const loadSession = async (
  options: Omit<Parameters<typeof loadLogState>[0], 'logId' | 'rootThread'>,
) =>
  sessionOf(
    await loadLogState({ ...options, logId: LOG, rootThread: THREAD }),
    THREAD,
  )

/** A store that records the record types of each append batch. */
function recordingStore(inner: LogStore = memoryLogStore()) {
  const batches: Array<Array<string>> = []
  const store = wrapLogStore(inner, {
    append: async (batch) => {
      await inner.append(batch)
      batches.push(batch.records.map((record) => record.type))
    },
  })
  return { store, batches }
}

/** A view of `inner` that never notifies, like a store in another process. */
function silentStore(inner: LogStore) {
  return wrapLogStore(inner, { subscribe: () => () => {} })
}

const records = async (store: LogStore, logId = LOG) =>
  (await store.read({ logId })).map((entry) => entry.record)

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

describe('commonPrefix', () => {
  it('counts the same and the equal messages, and does not stringify the same object', () => {
    const toJSON = vi.fn(() => ({ role: 'user', content: 'hi' }))
    const shared: ModelMessage = { role: 'user', content: 'hi' }
    Object.assign(shared, { toJSON })
    const a: Array<ModelMessage> = [
      shared,
      { role: 'assistant', content: 'yes' },
      { role: 'user', content: 'one' },
    ]
    const b: Array<ModelMessage> = [
      shared,
      { role: 'assistant', content: 'yes' },
      { role: 'user', content: 'two' },
    ]

    expect(commonPrefix(a, b)).toBe(2)
    expect(commonPrefix(a, a.slice(0, 1))).toBe(1)
    expect(commonPrefix([], b)).toBe(0)
    expect(toJSON).not.toHaveBeenCalled()
  })
})

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

describe('fold robustness', () => {
  it('skips a host record whose projection throws, live and after a reload', async () => {
    const store = memoryLogStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const throwing: ProjectOptions = {
      version: 'v1',
      record: ({ messages, record }) => {
        if (record.type === 'app.bad') throw new Error('bad record')
        return project.record({ messages, record })
      },
    }
    const writer = newWriter(store, { project: throwing })

    await writer.append([
      { type: 'app.bad' },
      { type: 'app.signal', text: 'after' },
    ])
    await writer.append([{ type: 'app.signal', text: 'later' }])

    expect(writer.state.seq).toBe(3)
    expect(writer.state.messages.map((message) => message.content)).toEqual([
      'after',
      'later',
    ])
    const reloaded = await loadSession({ store, project: throwing })
    expect(reloaded.messages).toEqual(writer.state.messages)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('folds every page of a store that returns short pages', async () => {
    const inner = memoryLogStore()
    const capped = wrapLogStore(silentStore(inner), {
      read: (query) =>
        inner.read({ ...query, limit: Math.min(query.limit ?? 2, 2) }),
    })
    for (let seq = 1; seq <= 5; seq += 1) {
      await inner.append({
        logId: LOG,
        seq,
        epoch: NO_OWNER_EPOCH,
        records: [{ type: 'app.signal', text: `s${seq}` }],
      })
    }

    const state = await loadSession({ store: capped, project })

    expect(state.seq).toBe(5)
    expect(state.messages).toHaveLength(5)
  })
})

describe('kept host records', () => {
  it('keeps the last records of each type that keep names, and no other', () => {
    const state = emptyLogState()
    const keep = new Map([['app.step', 2]])
    const records = [
      { type: 'app.step', n: 1 },
      { type: 'app.other' },
      { type: 'app.step', n: 2 },
      { type: 'app.step', n: 3 },
    ]
    records.forEach((record, index) =>
      foldEntry(state, { seq: index + 1, record }, undefined, keep),
    )

    expect(state.keptRecords.map((entry) => entry.record)).toEqual([
      { type: 'app.step', n: 2 },
      { type: 'app.step', n: 3 },
    ])
  })
})

describe('tool call records', () => {
  const result = (toolCallId: string): LogRecord => ({
    type: 'harness.tool.result',
    toolCallId,
    message: { role: 'tool', toolCallId, content: 'ok' },
  })
  /** A turn that called `pay` as `call-1`, with the call's result. */
  const paid: Array<ModelMessage> = [
    user('u1', 'pay'),
    {
      id: 'a1',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'pay', arguments: '{}' },
        },
      ],
    },
    { role: 'tool', toolCallId: 'call-1', content: 'ok' },
  ]

  it('appends the staged records of a call with its result, not with another commit', async () => {
    const { store, batches } = recordingStore()
    const writer = newWriter(store)

    writer.stage([{ type: 'app.charged' }], 'call-1')
    await writer.commit({ messages: [user('u1', 'hi')] })
    await writer.append([result('call-1')])

    expect(batches).toEqual([
      ['harness.transcript'],
      ['app.charged', 'harness.tool.result'],
    ])
  })

  it('forgets the result, start, and steps of a call once its result is in the transcript', async () => {
    const writer = newWriter(memoryLogStore())
    await writer.append([
      {
        type: 'harness.tool.started',
        toolCallId: 'call-1',
        name: 'pay',
        replay: 'safe',
      },
      {
        type: 'harness.tool.step',
        toolCallId: 'call-1',
        name: 'charge',
        value: 'c-1',
      },
      result('call-1'),
    ])
    expect(writer.state.toolResults.size).toBe(1)

    await writer.commit({ messages: paid })

    expect(writer.state.toolResults.size).toBe(0)
    expect(writer.state.started.size).toBe(0)
    expect(writer.state.steps.size).toBe(0)
  })

  it('appends what a call stages after its result is in the transcript with the next commit, and keeps no key for it', async () => {
    const { store, batches } = recordingStore()
    const log = new SharedLog({
      store,
      ownership: hostOwnership(store),
      harness: HARNESS,
      logId: LOG,
      rootThread: THREAD,
      state: emptySharedLogState(),
      coalesceMs: 0,
      eventBytes: EVENT_BYTES,
    })
    const writer = log.view(THREAD, hooksOf())
    await writer.append([result('call-1')])
    await writer.commit({ messages: paid })

    // A background job of the call stages a record after that.
    writer.stage([{ type: 'app.late' }], 'call-1')
    await writer.commit({ messages: [...paid, user('u2', 'next')] })

    expect(batches).toEqual([
      ['harness.tool.result'],
      ['harness.transcript'],
      ['harness.transcript', 'app.late'],
    ])
    // The set of calls that wait for a commit has no public read.
    const resulted: unknown = Reflect.get(log, 'resulted')
    expect(resulted).toEqual(new Set())
  })
})

describe('the event tail', () => {
  const custom = (name: string): StreamChunk => ({
    type: EventType.CUSTOM,
    name,
    value: {},
    timestamp: 0,
  })

  it('keeps eventBytes of events in memory, and reads older ones from the store', async () => {
    const inner = memoryLogStore()
    let reads = 0
    const store = wrapLogStore(inner, {
      read: (options) => {
        reads += 1
        return inner.read(options)
      },
    })
    const size = JSON.stringify(custom('e1')).length
    const writer = newWriter(store, { eventBytes: size * 2 })
    for (const name of ['e1', 'e2', 'e3', 'e4']) {
      writer.publish('op-1', custom(name))
    }
    await writer.flush()
    reads = 0
    const namesFrom = async (from: string) => {
      const names: Array<string> = []
      for await (const { event } of writer.read({ from, until: () => true })) {
        names.push(event.type === EventType.CUSTOM ? event.name : '')
      }
      return names
    }

    // Events 3 and 4 are in memory. Events 1 and 2 come from the store.
    expect(await namesFrom('0')).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(reads).toBe(1)
    expect(await namesFrom('2')).toEqual(['e3', 'e4'])
    expect(reads).toBe(1)
  })
})

describe('input fold', () => {
  it('keeps the newest retry count of an input', async () => {
    const store = memoryLogStore()
    const retry = (retries: number): LogRecord => ({
      type: 'harness.turn.retry',
      inputId: 'in-1',
      operationId: 'op-1',
      retries,
    })
    await store.append({
      logId: LOG,
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records: [
        {
          type: 'harness.input',
          inputId: 'in-1',
          input: { op: 'prompt', message: 'go' },
          at: 1,
        },
      ],
    })
    expect((await loadSession({ store })).inputs.get('in-1')?.retries).toBe(
      undefined,
    )

    await store.append({
      logId: LOG,
      seq: 2,
      epoch: NO_OWNER_EPOCH,
      records: [retry(1), retry(2)],
    })
    expect((await loadSession({ store })).inputs.get('in-1')?.retries).toBe(2)
    await store.append({
      logId: LOG,
      seq: 4,
      epoch: NO_OWNER_EPOCH,
      records: [retry(0)],
    })
    expect((await loadSession({ store })).inputs.get('in-1')?.retries).toBe(0)
  })
})

describe('a closed view', () => {
  it('writes nothing more, also when its thread opens again', async () => {
    const store = memoryLogStore()
    const log = new SharedLog({
      store,
      ownership: hostOwnership(store),
      harness: HARNESS,
      logId: LOG,
      rootThread: THREAD,
      state: emptySharedLogState(),
      coalesceMs: 0,
      eventBytes: EVENT_BYTES,
    })
    const closed = log.view('a', hooksOf())
    // Another session keeps the log open.
    log.view('b', hooksOf())

    closed.close()
    closed.publish('op-1', textStart('m1'))
    closed.stage([{ type: 'app.staged' }])
    await closed.append([{ type: 'app.late' }])
    await closed.commit({ messages: [user('u0', 'late')] })
    await log.view('a', hooksOf()).commit({ messages: [user('u1', 'hi')] })

    expect(await records(store)).toEqual([
      {
        type: 'harness.transcript',
        keep: 0,
        add: [user('u1', 'hi')],
        thread: 'a',
      },
    ])
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

    const entries = await store.read({ logId: LOG })
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
    // The log goes back before the next session of this host opens it.
    await first.rest()
    first.close()

    // A new session: the first events are only in the store.
    const state = await loadLogState({ store, logId: LOG, rootThread: THREAD })
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
  it('lets a writer whose log another host took read on, and write again once its work ended', async () => {
    const store = memoryLogStore()
    const failures: Array<unknown> = []
    const lost: Array<unknown> = []
    // A busy session that holds the log for 20 ms and does not renew it in
    // the test: a host that pauses.
    const first = new SharedLog({
      store,
      ownership: hostOwnership(store, {
        ...CRASHING_OWNERSHIP,
        expiresAfterMs: 20,
      }),
      harness: HARNESS,
      logId: LOG,
      rootThread: THREAD,
      state: emptySharedLogState(),
      coalesceMs: 0,
      eventBytes: EVENT_BYTES,
    }).view(
      THREAD,
      hooksOf({
        onFailure: (error) => failures.push(error),
        onLost: (error) => lost.push(error),
        isBusy: () => true,
      }),
    )
    await first.append([{ type: 'app.mine' }])
    expect(first.epoch).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 30))

    // Another host takes the expired log and writes.
    await writeAsOtherHost(store, LOG, (epoch) =>
      store.append({
        logId: LOG,
        seq: 2,
        epoch,
        records: [{ type: 'app.newer' }],
      }),
    )

    await expect.poll(() => lost.length).toBe(1)
    expect(lost[0]).toBeInstanceOf(OwnershipLostError)
    expect(failures).toEqual([])
    expect(first.state.seq).toBe(2)
    expect(first.epoch).toBe(NO_OWNER_EPOCH)
    expect(first.fenced).toBe(true)
    await expect(first.append([{ type: 'app.zombie' }])).rejects.toBeInstanceOf(
      LogOwnedElsewhereError,
    )
    // The work of the session ended: the next write acquires the log again.
    first.unfence()
    await first.append([{ type: 'app.again' }])
    expect(first.epoch).toBe(3)
    expect((await records(store)).map((record) => record.type)).toEqual([
      'app.mine',
      'app.newer',
      'app.again',
    ])
  })

  it('refuses a write while another live host owns the log, and still reads', async () => {
    const store = memoryLogStore()
    const failures: Array<unknown> = []
    const writer = newWriter(store, { onFailure: (e) => failures.push(e) })
    const other = await store.acquireOwnership({
      logId: LOG,
      harness: HARNESS,
      ownerId: 'other-host',
      ttlMs: 60_000,
    })
    if (other === null) throw new Error('The other host has no ownership.')
    await store.append({
      logId: LOG,
      seq: 1,
      epoch: other.epoch,
      records: [{ type: 'app.other' }],
    })

    await expect(writer.append([{ type: 'app.mine' }])).rejects.toBeInstanceOf(
      LogOwnedElsewhereError,
    )
    await expect.poll(() => writer.state.seq).toBe(1)
    expect(failures).toEqual([])
    expect((await records(store)).map((record) => record.type)).toEqual([
      'app.other',
    ])
  })

  it('reads a log with a record type from a newer harness, and writes nothing to it', async () => {
    const store = memoryLogStore()
    const old = newWriter(store)
    await old.commit({ messages: [user('u1', 'one')] })
    await old.rest()
    // A newer host appends a harness record type that this version does not know.
    await writeAsOtherHost(store, LOG, (epoch) =>
      store.append({
        logId: LOG,
        seq: 2,
        epoch,
        records: [{ type: 'harness.later', value: 1 }],
      }),
    )
    const state = await loadLogState({ store, logId: LOG, rootThread: THREAD })
    expect(state.newerRecord).toBe('harness.later')
    expect(sessionOf(state, THREAD).messages).toEqual([user('u1', 'one')])

    const failures: Array<unknown> = []
    const writer = newWriter(store, {
      state,
      onFailure: (e) => failures.push(e),
    })
    await expect(writer.append([{ type: 'app.mine' }])).rejects.toBeInstanceOf(
      LogVersionError,
    )
    expect(failures[0]).toBeInstanceOf(LogVersionError)
    await expect(
      logMessageStore({ store }).saveThread(THREAD, [user('u2', 'two')]),
    ).rejects.toBeInstanceOf(LogVersionError)
    expect((await records(store)).map((record) => record.type)).toEqual([
      'harness.transcript',
      'harness.later',
    ])
  })

  it('folds the records of the last owner before its first append', async () => {
    const store = memoryLogStore()
    const failures: Array<unknown> = []
    // It is not notified, so only the acquire makes it read the log.
    const next = newWriter(silentStore(store), {
      onFailure: (error) => failures.push(error),
    })
    await store.append({
      logId: LOG,
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records: [{ type: 'app.from-another-host' }],
    })

    await next.append([{ type: 'app.mine' }])

    expect(failures).toEqual([])
    expect(next.state.seq).toBe(2)
    expect((await records(store)).map((record) => record.type)).toEqual([
      'app.from-another-host',
      'app.mine',
    ])
  })

  it('calls onFailure on a conflict and rejects every later write', async () => {
    const inner = memoryLogStore()
    const failures: Array<unknown> = []
    // A store that refuses each position.
    const store = wrapLogStore(silentStore(inner), {
      append: (batch) =>
        Promise.reject(new LogConflictError(batch.logId, batch.seq)),
    })
    const writer = newWriter(store, {
      onFailure: (error) => failures.push(error),
    })

    await expect(writer.append([{ type: 'app.late' }])).rejects.toBeInstanceOf(
      LogConflictError,
    )
    await expect(writer.append([{ type: 'app.later' }])).rejects.toBeInstanceOf(
      LogConflictError,
    )
    expect(failures).toHaveLength(1)
    expect(await records(inner)).toEqual([])
  })

  it('counts a batch that landed before an error as written', async () => {
    const inner = memoryLogStore()
    let calls = 0
    const flaky = wrapLogStore(silentStore(inner), {
      append: async (batch) => {
        calls += 1
        await inner.append(batch)
        if (calls === 1) throw new Error('timeout after the write')
      },
    })
    const writer = newWriter(flaky)

    await writer.append([{ type: 'app.one' }])
    await writer.append([{ type: 'app.two' }])

    expect((await records(inner)).map((record) => record.type)).toEqual([
      'app.one',
      'app.two',
    ])
    expect(calls).toBe(2)
  })

  it('reads on after a read of records from another writer fails', async () => {
    const inner = memoryLogStore()
    let isDown = false
    const store = wrapLogStore(inner, {
      read: async (query) => {
        if (isDown) throw new Error('read failed')
        return inner.read(query)
      },
    })
    const failures: Array<unknown> = []
    const reader = newWriter(store, { onFailure: (e) => failures.push(e) })
    isDown = true
    await inner.append({
      logId: LOG,
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records: [{ type: 'app.other' }],
    })
    // After the failed read: the flush runs after it.
    await reader.flush()
    expect(reader.state.seq).toBe(0)

    // The next notification reads both records.
    isDown = false
    await inner.append({
      logId: LOG,
      seq: 2,
      epoch: NO_OWNER_EPOCH,
      records: [{ type: 'app.other' }],
    })

    await expect.poll(() => reader.state.seq).toBe(2)
    expect(failures).toEqual([])
  })

  it('counts a landed batch as written when the store reorders its keys', async () => {
    const inner = memoryLogStore()
    let calls = 0
    const reordering = wrapLogStore(silentStore(inner), {
      append: async (batch) => {
        calls += 1
        await inner.append(batch)
        if (calls === 1) throw new Error('timeout after the write')
      },
      read: async (query) =>
        (await inner.read(query)).map((entry) => ({
          ...entry,
          record: {
            ...Object.fromEntries(Object.entries(entry.record).reverse()),
            type: entry.record.type,
          },
        })),
    })
    const writer = newWriter(reordering)

    await writer.append([{ type: 'app.one', a: 1, b: { c: 2, d: 3 } }])
    await writer.append([{ type: 'app.two' }])

    expect(calls).toBe(2)
  })

  it('tries once more after a store error, then fails with that error', async () => {
    let calls = 0
    const down = wrapLogStore(silentStore(memoryLogStore()), {
      append: async () => {
        calls += 1
        throw new Error('network down')
      },
    })
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

describe('snapshots', () => {
  /** The thread state of a snapshot session, as `serialize` writes it. */
  const threadOf = (overrides: Record<string, unknown> = {}) => ({
    settings: { instructions: 'from the snapshot' },
    config: [['level', 'high']],
    plugins: [],
    interrupted: null,
    agentResults: [],
    turnOverrides: [],
    schedules: [],
    runs: [],
    tree: [],
    interrupts: [],
    waits: [],
    transfers: [],
    shared: [],
    activeAgent: null,
    workspace: null,
    ...overrides,
  })

  /** One session of a snapshot, as `serialize` writes it. */
  const snapshotSession = (overrides: Record<string, unknown> = {}) => ({
    messages: [user('marker', 'from the snapshot')],
    transcriptSeq: 1,
    inputs: [],
    toolResults: [],
    started: [],
    steps: [],
    usage: emptyUsage(),
    runUsage: [],
    revert: null,
    jobs: [],
    notes: [],
    keptRecords: [],
    thread: threadOf(),
    ...overrides,
  })

  /** A snapshot at position 1, with `overrides` on its state. */
  const snapshotOf = (
    overrides: Record<string, unknown>,
    thread: unknown = threadOf(),
    version = SNAPSHOT_VERSION,
  ): LogSnapshot => ({
    seq: 1,
    version,
    state: {
      version: 'v1',
      sessions: [[THREAD, snapshotSession({ thread })]],
      reduced: null,
      ...overrides,
    },
  })

  /** A log of `records` (default: two transcript records), and a store that hands out `snapshot`. */
  async function seededStore(
    snapshot: unknown,
    records: Array<LogRecord> = [
      { type: 'harness.transcript', add: [user('u1', 'one')] },
      { type: 'harness.transcript', add: [user('u2', 'two')] },
    ],
  ) {
    const inner = memoryLogStore()
    await inner.append({ logId: LOG, seq: 1, epoch: NO_OWNER_EPOCH, records })
    // The store does not read the state, so a test can give any value.
    return wrapLogStore(inner, {
      getSnapshot: async () => snapshot as LogSnapshot,
    })
  }

  /** A store that records the `after` of each read. */
  function countingStore(inner: LogStore) {
    const reads: Array<number> = []
    const store = wrapLogStore(inner, {
      read: (query) => {
        reads.push(query.after ?? 0)
        return inner.read(query)
      },
    })
    return { store, reads }
  }

  const tick = (index: number): LogRecord => ({ type: 'app.tick', index })

  it('starts the fold from a valid snapshot', async () => {
    const store = await seededStore(snapshotOf({}))

    const state = await loadSession({ store, project })

    // Record 2 folds on top of the snapshot (keep 1, add u2).
    expect(state.messages).toEqual([
      user('marker', 'from the snapshot'),
      user('u2', 'two'),
    ])
    expect(state.thread.settings).toEqual({ instructions: 'from the snapshot' })
    expect([...state.thread.config]).toEqual([['level', 'high']])
  })

  it('folds the workspace binding and the backend ids of jobs, from records and from a snapshot', async () => {
    const binding = {
      kind: 'sandbox',
      provider: 'fake',
      sandboxId: 's1',
      root: '/ws',
    }
    const fromRecords = await loadSession({
      store: await seededStore(null, [
        { type: 'harness.workspace.bound', binding },
        { type: 'harness.job', jobId: 'bash-1', ended: false, backendId: 'p9' },
        { type: 'harness.job', jobId: 'bash-2', ended: false },
        {
          type: 'harness.job',
          jobId: 'call-1',
          ended: false,
          user: { id: 'u1' },
          at: 100,
          label: 'bash',
        },
        // The second start of a moved call adds its backend id and command.
        {
          type: 'harness.job',
          jobId: 'call-1',
          ended: false,
          at: 200,
          backendId: 'p3',
          label: 'npm run dev',
        },
      ]),
      project,
    })
    expect(fromRecords.thread.workspace).toEqual(binding)
    expect([...fromRecords.jobs]).toEqual([
      ['bash-1', { backendId: 'p9' }],
      ['bash-2', {}],
      [
        'call-1',
        {
          user: { id: 'u1' },
          at: 100,
          backendId: 'p3',
          label: 'npm run dev',
        },
      ],
    ])

    const snapshot = snapshotOf({
      sessions: [
        [
          THREAD,
          snapshotSession({
            messages: [],
            jobs: [['bash-1', 'p9'], 'bash-2', ['bash-3', { label: 'ls' }]],
            thread: threadOf({ workspace: binding }),
          }),
        ],
      ],
    })
    const fromSnapshot = await loadSession({
      store: await seededStore(snapshot),
      project,
    })
    expect(fromSnapshot.thread.workspace).toEqual(binding)
    expect([...fromSnapshot.jobs]).toEqual([
      ['bash-1', { backendId: 'p9' }],
      ['bash-2', {}],
      ['bash-3', { label: 'ls' }],
    ])
  })

  it.each([
    ['a state that is not an object', { seq: 1, version: '5', state: 'x' }],
    ['another snapshot version', snapshotOf({}, threadOf(), '4')],
    ['a session with no thread state', snapshotOf({}, null)],
    [
      'a thread state that is not shaped',
      snapshotOf({}, threadOf({ config: 'x' })),
    ],
    ['another projection version', snapshotOf({ version: 'v0' })],
    ['sessions that are not shaped', snapshotOf({ sessions: 'x' })],
    [
      'usage totals with no bySource',
      snapshotOf({
        sessions: [
          [
            THREAD,
            snapshotSession({
              usage: { total: emptyUsage().total, byModel: {}, bySender: {} },
            }),
          ],
        ],
      }),
    ],
    [
      'a record type from a newer harness',
      snapshotOf({ recordTypes: ['harness.transcript', 'harness.later'] }),
    ],
  ])('ignores a snapshot with %s', async (_name, snapshot) => {
    const store = await seededStore(snapshot)

    const state = await loadSession({ store, project })

    expect(state.messages).toEqual([user('u1', 'one'), user('u2', 'two')])
  })

  it('writes a snapshot of the whole fold after `bytes` of new records', async () => {
    const store = memoryLogStore()
    const writer = newWriter(store, {
      project,
      snapshot: { bytes: 300, ms: 60_000 },
    })

    await writer.append([tick(1)])
    await writer.rest()
    expect(await store.getSnapshot({ logId: LOG })).toBeNull()

    await writer.append([{ type: 'app.big', pad: 'x'.repeat(300) }])
    await writer.rest()

    expect(await store.getSnapshot({ logId: LOG })).toMatchObject({
      seq: 2,
      version: SNAPSHOT_VERSION,
      state: { version: 'v1' },
    })
  })

  it('writes a snapshot `ms` after the first new record', async () => {
    vi.useFakeTimers()
    try {
      const store = memoryLogStore()
      // A busy session keeps the log, so the timer finds the epoch.
      const writer = newWriter(store, {
        snapshot: { bytes: 1_000_000, ms: 1_000 },
        isBusy: () => true,
      })

      await writer.append([tick(1)])
      await vi.advanceTimersByTimeAsync(999)
      expect(await store.getSnapshot({ logId: LOG })).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      await writer.rest()

      expect(await store.getSnapshot({ logId: LOG })).toMatchObject({ seq: 1 })
      writer.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes a due snapshot at the next write after the host gave the log back', async () => {
    vi.useFakeTimers()
    try {
      const store = memoryLogStore()
      const writer = newWriter(store, {
        snapshot: { bytes: 1_000_000, ms: 1_000 },
      })

      await writer.append([tick(1)])
      await writer.rest()
      // No owner when the timer fires: no snapshot.
      await vi.advanceTimersByTimeAsync(1_000)
      expect(await store.getSnapshot({ logId: LOG })).toBeNull()
      await writer.append([tick(2)])
      await writer.rest()

      expect(await store.getSnapshot({ logId: LOG })).toMatchObject({ seq: 2 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('never writes a snapshot on a host that only reads the log', async () => {
    const inner = memoryLogStore()
    const snapshots: Array<number> = []
    const watched = wrapLogStore(inner, {
      putSnapshot: async (snapshot) => {
        snapshots.push(snapshot.seq)
        await inner.putSnapshot(snapshot)
      },
    })
    const reader = newWriter(watched, { snapshot: { bytes: 1 } })
    const other = newWriter(silentStore(inner), {
      snapshot: { bytes: 1_000_000 },
    })

    await other.commit({ messages: [user('u1', 'from the other host')] })
    await other.append([{ type: 'app.big', pad: 'x'.repeat(100) }])
    await expect.poll(() => reader.state.seq).toBe(2)
    await reader.rest()

    expect(snapshots).toEqual([])
    expect(await inner.getSnapshot({ logId: LOG })).toBeNull()
  })

  it('opens from the snapshot and reads only the records after it', async () => {
    const inner = memoryLogStore()
    const writer = newWriter(inner, { snapshot: { bytes: 1 } })
    await writer.commit({ messages: [user('u1', 'one')] })
    await writer.commit({ messages: [user('u1', 'one'), user('u2', 'two')] })
    await writer.rest()
    writer.close()
    expect(await inner.getSnapshot({ logId: LOG })).toMatchObject({ seq: 2 })
    // A record that another host wrote after the snapshot.
    await writeAsOtherHost(inner, LOG, (epoch) =>
      inner.append({ logId: LOG, seq: 3, epoch, records: [tick(3)] }),
    )
    const { store, reads } = countingStore(inner)

    const state = await loadLogState({ store, logId: LOG, rootThread: THREAD })

    // One page after the snapshot, then the empty page at the end.
    expect(reads).toEqual([2, 3])
    expect(state.seq).toBe(3)
    expect(sessionOf(state, THREAD).messages).toEqual([
      user('u1', 'one'),
      user('u2', 'two'),
    ])
  })

  it('counts usage once after two loads from one snapshot', async () => {
    const store = memoryLogStore()
    const writer = newWriter(store, { snapshot: { bytes: 1 } })
    const usage: LogRecord = {
      type: 'harness.usage',
      model: 'm',
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        cachedTokens: 0,
        cacheWriteTokens: 0,
      },
    }
    for (let index = 0; index < 3; index += 1) await writer.append([usage])
    await writer.rest()
    expect(await store.getSnapshot({ logId: LOG })).toMatchObject({ seq: 3 })

    await loadSession({ store })
    const state = await loadSession({ store })

    expect(state.usage.total.calls).toBe(3)
  })

  it("truncates the records before each snapshot with logRecords 'since-snapshot'", async () => {
    const store = memoryLogStore()
    const writer = newWriter(store, {
      snapshot: { bytes: 1 },
      logRecords: 'since-snapshot',
    })

    await writer.commit({ messages: [user('u1', 'one')] })
    await writer.commit({ messages: [user('u1', 'one'), user('u2', 'two')] })
    await writer.rest()

    await expect(store.read({ logId: LOG })).rejects.toBeInstanceOf(
      LogTruncatedError,
    )
    expect(await store.read({ logId: LOG, after: 2 })).toEqual([])
    // A new host still has the whole fold, from the snapshot.
    expect((await loadSession({ store })).messages).toEqual([
      user('u1', 'one'),
      user('u2', 'two'),
    ])
  })

  it("keeps every record with logRecords 'all'", async () => {
    const store = memoryLogStore()
    const writer = newWriter(store, { snapshot: { bytes: 1 } })

    await writer.append([tick(1)])
    await writer.append([tick(2)])
    await writer.rest()

    expect(await store.getSnapshot({ logId: LOG })).toMatchObject({ seq: 2 })
    expect(await records(store)).toEqual([tick(1), tick(2)])
  })

  it('sends one gap event to a reader whose cursor is before the cut, then the stored events', async () => {
    const store = memoryLogStore()
    const first = newWriter(store, {
      snapshot: { bytes: 1 },
      logRecords: 'since-snapshot',
    })
    first.publish('op-a', textStart('m1'))
    await first.flush()
    first.publish('op-a', textEnd('m1'))
    await first.flush()
    await first.rest()
    first.close()
    // A new host opens from the snapshot at 2: events 1 and 2 are gone.
    const state = await loadLogState({ store, logId: LOG, rootThread: THREAD })
    const writer = newWriter(store, { state })
    let done = false
    const seen: Array<SessionEvent> = []
    const reading = (async () => {
      for await (const entry of writer.read({ from: '0', until: () => done })) {
        seen.push(entry)
      }
    })()
    writer.publish('op-a', textStart('m2'))
    await writer.flush()
    done = true
    // A write wakes the reader, so it sees `done`.
    writer.publish('op-a', textEnd('m2'))
    await writer.flush()
    await reading

    expect(seen.map((entry) => [entry.cursor, entry.event])).toEqual([
      [
        '2',
        expect.objectContaining({
          type: EventType.CUSTOM,
          name: HARNESS_EVENTS.gap,
          value: { from: '0', resumeAt: '2', reason: 'truncated' },
        }),
      ],
      ['3', textStart('m2')],
      ['4', textEnd('m2')],
    ])
  })

  it('folds from the snapshot when the owner truncated records this host did not read', async () => {
    const inner = memoryLogStore()
    // This host never hears of the writes, so its fold stays at 0.
    const reader = newWriter(silentStore(inner))
    const owner = newWriter(inner, {
      snapshot: { bytes: 1 },
      logRecords: 'since-snapshot',
    })
    await owner.commit({ messages: [user('u1', 'one')] })
    await owner.commit({ messages: [user('u1', 'one'), user('u2', 'two')] })
    await owner.rest()
    owner.close()

    await reader.catchUp()

    expect(reader.state.seq).toBe(2)
    expect(reader.state.messages).toEqual([
      user('u1', 'one'),
      user('u2', 'two'),
    ])
  })

  /** Counts the host records of the log. */
  const countRecords: ReduceOptions<number> = {
    initial: 0,
    record: ({ state }) => state + 1,
  }

  it.each([
    ['no reduce fold', snapshotOf({}), countRecords],
    [
      'another reduce version',
      snapshotOf({ reduceVersion: 'r0' }),
      { ...countRecords, version: 'r1' },
    ],
  ])(
    'ignores a snapshot with %s for a load with reduce',
    async (_name, snapshot, reduce) => {
      const store = await seededStore(snapshot, [tick(1), tick(2)])

      const state = await loadLogState({
        store,
        logId: LOG,
        rootThread: THREAD,
        project,
        reduce,
      })

      // The count includes record 1: the fold did not start at the snapshot.
      expect(state.reduced).toBe(2)
    },
  )

  it('starts a reduce fold from the snapshot that a shared log wrote', async () => {
    const store = memoryLogStore()
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
      ownership: hostOwnership(store),
      harness: HARNESS,
      logId: LOG,
      rootThread: THREAD,
      state: emptySharedLogState(reduce),
      coalesceMs: 0,
      eventBytes: EVENT_BYTES,
      reduce,
      snapshot: { bytes: 1 },
    })
    const writer = log.view(THREAD, hooksOf())
    for (let index = 0; index < 5; index += 1)
      await writer.append([tick(index)])
    await writer.rest()
    expect(await store.getSnapshot({ logId: LOG })).toMatchObject({
      seq: 5,
      state: { reduceVersion: '' },
    })
    calls = 0

    const state = await loadLogState({
      store,
      logId: LOG,
      rootThread: THREAD,
      reduce,
    })

    expect(state.reduced).toBe(5)
    expect(state.reduced).toEqual(log.state.reduced)
    // The fold started at the snapshot: no record folded again.
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
    const engine = engineMessageStore({ writer })
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

  it('lets an engine save that changes older messages win, and keeps a later host message', async () => {
    const { writer, engine } = await engineOnLog()
    await engine.loadThread(THREAD)
    await engine.saveThread(THREAD, [user('u1', 'one'), assistant('a1', 'two')])
    await writer.append([{ type: 'app.signal', text: '[signal] late' }])

    await engine.saveThread(THREAD, [assistant('s', 'engine summary')])

    expect(writer.state.messages).toEqual([
      assistant('s', 'engine summary'),
      { role: 'user', content: '[signal] late' },
    ])
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

  it('skips a second commit of the same model call when nothing changed', async () => {
    const { writer, engine } = await engineOnLog()
    await engine.loadThread(THREAD)
    const list = [user('u1', 'one'), toolCallMessage, toolResult]
    await engine.beforeModel(list)
    const commit = vi.spyOn(writer, 'commit')

    // The same message objects and the same fold: no commit.
    expect(await engine.beforeModel([...list])).toBeUndefined()
    expect(commit).not.toHaveBeenCalled()

    // A host record changes the fold: the next call commits and gives it.
    await writer.append([{ type: 'app.signal', text: '[signal] build failed' }])
    expect(await engine.beforeModel([...list])).toEqual([...list, signal])
    expect(commit).toHaveBeenCalledTimes(1)
  })
})

describe('logIdOf', () => {
  it('encodes the tenant and the log id, so no two pairs give one id', () => {
    expect(logIdOf({ logId: 't1' })).toBe(':t1')
    expect(logIdOf({ tenantId: 'org/1', logId: 'a:b' })).toBe('org%2F1:a%3Ab')
    expect(logIdOf({ tenantId: 'a:b', logId: 'c' })).toBe('a%3Ab:c')
    expect(logIdOf({ tenantId: 'a', logId: 'b:c' })).toBe('a:b%3Ac')
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
    expect(await records(store, logIdOf({ logId: 't9' }))).toEqual([
      { type: 'harness.transcript', keep: 0, add: [u1] },
      { type: 'harness.transcript', keep: 1, add: [a1] },
    ])
  })

  it('logMessageStore reloads and tries once more after a conflict', async () => {
    const inner = memoryLogStore()
    let raced = false
    const racing = wrapLogStore(silentStore(inner), {
      append: async (batch) => {
        if (!raced) {
          raced = true
          // Another writer takes the position first.
          await inner.append({ ...batch, records: [{ type: 'app.other' }] })
        }
        await inner.append(batch)
      },
    })

    await logMessageStore({ store: racing }).saveThread('t9', [
      user('u1', 'hi'),
    ])

    expect(
      (await records(inner, logIdOf({ logId: 't9' }))).map(
        (record) => record.type,
      ),
    ).toEqual(['app.other', 'harness.transcript'])
  })

  it('sessionMessageStore writes its thread and each child thread to the one log of the writer', async () => {
    const store = memoryLogStore()
    const writer = newWriter(store)
    const messages = sessionMessageStore({ writer })

    await messages.saveThread(THREAD, [user('u1', 'main')])
    await messages.saveThread('subagent:1', [user('c1', 'child')])

    expect(writer.state.messages).toEqual([user('u1', 'main')])
    expect(await messages.loadThread(THREAD)).toEqual([user('u1', 'main')])
    expect(await messages.loadThread('subagent:1')).toEqual([
      user('c1', 'child'),
    ])
    const written: Array<LogRecord> = await records(store, writer.logId)
    expect(written.map((record) => record.thread)).toEqual([
      undefined,
      'subagent:1',
    ])
    expect(await records(store, logIdOf({ logId: 'subagent:1' }))).toEqual([])
  })
})

describe('a log shared by sessions', () => {
  /** The id in the store of the log whose root thread is `log-1`. */
  const SHARED = logIdOf({ logId: 'log-1' })
  const sharedWriter = (store: LogStore) => {
    const log = new SharedLog({
      store,
      ownership: hostOwnership(store),
      harness: HARNESS,
      logId: SHARED,
      rootThread: 'log-1',
      state: emptySharedLogState(),
      coalesceMs: 0,
      eventBytes: EVENT_BYTES,
    })
    return {
      log,
      root: log.view('log-1', hooksOf()),
      child: log.view('child', hooksOf()),
    }
  }

  it('writes no thread field for the log own session', async () => {
    const store = memoryLogStore()
    const { root } = sharedWriter(store)

    await root.append([{ type: 'app.note', text: 'one' }])

    expect(await records(store, SHARED)).toEqual([
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

    expect(await records(store, SHARED)).toEqual([
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
    const state = await loadLogState({
      store,
      logId: SHARED,
      rootThread: 'log-1',
    })
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
      ownership: hostOwnership(store),
      harness: HARNESS,
      logId: SHARED,
      rootThread: 'log-1',
      state: emptySharedLogState(reduce),
      coalesceMs: 0,
      eventBytes: EVENT_BYTES,
      reduce,
    })
    const root = log.view('log-1', hooksOf())
    const child = log.view('child', hooksOf())

    await root.append([{ type: 'app.state_write', name: 'x', value: 1 }])
    await child.append([{ type: 'app.state_write', name: 'x', value: 2 }])

    expect(log.state.reduced).toEqual({ x: 2 })
    expect(
      (
        await loadLogState({
          store,
          logId: SHARED,
          rootThread: 'log-1',
          reduce,
        })
      ).reduced,
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

  it('closes after the last view closes, and opens no view after that', async () => {
    const { log, root, child } = sharedWriter(memoryLogStore())

    root.close()
    expect(log.isOpen).toBe(true)
    child.close()

    await waitFor(() => expect(log.isOpen).toBe(false))
    expect(() => log.view('log-1', hooksOf())).toThrow(
      `The log ${JSON.stringify(SHARED)} is closed.`,
    )
  })

  it('fences every view when another host takes the log, and stays open', async () => {
    const store = memoryLogStore()
    const onIdle = vi.fn()
    const log = new SharedLog({
      store,
      ownership: hostOwnership(store, {
        ...CRASHING_OWNERSHIP,
        expiresAfterMs: 20,
      }),
      harness: HARNESS,
      logId: SHARED,
      rootThread: 'log-1',
      state: emptySharedLogState(),
      coalesceMs: 0,
      eventBytes: EVENT_BYTES,
      onIdle,
    })
    const rootLost = vi.fn()
    const childLost = vi.fn()
    const failure = vi.fn()
    const busy = { isBusy: () => true, onFailure: failure }
    const root = log.view('log-1', hooksOf({ ...busy, onLost: rootLost }))
    const child = log.view('child', hooksOf({ ...busy, onLost: childLost }))
    await root.append([{ type: 'app.mine' }])
    await new Promise((resolve) => setTimeout(resolve, 30))

    // Another host takes the expired log and writes.
    await writeAsOtherHost(store, SHARED, (epoch) =>
      store.append({
        logId: SHARED,
        seq: 2,
        epoch,
        records: [{ type: 'app.other' }],
      }),
    )

    await expect.poll(() => rootLost.mock.calls.length).toBe(1)
    expect(childLost).toHaveBeenCalledTimes(1)
    expect(failure).not.toHaveBeenCalled()
    expect(onIdle).not.toHaveBeenCalled()
    expect(log.isOpen).toBe(true)
    expect(log.state.seq).toBe(2)
    await expect(root.append([{ type: 'app.x' }])).rejects.toBeInstanceOf(
      LogOwnedElsewhereError,
    )
    await expect(child.append([{ type: 'app.x' }])).rejects.toBeInstanceOf(
      LogOwnedElsewhereError,
    )
    expect((await records(store, SHARED)).map((record) => record.type)).toEqual(
      ['app.mine', 'app.other'],
    )
  })

  it('opens one view per thread at a time', async () => {
    const store = memoryLogStore()
    const { log, root } = sharedWriter(store)

    expect(() => log.view('log-1', hooksOf())).toThrow(
      'The thread "log-1" already has an open session on this log.',
    )
    root.close()

    // The child view keeps the log open, so the thread opens again.
    const again = log.view('log-1', hooksOf())
    await again.append([{ type: 'app.note' }])
    expect(await records(store, SHARED)).toEqual([{ type: 'app.note' }])
  })

  it('stays open until the last append of a closed view lands', async () => {
    const inner = memoryLogStore()
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const store = wrapLogStore(silentStore(inner), {
      append: async (batch) => {
        await held
        await inner.append(batch)
      },
    })
    const log = new SharedLog({
      store,
      ownership: hostOwnership(store),
      harness: HARNESS,
      logId: LOG,
      rootThread: THREAD,
      state: emptySharedLogState(),
      coalesceMs: 0,
      eventBytes: EVENT_BYTES,
    })
    const view = log.view(THREAD, hooksOf())
    void view.append([{ type: 'app.last' }])
    view.close()

    expect(log.isOpen).toBe(true)
    // An open now gets this log, so it has the last append.
    const next = log.view(THREAD, hooksOf())
    release()
    await next.flush()
    expect(next.state.seq).toBe(1)
    next.close()
    await waitFor(() => expect(log.isOpen).toBe(false))
  })

  it('drops the staged records of a closed view', async () => {
    const store = memoryLogStore()
    // The root view keeps the log open.
    const { log, child } = sharedWriter(store)

    child.stage([{ type: 'app.x' }])
    child.close()
    const next = log.view('child', hooksOf())
    await next.commit({ messages: [user('c1', 'hi')] })

    expect((await records(store, SHARED)).map((record) => record.type)).toEqual(
      ['harness.transcript'],
    )
  })
})
