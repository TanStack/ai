import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '../src'
import { createHarnessClient } from '../src/client'
import { mockAdapter, text, toolCall } from './helpers'
import type { HostEvent } from '../src'

/** Read a stream of host events into `seen` until `stop()`. */
function watch(read: (signal: AbortSignal) => AsyncIterable<HostEvent>) {
  const seen: Array<HostEvent> = []
  const reader = new AbortController()
  const done = (async () => {
    for await (const event of read(reader.signal)) seen.push(event)
  })()
  return {
    seen,
    stop: async () => {
      reader.abort()
      await done
    },
  }
}

/** The statuses of one thread, in order. */
const statusesOf = (seen: ReadonlyArray<HostEvent>, threadId: string) =>
  seen.flatMap((event) =>
    event.type === 'status' && event.threadId === threadId
      ? [event.status]
      : [],
  )

const probe = toolDefinition({
  name: 'probe',
  description: 'Asks a question.',
  inputSchema: z.object({}),
})

/** A harness whose turn calls a tool that asks a question, then answers. */
function askingHarness() {
  const asker = definePlugin({
    name: 'test/asker',
    setup: (ctx) => ({
      tools: [
        probe.server(async () => ({
          sure: await ctx.session.ask({ message: 'Sure?' }),
        })),
      ],
    }),
  })
  return defineHarness({
    name: 'test/status-asking',
    adapter: mockAdapter([() => toolCall('probe', {}), () => text('Done.')])
      .adapter,
    plugins: () => [asker],
  })
}

const plainHarness = () =>
  defineHarness({
    name: 'test/status-plain',
    adapter: mockAdapter(() => text('answer')).adapter,
  })

describe('host.events', () => {
  it('shows each status change of two sessions', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const feed = watch((signal) => host.events({ signal }))
    const a = await host.open(askingHarness(), { threadId: 'a' })
    const b = await host.open(plainHarness(), { threadId: 'b' })

    const turn = a.prompt('go')
    await vi.waitFor(() =>
      expect(a.snapshot().pendingQuestions).toHaveLength(1),
    )
    await b.prompt('hi')
    const [question] = a.snapshot().pendingQuestions
    await a.answer(question?.questionId ?? '', 'yes')
    await turn

    await vi.waitFor(() =>
      expect(statusesOf(feed.seen, 'a')).toEqual([
        'idle',
        'running',
        'waiting',
        'running',
        'idle',
      ]),
    )
    expect(statusesOf(feed.seen, 'b')).toEqual(['idle', 'running', 'idle'])
    await feed.stop()
    await host.close()
  })

  it('gives a late reader the current status of each open session first', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const a = await host.open(askingHarness(), { threadId: 'a' })
    await host.open(plainHarness(), { threadId: 'b' })
    void a.prompt('go')
    await vi.waitFor(() =>
      expect(a.snapshot().pendingQuestions).toHaveLength(1),
    )

    const feed = watch((signal) => host.events({ signal }))

    await vi.waitFor(() => expect(feed.seen).toHaveLength(2))
    expect(feed.seen).toEqual([
      { type: 'status', threadId: 'a', status: 'waiting', at: expect.any(Number) },
      { type: 'status', threadId: 'b', status: 'idle', at: expect.any(Number) },
    ])
    await feed.stop()
    await host.close()
  })

  it('shows a rename as a session event and a delete as session-deleted', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    await host.open(plainHarness(), { threadId: 'b' })
    const feed = watch((signal) => host.events({ signal }))

    await host.sessions.rename('b', 'Greetings')
    await host.sessions.delete('b')

    await vi.waitFor(() => expect(feed.seen).toHaveLength(3))
    expect(feed.seen).toMatchObject([
      { type: 'status', threadId: 'b', status: 'idle' },
      { type: 'session', threadId: 'b', entry: { title: 'Greetings' } },
      { type: 'session-deleted', threadId: 'b', entry: { title: 'Greetings' } },
    ])
    await feed.stop()
    await host.close()
  })

  it('stops a read when its loop ends or its signal aborts', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    await host.open(plainHarness(), { threadId: 'b' })
    const events = host.events()[Symbol.asyncIterator]()
    expect(await events.next()).toMatchObject({ value: { status: 'idle' } })

    await events.return?.()
    await host.sessions.rename('b', 'After the end')

    expect(await events.next()).toEqual({ done: true, value: undefined })
    // `stop` resolves only when the waiting read ends.
    const feed = watch((signal) => host.events({ signal }))
    await vi.waitFor(() => expect(feed.seen).toHaveLength(1))
    await feed.stop()
    await host.close()
  })
})

describe('GET host-events', () => {
  /** A handler where the `x-user` header is the principal. */
  function setup() {
    const harness = plainHarness()
    const host = createHarnessHost({ persistence: memoryPersistence() })
    /** The thread of each `canAccess` call, in order. */
    const checked: Array<string> = []
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: (request) => {
        const id = request.headers.get('x-user')
        return id ? { id } : null
      },
      canAccess: (_principal, threadId) => {
        checked.push(threadId)
        return threadId !== 'hidden'
      },
    })
    const fetch: typeof globalThis.fetch = (input, init) =>
      handler(new Request(input, init))
    const clientOf = (user: string) =>
      createHarnessClient({
        url: 'http://local/api/harness',
        threadId: `${user}-thread`,
        headers: { 'x-user': user },
        fetch,
      })
    return { host, harness, handler, checked, clientOf }
  }

  it('sends a user only the events of the sessions of that user', async () => {
    const { host, harness, handler, clientOf } = setup()
    const alice = clientOf('alice')
    const bob = clientOf('bob')
    // Opens the thread of alice, so the feed starts with its status.
    await alice.snapshot()
    const feed = watch((signal) => alice.hostEvents({ signal }))
    await vi.waitFor(() =>
      expect(statusesOf(feed.seen, 'alice-thread')).toEqual(['idle']),
    )

    await bob.prompt('hi')
    await vi.waitFor(async () =>
      expect(await bob.transcript()).toHaveLength(2),
    )
    // Alice owns this thread, but `canAccess` refuses it.
    await host.open(harness, { threadId: 'hidden', principal: { id: 'alice' } })
    await alice.prompt('hi')

    await vi.waitFor(() =>
      expect(statusesOf(feed.seen, 'alice-thread')).toEqual([
        'idle',
        'running',
        'idle',
      ]),
    )
    expect(new Set(feed.seen.map((event) => event.threadId))).toEqual(
      new Set(['alice-thread']),
    )
    const anonymous = await handler(
      new Request('http://local/api/harness/host-events'),
    )
    expect(anonymous.status).toBe(401)
    await feed.stop()
    await host.close()
  })

  it('stops reading the host when the client leaves', async () => {
    const { host, handler, checked, clientOf } = setup()
    await clientOf('alice').snapshot()
    const response = await handler(
      new Request('http://local/api/harness/host-events', {
        headers: { 'x-user': 'alice' },
      }),
    )
    if (!response.body) throw new Error('The answer has no body.')
    const reader = response.body.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('"status":"idle"')

    await reader.cancel()
    const checksBefore = checked.length
    await host.sessions.rename('alice-thread', 'After the end')
    await new Promise((resolve) => setTimeout(resolve, 20))

    // A route that still read would check the access of the rename.
    expect(checked).toHaveLength(checksBefore)
    await host.close()
  })
})
