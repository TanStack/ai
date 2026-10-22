import { describe, expect, it, vi } from 'vitest'
import { HostEventBus } from '../src/host-event-bus'
import type { Logger } from '@tanstack/ai'
import type { HostEvent } from '../src/host'

/** A status event of `threadId` in `tenantId`. */
const status = (threadId: string, tenantId?: string): HostEvent => ({
  type: 'status',
  threadId,
  status: 'running',
  at: 1,
  ...(tenantId !== undefined ? { tenantId } : {}),
})

/** The thread of a status event. */
const threadOf = (event: HostEvent) =>
  'threadId' in event ? event.threadId : undefined

/** Take `count` events of `read`, then stop it. */
async function take(read: AsyncIterable<HostEvent>, count: number) {
  const seen: Array<HostEvent> = []
  if (count === 0) return seen
  for await (const event of read) {
    seen.push(event)
    if (seen.length === count) break
  }
  return seen
}

describe('the host event bus', () => {
  it('gives a tenant reader the events of its tenant only, and an all-tenants reader every event', async () => {
    const bus = new HostEventBus()
    const ofA = take(bus.read({ tenant: { tenantId: 'a' } }), 1)
    const ofDefault = take(bus.read({ tenant: { tenantId: undefined } }), 1)
    const ofAll = take(bus.read(), 3)
    await Promise.resolve()

    bus.emit(status('t1', 'b'))
    bus.emit(status('t2', 'a'))
    bus.emit(status('t3'))

    expect((await ofA).map(threadOf)).toEqual(['t2'])
    expect((await ofDefault).map(threadOf)).toEqual(['t3'])
    expect((await ofAll).map(threadOf)).toEqual(['t1', 't2', 't3'])
    expect(bus.readers).toBe(0)
  })

  it('filters before the queue, and starts with the initial events', async () => {
    const bus = new HostEventBus()
    const asked: Array<string> = []
    const read = take(
      bus.read({
        initial: [status('t0')],
        filter: (event) => {
          const thread = threadOf(event) ?? ''
          asked.push(thread)
          return thread !== 'skip'
        },
      }),
      2,
    )
    await Promise.resolve()
    bus.emit(status('skip'))
    bus.emit(status('t1'))

    expect((await read).map(threadOf)).toEqual(['t0', 't1'])
    // The filter runs once per emitted event, not for the initial ones.
    expect(asked).toEqual(['skip', 't1'])
  })

  it('ends a reader that falls more than maxQueue events behind, after the events it kept', async () => {
    const bus = new HostEventBus()
    const iterator = bus.read({ maxQueue: 2 })[Symbol.asyncIterator]()
    const first = iterator.next()
    await Promise.resolve()
    bus.emit(status('t1'))
    expect((await first).value?.threadId).toBe('t1')

    // Nobody reads now: two events wait, the third does not fit.
    for (const id of ['t2', 't3', 't4']) bus.emit(status(id))

    expect((await iterator.next()).value?.threadId).toBe('t2')
    expect((await iterator.next()).value?.threadId).toBe('t3')
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
    expect(bus.readers).toBe(0)
  })

  it('does not count the initial events against maxQueue', async () => {
    const bus = new HostEventBus()
    const read = bus.read({
      initial: [status('t0'), status('t1')],
      maxQueue: 1,
    })
    bus.emit(status('t2'))

    expect((await take(read, 3)).map(threadOf)).toEqual(['t0', 't1', 't2'])
  })

  it('keeps an event emitted after the read starts but before the first pull', async () => {
    const bus = new HostEventBus()
    const read = bus.read({ initial: [status('t0')] })
    bus.emit(status('t1'))

    expect((await take(read, 2)).map(threadOf)).toEqual(['t0', 't1'])
    expect(bus.readers).toBe(0)
  })

  it('logs a reader that throws to its logger, and the other readers still get the event', async () => {
    const error = vi.fn<Logger['error']>()
    const bus = new HostEventBus({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error,
    })
    const failure = new Error('The filter broke.')
    void bus.read({
      filter: () => {
        throw failure
      },
    })
    const other = take(bus.read(), 1)
    await Promise.resolve()

    bus.emit(status('t1'))

    expect((await other).map(threadOf)).toEqual(['t1'])
    expect(error).toHaveBeenCalledWith(
      '[@tanstack/ai-harness] A host events reader threw.',
      { error: failure },
    )
  })

  it('stops a read when its signal aborts', async () => {
    const bus = new HostEventBus()
    const controller = new AbortController()
    const next = bus
      .read({ signal: controller.signal })
      [Symbol.asyncIterator]()
      .next()
    await Promise.resolve()
    controller.abort()

    expect(await next).toEqual({ done: true, value: undefined })
    expect(bus.readers).toBe(0)
  })
})
