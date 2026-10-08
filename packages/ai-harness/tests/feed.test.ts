import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { SessionFeed } from '../src/feed'
import type { StreamChunk } from '@tanstack/ai'

const custom = (name: string): StreamChunk => ({
  type: EventType.CUSTOM,
  name,
  value: {},
  timestamp: Date.now(),
})

describe('SessionFeed', () => {
  it('delivers events published while a reader handles earlier ones', async () => {
    const feed = new SessionFeed()
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
    const feed = new SessionFeed()
    feed.publish('a', custom('one'))
    feed.publish('b', custom('two'))
    feed.publish('a', custom('three'))
    feed.close()
    const names: Array<string> = []
    for await (const entry of feed.read({
      from: '1',
      filter: (item) => item.operationId === 'a',
    })) {
      names.push(entry.event.type === EventType.CUSTOM ? entry.event.name : '')
    }
    expect(names).toEqual(['three'])
    expect(feed.head()).toBe('3')
  })
})
