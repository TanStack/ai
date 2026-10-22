import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createRedactor } from '../src/auth'
import { tapFeed } from '../src/session/helpers'
import { mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { EventFeed } from '../src/feed'
import type { HarnessPersistence, LiveEvent, SessionEvent } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

async function open(persistence: HarnessPersistence = memoryPersistence()) {
  const { adapter } = mockAdapter(() => text('Hello world'))
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({ name: 'test/on-event', adapter }),
    {
      threadId: 't1',
    },
  )
  return { host, session }
}

async function collect(iterable: AsyncIterable<SessionEvent>) {
  const out: Array<SessionEvent> = []
  for await (const entry of iterable) out.push(entry)
  return out
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('session.onEvent', () => {
  it('gets every event in order, with its operation', async () => {
    const { host, session } = await open()
    const live: Array<LiveEvent> = []
    session.onEvent((entry) => live.push(entry))

    const turn = session.send('Hi')
    await turn
    const stored = await collect(turn.events({ from: '0' }))

    const ofTurn = live.filter((entry) => entry.operationId === turn.id)
    expect(ofTurn.map(({ event }) => event)).toEqual(
      stored.map(({ event }) => event),
    )
    await host.close()
  })

  it('gets only the events of one type, narrowed to that type', async () => {
    const { host, session } = await open()
    const deltas: Array<string> = []
    session.onEvent('TEXT_MESSAGE_CONTENT', ({ event }) => {
      deltas.push(event.delta)
    })
    const types = new Set<string>()
    session.onEvent(EventType.RUN_FINISHED, ({ event }) =>
      types.add(event.type),
    )

    await session.send('Hi')

    expect(deltas.join('')).toBe('Hello world')
    expect([...types]).toEqual([EventType.RUN_FINISHED])
    await host.close()
  })

  it('stops after the stop function, and keeps other listeners', async () => {
    const { host, session } = await open()
    const first = vi.fn()
    const second = vi.fn()
    const stop = session.onEvent(first)
    session.onEvent(second)

    stop()
    await session.send('Hi')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
    await host.close()
  })

  it('does not fail the turn when a listener throws', async () => {
    const { host, session } = await open()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn()
    session.onEvent(() => {
      throw new Error('listener failed')
    })
    session.onEvent(after)

    await expect(session.send('Hi')).resolves.toMatchObject({
      text: 'Hello world',
    })
    expect(after).toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    await host.close()
  })

  it('reports an async listener that rejects, and keeps the turn going', async () => {
    const { host, session } = await open()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    session.onEvent(async () => {
      throw new Error('socket closed')
    })

    await expect(session.send('Hi')).resolves.toMatchObject({
      text: 'Hello world',
    })
    await waitFor(() => expect(error).toHaveBeenCalled())
    await host.close()
  })

  it('skips a listener that an earlier listener stopped', async () => {
    const { host, session } = await open()
    const second = vi.fn()
    let stopSecond = () => {}
    session.onEvent(() => stopSecond())
    stopSecond = session.onEvent(second)

    await session.send('Hi')

    expect(second).not.toHaveBeenCalled()
    await host.close()
  })

  it('gets the events of a durable session', async () => {
    const { metadata } = memoryPersistence().stores
    const { host, session } = await open({
      stores: { log: memoryLogStore(), metadata },
    })
    const deltas: Array<string> = []
    session.onEvent('TEXT_MESSAGE_CONTENT', ({ event }) => {
      deltas.push(event.delta)
    })

    await session.send('Hi')

    expect(deltas.join('')).toBe('Hello world')
    await host.close()
  })

  it('throws for a missing listener', async () => {
    const { host, session } = await open()
    // @ts-expect-error a type needs a listener
    expect(() => session.onEvent('RUN_FINISHED')).toThrow(TypeError)
    await host.close()
  })
})

describe('operation.onEvent', () => {
  it('drops its listener when the operation finishes', async () => {
    const { host, session } = await open()
    const listeners: Set<unknown> = Reflect.get(session, 'eventListeners')
    const turn = session.send('Hi')
    turn.onEvent(() => {})
    turn.onMedia(() => {})
    expect(listeners.size).toBe(2)

    await turn

    await waitFor(() => expect(listeners.size).toBe(0))
    // A listener for a settled operation is not added.
    turn.onEvent(() => {})
    expect(listeners.size).toBe(0)
    await host.close()
  })

  it('gets only the events of its operation', async () => {
    const { host, session } = await open()
    const first = session.send('One')
    const second = session.send('Two')
    const ofFirst: Array<string> = []
    first.onEvent(({ operationId }) => ofFirst.push(operationId))

    await Promise.all([first, second])

    expect(ofFirst.length).toBeGreaterThan(0)
    expect(new Set(ofFirst)).toEqual(new Set([first.id]))
    await host.close()
  })
})

describe('a MESSAGES_SNAPSHOT event', () => {
  it('goes to the listeners and to the log', () => {
    const published: Array<StreamChunk> = []
    const feed: EventFeed = {
      publish: (_operationId, event) => void published.push(event),
      head: () => '0',
      read: () => (async function* () {})(),
      close: () => {},
      wake: () => {},
    }
    const heard: Array<string> = []
    const tapped = tapFeed(feed, () => {}, new Set(), createRedactor())
    tapped.listen(({ event }) => void heard.push(event.type))
    const snapshot: StreamChunk = {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [],
      timestamp: 1,
    }
    const started: StreamChunk = {
      type: EventType.RUN_STARTED,
      threadId: 't1',
      runId: 'r1',
      timestamp: 1,
    }

    tapped.publish('r1', snapshot)
    tapped.publish('r1', started)

    expect(heard).toEqual([EventType.MESSAGES_SNAPSHOT, EventType.RUN_STARTED])
    expect(published.map((event) => event.type)).toEqual([
      EventType.MESSAGES_SNAPSHOT,
      EventType.RUN_STARTED,
    ])
  })
})
