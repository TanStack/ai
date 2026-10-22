import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { HARNESS_EVENTS, createHarnessHost, defineHarness } from '../src'
import { SessionFeed, gapEvent } from '../src/feed'
import { createSessionView } from '../src/view'
import { gate, mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '../src/types'
import type { SessionViewSource } from '../src/view'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const custom = (name: string): StreamChunk => ({
  type: EventType.CUSTOM,
  name,
  value: {},
  timestamp: 0,
})

async function entriesOf(events: AsyncIterable<SessionEvent>) {
  const entries: Array<SessionEvent> = []
  for await (const entry of events) entries.push(entry)
  return entries
}

describe('harness.gap from the in-memory feed', () => {
  it('sends one evicted gap to a cursor whose events the feed dropped, then the kept events', async () => {
    const size = JSON.stringify(custom('e1')).length
    const feed = new SessionFeed({ threadId: 't1', eventBytes: size * 2 })
    for (const name of ['e1', 'e2', 'e3', 'e4'])
      feed.publish('op', custom(name))
    feed.close()

    const entries = await entriesOf(feed.read({ from: '1' }))

    expect(entries.map((entry) => entry.cursor)).toEqual(['2', '3', '4'])
    expect(entries[0]).toEqual({
      cursor: '2',
      threadId: 't1',
      operationId: 'session',
      event: expect.objectContaining({
        type: EventType.CUSTOM,
        name: HARNESS_EVENTS.gap,
        value: { from: '1', resumeAt: '2', reason: 'evicted' },
      }),
    })
  })

  it('sends no gap to a cursor that the feed still has', async () => {
    const size = JSON.stringify(custom('e1')).length
    const feed = new SessionFeed({ threadId: 't1', eventBytes: size * 2 })
    for (const name of ['e1', 'e2', 'e3', 'e4'])
      feed.publish('op', custom(name))
    feed.close()

    const entries = await entriesOf(feed.read({ from: '2' }))

    expect(entries.map((entry) => entry.cursor)).toEqual(['3', '4'])
  })
})

describe('the view on an evicted gap', () => {
  it('loads the snapshot and the transcript again', async () => {
    const harness = defineHarness({
      name: 'test/gap',
      adapter: mockAdapter(() => text('Hello back.')).adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 'gap' })
    await session.send('Hello.')
    const transcript = vi.fn(() => session.transcript())
    const snapshot = vi.fn(() => session.snapshot())
    const reading = new AbortController()
    const overrides: Partial<SessionViewSource> = {
      transcript,
      snapshot,
      // The source dropped events, and says so first.
      events: (options) =>
        (async function* () {
          yield gapEvent(
            session.threadId,
            '0',
            session.snapshot().cursor,
            'evicted',
          )
          yield* session.events({ ...options, signal: reading.signal })
        })(),
    }
    // The session, with the overrides in place of its own methods.
    const source = new Proxy(session, {
      get: (target, key) => {
        if (key in overrides) return overrides[key as keyof SessionViewSource]
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const view = createSessionView(source)
    await view.ready

    await waitFor(() => expect(transcript).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(snapshot.mock.calls.length).toBeGreaterThan(1))
    view.dispose()
    reading.abort()
    await session.close()
    await host.close()
  })

  it('applies no backlog event twice after the transcript loads again', async () => {
    const harness = defineHarness({
      name: 'test/gap-backlog',
      adapter: mockAdapter([() => text('First.'), () => text('Second.')])
        .adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 'gap-backlog' })
    await session.send('One.')
    const before = session.snapshot().cursor
    const transcript = vi.fn(() => session.transcript())
    const turnTwo = gate()
    const reading = new AbortController()
    const overrides: Partial<SessionViewSource> = {
      transcript,
      // The stream sends a gap, then the backlog of the second turn. The
      // backlog comes only after the transcript loaded again.
      events: () =>
        (async function* () {
          await turnTwo.opened
          yield gapEvent(session.threadId, '0', before, 'evicted')
          await waitFor(() => expect(transcript).toHaveBeenCalledTimes(2))
          await new Promise((resolve) => setTimeout(resolve, 20))
          yield* session.events({ from: before, signal: reading.signal })
        })(),
    }
    const source = new Proxy(session, {
      get: (target, key) => {
        if (key in overrides) return overrides[key as keyof SessionViewSource]
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const view = createSessionView(source)
    await view.ready
    await session.send('Two.')
    turnTwo.open()

    const replies = () =>
      view.store
        .get()
        .messages.filter((message) => message.role === 'assistant')
    await waitFor(() => expect(JSON.stringify(replies())).toContain('Second.'))
    // The backlog events had time to apply.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(replies()).toHaveLength(2)
    view.dispose()
    reading.abort()
    await session.close()
    await host.close()
  })
})
