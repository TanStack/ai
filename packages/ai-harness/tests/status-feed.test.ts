import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
} from '../src'
import {
  CRASHING_OWNERSHIP,
  mockAdapter,
  ownershipExpired,
  questionsOf,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { HostEvent } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

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
    setup: () => ({
      tools: [
        durableTool(probe, async (_args, { step }) => ({
          sure: await step.ask({ name: 'sure', message: 'Sure?' }),
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
    await waitFor(() => expect(questionsOf(a.snapshot())).toHaveLength(1))
    await b.send('hi')
    const [question] = questionsOf(a.snapshot())
    await a.answer({ questionId: question?.questionId ?? '', value: 'yes' })
    await turn

    await waitFor(() =>
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
    await waitFor(() => expect(questionsOf(a.snapshot())).toHaveLength(1))

    const feed = watch((signal) => host.events({ signal }))

    await waitFor(() => expect(feed.seen).toHaveLength(2))
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
    await host.sessions.delete({ threadId: 'b' })

    await waitFor(() => expect(feed.seen).toHaveLength(3))
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
    await waitFor(() => expect(feed.seen).toHaveLength(1))
    await feed.stop()
    await host.close()
  })
})

describe('host.events on a host that does not own the log', () => {
  it('shows running, then idle, for a turn that another host runs', async () => {
    const logState = memoryLogState()
    const hostOn = () =>
      createHarnessHost({
        persistence: { stores: { log: memoryLogStore({ state: logState }) } },
      })
    const owner = hostOn()
    const other = hostOn()
    const harness = plainHarness()
    const running = await owner.open(harness, { threadId: 'r' })
    const reading = await other.open(harness, { threadId: 'r' })
    const feed = watch((signal) => other.events({ signal }))

    await running.send('hi')

    // Coverage runs in CI are slow, so the check waits up to 5 s.
    await waitFor(
      () =>
        expect(statusesOf(feed.seen, 'r')).toEqual(['idle', 'running', 'idle']),
      { timeout: 5_000 },
    )
    await feed.stop()
    await reading.close()
    await running.close()
    await other.close()
    await owner.close()
  })

  it('shows idle after it takes the log of a host that stopped in a turn', async () => {
    const logState = memoryLogState()
    const harnessOf = (replies: Parameters<typeof mockAdapter>[0]) =>
      defineHarness({
        name: 'test/status-takeover',
        adapter: mockAdapter(replies).adapter,
      })
    const stopped = createHarnessHost({
      persistence: { stores: { log: memoryLogStore({ state: logState }) } },
      ownership: CRASHING_OWNERSHIP,
    })
    const other = createHarnessHost({
      persistence: { stores: { log: memoryLogStore({ state: logState }) } },
    })
    const first = await stopped.open(harnessOf([untilAborted()]), {
      threadId: 's',
    })
    const second = await other.open(harnessOf([() => text('two')]), {
      threadId: 's',
    })
    const feed = watch((signal) => other.events({ signal }))
    void Promise.resolve(first.send('one', { inputId: 'in-1' })).catch(() => {})
    await waitFor(() => expect(statusesOf(feed.seen, 's')).toContain('running'))
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    // The next send takes the log from the stopped host, and runs.
    await second.send('two')

    await waitFor(() => expect(statusesOf(feed.seen, 's').at(-1)).toBe('idle'))
    await feed.stop()
    await second.close()
    await stopped.close().catch(() => {})
    await other.close()
  })
})
