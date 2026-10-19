import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { SessionFeed } from '../src/feed'
import { OperationImpl } from '../src/operation'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '../src/types'

/** Room for every event of a test. */
const EVENT_BYTES = 1_000_000

/** A custom event. Names of one length give events of one JSON length. */
const custom = (name: string): StreamChunk => ({
  type: EventType.CUSTOM,
  name,
  value: {},
  timestamp: 0,
})

/** The names of the custom events that `events` yields, until it ends. */
async function namesOf(events: AsyncIterable<SessionEvent>) {
  const names: Array<string> = []
  for await (const entry of events) {
    names.push(entry.event.type === EventType.CUSTOM ? entry.event.name : '')
  }
  return names
}

describe('SessionFeed', () => {
  it('delivers events published while a reader handles earlier ones', async () => {
    const feed = new SessionFeed({ threadId: 't1', eventBytes: EVENT_BYTES })
    const controller = new AbortController()
    const seen: Array<string> = []
    const reading = (async () => {
      for await (const entry of feed.read({ signal: controller.signal })) {
        seen.push(entry.event.type === EventType.CUSTOM ? entry.event.name : '')
        // Two more events arrive while this one is handled, and nothing after.
        if (seen.length === 1) {
          await Promise.resolve()
          feed.publish('op', custom('second'))
          feed.publish('op', custom('third'))
        }
      }
    })()
    feed.publish('op', custom('first'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen).toEqual(['first', 'second', 'third'])
    controller.abort()
    await reading
  })

  it('skips filtered events and replays from a cursor', async () => {
    const feed = new SessionFeed({ threadId: 't1', eventBytes: EVENT_BYTES })
    feed.publish('a', custom('one'))
    feed.publish('b', custom('two'))
    feed.publish('a', custom('three'))
    feed.close()
    const names = await namesOf(
      feed.read({ from: '1', filter: (item) => item.operationId === 'a' }),
    )
    expect(names).toEqual(['three'])
    expect(feed.head()).toBe('3')
  })

  it('keeps the newest events that fit in eventBytes, and starts an older cursor with a gap at the oldest kept', async () => {
    const size = JSON.stringify(custom('e1')).length
    const feed = new SessionFeed({ threadId: 't1', eventBytes: size * 3 })
    for (const name of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      feed.publish('op', custom(name))
    }
    feed.close()

    expect(await namesOf(feed.read({ from: '0' }))).toEqual([
      'harness.gap',
      'e3',
      'e4',
      'e5',
    ])
    expect(await namesOf(feed.read({ from: '3' }))).toEqual(['e4', 'e5'])
    expect(feed.head()).toBe('5')
  })

  it('keeps the newest event when it alone is larger than eventBytes', async () => {
    const feed = new SessionFeed({ threadId: 't1', eventBytes: 1 })
    feed.publish('op', custom('e1'))
    feed.publish('op', custom('e2'))
    feed.close()

    expect(await namesOf(feed.read({ from: '0' }))).toEqual([
      'harness.gap',
      'e2',
    ])
  })

  it('ends a read when wake() finds until() true, with no new event', async () => {
    const feed = new SessionFeed({ threadId: 't1', eventBytes: EVENT_BYTES })
    let done = false
    const reading = (async () => {
      let count = 0
      for await (const _entry of feed.read({ until: () => done })) count += 1
      return count
    })()
    feed.publish('a', custom('one'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    done = true
    feed.wake()
    expect(await reading).toBe(1)
  })
})

describe('operation stream', () => {
  it('starts at the operation start, so an older event of its id does not show', async () => {
    const feed = new SessionFeed({ threadId: 't1', eventBytes: EVENT_BYTES })
    // A restart builds an operation again with its stored id.
    feed.publish('op-1', custom('before'))
    const operation = new OperationImpl<undefined>(
      'chat',
      Object.assign(feed, { listen: () => () => {} }),
      () => Promise.reject(new Error('no cancel')),
      undefined,
      'op-1',
    )
    feed.publish('op-1', custom('after'))
    operation.finish('completed', undefined)

    const names: Array<string> = []
    for await (const event of operation.stream())
      names.push(event.type === EventType.CUSTOM ? event.name : '')
    expect(names).toEqual(['after'])
  })
})
