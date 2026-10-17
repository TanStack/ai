import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  createHarnessHost,
  defineHarness,
  definePlugin,
  membersOnly,
} from '../src'
import { createHarnessHandler, handleHarnessSocket } from '../src/server'
import { hostCountsOf } from '../src/host'
import { fakeSocket, mockAdapter, text } from './helpers'
import type { HarnessHostOptions, Principal, SessionEvent } from '../src'

/**
 * `vi.waitFor` with more time: CI runs these tests slower, for example under
 * coverage, and a poll costs nothing when the check passes early.
 */
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const BASE = 'http://x/api/harness'
const THREAD = 't1'

/**
 * A plugin like the MCP plugin: its setup would start a stdio server. It
 * counts its setups, and saves how many it saw as its plugin state.
 */
function stdioLikePlugin() {
  const setups = { count: 0 }
  const plugin = definePlugin({
    name: 'test/stdio-like',
    setup: async (ctx) => {
      setups.count += 1
      await ctx
        .state({ mounts: 0 })
        .update((saved) => ({ mounts: saved.mounts + 1 }))
      return {}
    },
  })
  return { plugin, setups }
}

/** The stores of a host with no log, or of a durable host. */
function persistenceOf(shape: 'no log' | 'durable') {
  const { messages, runs, metadata, sessions } = memoryPersistence().stores
  const shared = { runs, metadata, sessions }
  return shape === 'durable'
    ? { stores: { log: memoryLogStore(), ...shared } }
    : { stores: { messages, ...shared } }
}

/**
 * A host whose sessions close at once when no handle holds them, and a
 * harness with the stdio-like plugin. `writes()` counts the index and
 * metadata writes since the last `reset()`.
 */
function setup(
  shape: 'no log' | 'durable',
  options: Pick<HarnessHostOptions, 'access'> = {},
) {
  const persistence = persistenceOf(shape)
  const { plugin, setups } = stdioLikePlugin()
  const { adapter } = mockAdapter(() => text('Hello back.'))
  const harness = defineHarness({
    name: 'test/observe',
    adapter,
    plugins: () => [plugin],
  })
  const host = createHarnessHost({
    persistence,
    log: { coalesceMs: 0 },
    lifecycle: { idleCloseMs: 0 },
    ...options,
  })
  const { sessions, metadata } = persistence.stores
  const spies = [
    vi.spyOn(sessions, 'upsertIf'),
    vi.spyOn(metadata, 'set'),
    vi.spyOn(metadata, 'setIf'),
    vi.spyOn(metadata, 'delete'),
  ]
  const writes = () =>
    spies.reduce((total, spy) => total + spy.mock.calls.length, 0)
  /** Open the thread, run one turn, and close the handle: the session closes. */
  const seed = async (principal?: Principal) => {
    const session = await host.open(harness, {
      threadId: THREAD,
      ...(principal ? { principal } : {}),
    })
    await session.send('Hello.')
    await session.close()
  }
  const reset = () => {
    setups.count = 0
    for (const spy of spies) spy.mockClear()
  }
  const isOpen = () => host.isOpen(harness, { threadId: THREAD })
  return { host, harness, persistence, setups, writes, seed, reset, isOpen }
}

/** The text of the first text delta of `events`. */
async function firstText(events: AsyncIterable<SessionEvent>) {
  for await (const { event } of events) {
    if (event.type === EventType.TEXT_MESSAGE_CONTENT) return event.delta
  }
  return undefined
}

/** Every event of `events`, for a read that ends by itself. */
async function collect(events: AsyncIterable<SessionEvent>) {
  const all: Array<SessionEvent> = []
  for await (const entry of events) all.push(entry)
  return all
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(['no log', 'durable'] as const)(
  'host.observe on a host with %s',
  (shape) => {
    it('reads an idle thread with no plugin setup and no store write', async () => {
      const { host, harness, setups, writes, seed, reset, isOpen } =
        setup(shape)
      await seed()
      reset()

      const view = await host.observe(harness, { threadId: THREAD })
      const transcript = await view.transcript()
      const snapshot = await view.snapshot()
      const entry = await view.entry()

      expect(transcript.map((message) => message.content)).toEqual([
        'Hello.',
        'Hello back.',
      ])
      // The saved plugin state, read with no setup.
      expect(snapshot).toMatchObject({
        threadId: THREAD,
        status: 'idle',
        activeOperations: [],
        pendingInterrupts: [],
        plugins: { 'test/stdio-like': { mounts: 1 } },
      })
      expect(entry?.harness).toBe('test/observe')
      expect(setups.count).toBe(0)
      expect(writes()).toBe(0)
      expect(isOpen()).toBe(false)
      await host.close()
    })
  },
)

describe('host.observe on a durable host', () => {
  it('streams what open sessions write, shares one fold, and does not hold the session', async () => {
    const { host, harness, persistence, seed, isOpen } = setup('durable')
    const reads = vi.spyOn(persistence.stores.metadata, 'get')
    const first = await host.observe(harness, { threadId: THREAD })
    const second = await host.observe(harness, { threadId: THREAD })
    const reading = new AbortController()
    const replies: Array<string> = []
    const streamed = (async () => {
      const events = first.events({ signal: reading.signal })
      for await (const { event } of events) {
        if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
          replies.push(event.delta)
        }
      }
    })()

    await seed()
    // The stream reads, and the session closed on idle all the same.
    expect(isOpen()).toBe(false)
    expect(hostCountsOf(host).sessions).toBe(0)
    // A new session of the thread writes to the same log.
    await seed()

    await waitFor(() => expect(replies).toEqual(['Hello back.', 'Hello back.']))
    const transcript = await second.transcript()
    expect(transcript.map((message) => message.content)).toEqual([
      'Hello.',
      'Hello back.',
      'Hello.',
      'Hello back.',
    ])
    // Each fold of the log reads its checkpoint once: one fold for the two
    // views and the two sessions.
    const folds = reads.mock.calls.filter(
      ([namespace]) => namespace === 'harness:log-checkpoint',
    )
    expect(folds).toHaveLength(1)
    reading.abort()
    await streamed
    await host.close()
  })

  it('ends the event reads of its views at host.close', async () => {
    const { host, harness, seed } = setup('durable')
    await seed()
    const view = await host.observe(harness, { threadId: THREAD })
    const seen: Array<SessionEvent> = []
    const reading = (async () => {
      for await (const entry of view.events()) seen.push(entry)
    })()
    // The read has the log open, and it waits for new events.
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))

    await host.close()

    await expect(reading).resolves.toBeUndefined()
    await expect(view.transcript()).rejects.toThrow('The host is closed.')
  })
})

