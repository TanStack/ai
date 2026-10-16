import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
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

    const turn = a.send('go')
    await vi.waitFor(() =>
      expect(a.snapshot().pendingQuestions).toHaveLength(1),
    )
    await b.send('hi')
    const [question] = a.snapshot().pendingQuestions
    await a.answer({ questionId: question?.questionId ?? '', value: 'yes' })
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
    void a.send('go')
    await vi.waitFor(() =>
      expect(a.snapshot().pendingQuestions).toHaveLength(1),
    )

    const feed = watch((signal) => host.events({ signal }))

    await vi.waitFor(() => expect(feed.seen).toHaveLength(2))
    expect(feed.seen).toEqual([
      {
        type: 'status',
        threadId: 'a',
        status: 'waiting',
        at: expect.any(Number),
      },
      { type: 'status', threadId: 'b', status: 'idle', at: expect.any(Number) },
    ])
    await feed.stop()
    await host.close()
  })

  it('shows a rename as a session event and a delete as session-deleted', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    await host.open(plainHarness(), { threadId: 'b' })
    const feed = watch((signal) => host.events({ signal }))

    await host.sessions.rename({ threadId: 'b', title: 'Greetings' })
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
    await host.sessions.rename({ threadId: 'b', title: 'After the end' })

    expect(await events.next()).toEqual({ done: true, value: undefined })
    // `stop` resolves only when the waiting read ends.
    const feed = watch((signal) => host.events({ signal }))
    await vi.waitFor(() => expect(feed.seen).toHaveLength(1))
    await feed.stop()
    await host.close()
  })
})
