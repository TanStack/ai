import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  createHarnessHost,
  defineHarness,
  definePlugin,
  membersOnly,
} from '../src'
import { createHarnessHandler, handleHarnessSocket } from '../src/server'
import { hostCountsOf } from '../src/host'
import { fakeSocket, mockAdapter, readSse, text, toolCall } from './helpers'
import type { HarnessHostOptions, HarnessUser, SessionEvent } from '../src'

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

/**
 * A host whose sessions close at once when no handle holds them, and a
 * harness with the stdio-like plugin. `writes()` counts the index and
 * metadata writes since the last `reset()`.
 */
function setup(options: Pick<HarnessHostOptions, 'access'> = {}) {
  const persistence = memoryPersistence()
  const { plugin, setups } = stdioLikePlugin()
  const { adapter } = mockAdapter(() => text('Hello back.'))
  const harness = defineHarness({
    name: 'test/observe',
    adapter,
    plugins: () => [plugin],
  })
  const host = createHarnessHost({
    persistence,
    log: { bufferStreamWriteMs: 0 },
    lifecycle: { closeIdleSessionsAfterMs: 0 },
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
  const seed = async (user?: HarnessUser) => {
    const session = await host.open(harness, {
      threadId: THREAD,
      ...(user ? { user } : {}),
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('host.observe of an idle thread', () => {
  it('reads an idle thread with no plugin setup and no store write', async () => {
    const { host, harness, setups, writes, seed, reset, isOpen } = setup()
    await seed()
    reset()

    const view = await host.observe(harness, { threadId: THREAD })
    const transcript = await view.transcript()
    const snapshot = await view.snapshot()
    const entry = await view.indexEntry()

    expect(transcript.map((message) => message.content)).toEqual([
      'Hello.',
      'Hello back.',
    ])
    // The saved plugin state, read with no setup.
    expect(snapshot).toMatchObject({
      threadId: THREAD,
      status: 'idle',
      activeOperations: [],
      pendingWaits: [],
      plugins: { 'test/stdio-like': { mounts: 1 } },
    })
    expect(entry?.harness).toBe('test/observe')
    expect(setups.count).toBe(0)
    expect(writes()).toBe(0)
    expect(isOpen()).toBe(false)
    await host.close()
  })
})

describe('host.observe snapshot', () => {
  it('matches session.snapshot() of the same thread state', async () => {
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy',
      inputSchema: z.object({}),
      needsApproval: true,
    }).server(async () => 'deployed')
    const { plugin } = stdioLikePlugin()
    const harness = defineHarness({
      name: 'test/observe-snapshot',
      adapter: mockAdapter([() => toolCall('deploy', {}, 'c1')]).adapter,
      tools: [deploy],
      plugins: () => [plugin],
    })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      log: { bufferStreamWriteMs: 0 },
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    const session = await host.open(harness, { threadId: THREAD })
    await session.send('Deploy.')
    const live = session.snapshot()
    expect(live.status).toBe('requires_action')
    expect(live.pendingWaits).toHaveLength(1)
    await session.close()
    expect(host.isOpen(harness, { threadId: THREAD })).toBe(false)

    const view = await host.observe(harness, { threadId: THREAD })

    // The close appends to the log, so only the cursor moved on.
    expect(await view.snapshot()).toEqual({
      ...live,
      cursor: expect.any(String),
    })
    await host.close()
  })
})

describe('host.observe', () => {
  it('streams what open sessions write, shares one fold, and does not hold the session', async () => {
    const { host, harness, persistence, seed, isOpen } = setup()
    const reads = vi.spyOn(persistence.stores.log, 'getSnapshot')
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
    // Each fold of the log reads its snapshot once: one fold for the two
    // views and the two sessions.
    expect(reads).toHaveBeenCalledTimes(1)
    reading.abort()
    await streamed
    await host.close()
  })

  it('ends the event reads of its views at host.close', async () => {
    const { host, harness, seed } = setup()
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

describe('host.observe with access', () => {
  const olga = { id: 'olga', tenantId: 'acme' }
  const cid = { id: 'cid', tenantId: 'acme' }

  it('refuses a stranger and a thread with no entry, and checks a child through its root', async () => {
    const { host, harness, persistence, seed } = setup({
      access: { getUser: () => null, rules: membersOnly() },
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
    const observe = (threadId: string, user: HarnessUser) =>
      host.observe(harness, { threadId, user })

    await expect(observe(THREAD, cid)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(observe('subagent:run-1', cid)).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    // No entry is not found: the same answer as a refusal, and no entry.
    await expect(observe('t-none', olga)).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    expect(
      await host.sessions.get({ threadId: 't-none', user: olga }),
    ).toBeUndefined()
    const child = await observe('subagent:run-1', olga)
    expect(await child.transcript()).toEqual([])
    await host.close()
  })
})

describe('host.observe of a child thread', () => {
  it('throws when the parent of the child has no index entry', async () => {
    const { host, harness, persistence } = setup()
    await persistence.stores.sessions.upsert({
      threadId: 'subagent:run-1',
      parentThreadId: 't-gone',
      harness: harness.name,
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })

    await expect(
      host.observe(harness, { threadId: 'subagent:run-1' }),
    ).rejects.toThrow(/no entry for thread "t-gone"/)
    await host.close()
  })

  it('throws on a host without stores.sessions', async () => {
    const { log } = memoryPersistence().stores
    const host = createHarnessHost({ persistence: { stores: { log } } })
    const harness = defineHarness({
      name: 'test/observe',
      adapter: mockAdapter([]).adapter,
    })

    await expect(
      host.observe(harness, { threadId: `${THREAD}/agent/run-1` }),
    ).rejects.toThrow(/a child thread needs stores.sessions/)
    await host.close()
  })
})

describe('the read routes', () => {
  it('mount nothing and write nothing for snapshot, transcript, and events', async () => {
    const { host, harness, setups, writes, seed, reset, isOpen } = setup()
    await seed()
    reset()
    const handler = createHarnessHandler({ host, harness, openAccess: true })
    const get = (route: string) =>
      handler(new Request(`${BASE}/${route}?threadId=${THREAD}`))

    const snapshot = await (await get('snapshot')).json()
    const transcript: Array<{ content: string }> = await (
      await get('transcript')
    ).json()
    // The events stream follows the log, so it reads until the answer.
    const events = await readSse<unknown>(await get('events'), (frame) =>
      JSON.stringify(frame).includes('Hello back.'),
    )

    expect(snapshot.status).toBe('idle')
    expect(transcript.map((message) => message.content)).toEqual([
      'Hello.',
      'Hello back.',
    ])
    expect(JSON.stringify(events)).toContain('Hello back.')
    expect(setups.count).toBe(0)
    expect(writes()).toBe(0)
    expect(isOpen()).toBe(false)
    await host.close()
  })

  it('opens the session of a socket at its first input, not at subscribe or snapshot', async () => {
    const { host, harness, setups, seed, reset } = setup()
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

    /** The answer deltas that the socket sent. */
    const answers = () =>
      sent.filter(
        (frame) =>
          frame.type === 'harness.event' &&
          frame.event.type === EventType.TEXT_MESSAGE_CONTENT,
      ).length
    receive({ type: 'harness.subscribe', threadId: THREAD })
    receive({ type: 'harness.snapshot' })
    // The subscribe streams the log: the answer of the seed turn.
    await waitFor(() => {
      expect(
        sent
          .filter((frame) => frame.type !== 'harness.event')
          .map((frame) => frame.type),
      ).toEqual(['harness.hello', 'harness.snapshot'])
      expect(answers()).toBe(1)
    })
    expect(setups.count).toBe(0)

    receive({
      type: 'harness.input',
      requestId: 'r-1',
      input: { op: 'prompt', message: 'Again.' },
    })

    // The stream goes on with the turn of the session that the input opened.
    await waitFor(() => expect(answers()).toBe(2))
    expect(setups.count).toBe(1)
    expect(closed).toEqual([])
    socket.close()
    await host.close()
  })
})