describe('host.observe on a host with no log', () => {
  it('ends the events at once when the session is not open, and reads the open session', async () => {
    const { host, harness, seed } = setup('no log')
    await seed()
    const view = await host.observe(harness, { threadId: THREAD })

    expect(await collect(view.events())).toEqual([])

    const session = await host.open(harness, { threadId: THREAD })
    await session.send('Again.')
    expect(await firstText(view.events())).toBe('Hello back.')
    await session.close()
    await host.close()
  })
})

describe('host.observe with access', () => {
  const olga = { id: 'olga', tenantId: 'acme' }
  const cid = { id: 'cid', tenantId: 'acme' }

  it('refuses a stranger and a thread with no entry, and checks a child through its root', async () => {
    const { host, harness, persistence, seed } = setup('no log', {
      access: { identify: () => null, authorize: membersOnly() },
    })
    await seed(olga)
    await persistence.stores.sessions.upsert({
      tenantId: 'acme',
      threadId: 'subagent:run-1',
      parentThreadId: THREAD,
      harness: harness.name,
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })
    const observe = (threadId: string, principal: Principal) =>
      host.observe(harness, { threadId, principal })

    await expect(observe(THREAD, cid)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(observe('subagent:run-1', cid)).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    // No entry is not found: the same answer as a refusal, and no entry.
    await expect(observe('t-none', olga)).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    expect(
      await host.sessions.get({ threadId: 't-none', principal: olga }),
    ).toBeUndefined()
    const child = await observe('subagent:run-1', olga)
    expect(await child.transcript()).toEqual([])
    await host.close()
  })
})

describe('the read routes', () => {
  it('mount nothing and write nothing for snapshot, transcript, and events', async () => {
    const { host, harness, setups, writes, seed, reset, isOpen } =
      setup('no log')
    await seed()
    reset()
    const handler = createHarnessHandler({ host, harness, openAccess: true })
    const get = (route: string) =>
      handler(new Request(`${BASE}/${route}?threadId=${THREAD}`))

    const snapshot = await (await get('snapshot')).json()
    const transcript: Array<{ content: string }> = await (
      await get('transcript')
    ).json()
    const events = await (await get('events')).text()

    expect(snapshot.status).toBe('idle')
    expect(transcript.map((message) => message.content)).toEqual([
      'Hello.',
      'Hello back.',
    ])
    // No session is open, so there is nothing to stream.
    expect(events).toBe('')
    expect(setups.count).toBe(0)
    expect(writes()).toBe(0)
    expect(isOpen()).toBe(false)
    await host.close()
  })

  it('opens the session of a socket at its first input, not at subscribe or snapshot', async () => {
    const { host, harness, setups, seed, reset } = setup('no log')
    await seed()
    reset()
    const { socket, sent, closed, receive } = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket,
      request: new Request(`${BASE}/socket`),
      openAccess: true,
    })

    receive({ type: 'harness.subscribe', threadId: THREAD })
    receive({ type: 'harness.snapshot' })
    await waitFor(() =>
      expect(sent.map((frame) => frame.type)).toEqual([
        'harness.hello',
        'harness.snapshot',
      ]),
    )
    expect(setups.count).toBe(0)

    receive({
      type: 'harness.input',
      requestId: 'r-1',
      input: { op: 'prompt', message: 'Again.' },
    })

    // The stream goes on with the session that the input opened.
    await waitFor(() =>
      expect(
        sent.some(
          (frame) =>
            frame.type === 'harness.event' &&
            frame.event.type === EventType.TEXT_MESSAGE_CONTENT,
        ),
      ).toBe(true),
    )
    expect(setups.count).toBe(1)
    expect(closed).toEqual([])
    socket.close()
    await host.close()
  })
})
