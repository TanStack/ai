import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drainAfterTerminal } from '../src/drain-after-terminal'

interface Event {
  type: string
}

const type = (event: Event) => event.type

/** A body that sends `events` and then stays open until closed or cancelled. */
function body(events: Array<Event>) {
  let close = () => {}
  let cancelled = false
  const stream = new ReadableStream<Event>({
    start(controller) {
      for (const event of events) controller.enqueue(event)
      close = () => controller.close()
    },
    cancel() {
      cancelled = true
    },
  })
  return { stream, close: () => close(), cancelled: () => cancelled }
}

/** An iterable that sends `events`, then waits forever; records `abort` and `return`. */
function iterable(events: Array<Event>) {
  const seen = { aborted: false, returned: false }
  const stream: AsyncIterable<Event> = {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        next: () =>
          i < events.length
            ? Promise.resolve({ done: false, value: events[i++]! })
            : new Promise<IteratorResult<Event>>(() => {}),
        return: () => {
          seen.returned = true
          return Promise.resolve({ done: true, value: undefined })
        },
      }
    },
  }
  return { stream, abort: () => (seen.aborted = true), seen }
}

async function readFirst(events: AsyncIterable<Event>) {
  for await (const _ of events) break
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('drainAfterTerminal', () => {
  it.each([
    'response.completed',
    'response.failed',
    'response.incomplete',
    'error',
  ])('does not cancel a body that ends soon after %s', async (terminal) => {
    const b = body([{ type: terminal }])
    await readFirst(drainAfterTerminal(b.stream, type))
    await vi.advanceTimersByTimeAsync(100)
    b.close()
    await vi.advanceTimersByTimeAsync(500)
    expect(b.cancelled()).toBe(false)
  })

  it('cancels a body that has not ended 250 ms after a terminal event', async () => {
    const b = body([{ type: 'response.completed' }])
    await readFirst(drainAfterTerminal(b.stream, type))
    await vi.advanceTimersByTimeAsync(249)
    expect(b.cancelled()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(b.cancelled()).toBe(true)
  })

  it('cancels at once on a stop after a non-terminal event', async () => {
    const b = body([{ type: 'response.output_text.delta' }])
    await readFirst(drainAfterTerminal(b.stream, type))
    expect(b.cancelled()).toBe(true)
  })

  it('aborts an iterable 250 ms after a terminal event', async () => {
    const src = iterable([{ type: 'response.completed' }])
    await readFirst(drainAfterTerminal(src.stream, type, src.abort))
    expect(src.seen.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(250)
    expect(src.seen.aborted).toBe(true)
    expect(src.seen.returned).toBe(false)
  })

  it('closes an iterable at once when it has no abort', async () => {
    const src = iterable([{ type: 'response.completed' }])
    await readFirst(drainAfterTerminal(src.stream, type))
    expect(src.seen.returned).toBe(true)
  })
})
