import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient, normalizeQueueOption } from '../src/chat-client'
import { createTextChunks } from './test-utils'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

describe('normalizeQueueOption', () => {
  it('defaults to queue + fifo + reject', () => {
    expect(normalizeQueueOption(undefined)).toEqual({
      whenBusy: 'queue',
      drain: 'fifo',
      onOverflow: 'reject',
    })
  })

  it('treats a string as whenBusy shorthand', () => {
    expect(normalizeQueueOption('interrupt')).toMatchObject({
      whenBusy: 'interrupt',
      drain: 'fifo',
    })
  })

  it('carries a function as strategy and forces fifo', () => {
    const fn = () => ({ action: 'queue' as const })
    const cfg = normalizeQueueOption(fn)
    expect(cfg.strategy).toBe(fn)
    expect(cfg.drain).toBe('fifo')
  })

  it('merges a config object over defaults', () => {
    expect(normalizeQueueOption({ whenBusy: 'drop', maxSize: 3 })).toEqual({
      whenBusy: 'drop',
      drain: 'fifo',
      onOverflow: 'reject',
      maxSize: 3,
    })
  })

  it('rejects invalid maxSize', () => {
    expect(() => normalizeQueueOption({ maxSize: -1 })).toThrow(/maxSize/)
    expect(() => normalizeQueueOption({ maxSize: 1.5 })).toThrow(/maxSize/)
  })
})

/**
 * Creates a deferred promise. `resolve` releases anything awaiting `promise`.
 */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

/**
 * A `ConnectConnectionAdapter` whose stream stays open (keeping `isLoading`
 * true) until `release()` is called, at which point it finishes with a
 * simple text response.
 */
function createHoldingConnection(): {
  connection: ConnectConnectionAdapter
  release: () => void
} {
  const deferred = createDeferred<void>()
  const connection: ConnectConnectionAdapter = {
    async *connect() {
      await deferred.promise
      yield* createTextChunks('done', 'msg-1')
    },
  }
  return { connection, release: () => deferred.resolve() }
}

describe('ChatClient message queue', () => {
  it('enqueues (not drops) a send while streaming and reports via onQueueChange', async () => {
    const { connection, release } = createHoldingConnection()
    const onQueueChange = vi.fn()
    const client = new ChatClient({ connection, onQueueChange })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('second')

    const queue = client.getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]?.content).toBe('second')
    expect(onQueueChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ content: 'second' })]),
    )
    expect(onQueueChange.mock.calls.at(-1)?.[0]).toHaveLength(1)

    release()
    await firstSend
  })

  it('cancelQueued removes a queued item before it drains', async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('second')
    const queued = client.getQueue()
    expect(queued).toHaveLength(1)
    const queuedId = queued[0]!.id

    client.cancelQueued(queuedId)
    expect(client.getQueue()).toEqual([])

    release()
    await firstSend
  })

  it("whenBusy: 'drop' ignores a mid-stream send", async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({ connection, queue: 'drop' })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('second')
    expect(client.getQueue()).toEqual([])

    release()
    await firstSend

    // The dropped message must never have become a real message either —
    // it should be gone entirely, not just missing from the queue.
    const userMessages = client.getMessages().filter((m) => m.role === 'user')
    expect(userMessages.map((m) => m.parts[0])).toEqual([
      { type: 'text', content: 'first' },
    ])
  })
})

/**
 * Like {@link createHoldingConnection}, but only the first `connect()` call
 * waits on the deferred; every subsequent call (i.e. a drained queue item's
 * own send) resolves immediately with a unique messageId so chained drains
 * don't collide on the same assistant message id.
 */
function createSequencedHoldingConnection(): {
  connection: ConnectConnectionAdapter
  release: () => void
} {
  const deferred = createDeferred<void>()
  let call = 0
  const connection: ConnectConnectionAdapter = {
    async *connect() {
      call += 1
      if (call === 1) {
        await deferred.promise
      }
      yield* createTextChunks('done', `msg-${call}`)
    },
  }
  return { connection, release: () => deferred.resolve() }
}

/**
 * Like {@link createHoldingConnection}, but `release()` settles the stream
 * with a `RUN_ERROR` chunk instead of a successful text response.
 */
function createErroringHoldingConnection(): {
  connection: ConnectConnectionAdapter
  release: () => void
} {
  const deferred = createDeferred<void>()
  const connection: ConnectConnectionAdapter = {
    async *connect(): AsyncGenerator<StreamChunk> {
      await deferred.promise
      yield {
        type: EventType.RUN_ERROR,
        threadId: 'thread-1',
        timestamp: Date.now(),
        message: 'boom',
        error: { message: 'boom' },
      }
    },
  }
  return { connection, release: () => deferred.resolve() }
}

describe('ChatClient queue drain', () => {
  it('drains FIFO after the stream settles, in order', async () => {
    const { connection, release } = createSequencedHoldingConnection()
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('second')
    await client.sendMessage('third')
    expect(client.getQueue().map((m) => m.content)).toEqual(['second', 'third'])

    release()
    await firstSend

    expect(client.getQueue()).toEqual([])
    const userMessages = client.getMessages().filter((m) => m.role === 'user')
    expect(userMessages.map((m) => m.parts[0])).toEqual([
      { type: 'text', content: 'first' },
      { type: 'text', content: 'second' },
      { type: 'text', content: 'third' },
    ])
  })

  it('batch drain merges string queued items with newlines', async () => {
    const { connection, release } = createSequencedHoldingConnection()
    const client = new ChatClient({ connection, queue: { drain: 'batch' } })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('a')
    await client.sendMessage('b')
    expect(client.getQueue().map((m) => m.content)).toEqual(['a', 'b'])

    release()
    await firstSend

    expect(client.getQueue()).toEqual([])
    const userMessages = client.getMessages().filter((m) => m.role === 'user')
    expect(userMessages).toHaveLength(2)
    expect(userMessages[1]?.parts[0]).toEqual({
      type: 'text',
      content: 'a\nb',
    })
  })

  it('batch drain flattens multimodal queued items into ContentPart[]', async () => {
    const { connection, release } = createSequencedHoldingConnection()
    const client = new ChatClient({ connection, queue: { drain: 'batch' } })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    // Queued item 1: multimodal content (array of ContentPart).
    await client.sendMessage({
      content: [
        { type: 'text', content: 'look' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/a.png' },
        },
      ],
    })
    // Queued item 2: plain string content.
    await client.sendMessage('note')
    expect(client.getQueue()).toHaveLength(2)

    release()
    await firstSend

    expect(client.getQueue()).toEqual([])
    const userMessages = client.getMessages().filter((m) => m.role === 'user')
    // 'first' streamed immediately; the two queued sends above are merged
    // into a single batched send, so there should be exactly 2 user messages.
    expect(userMessages).toHaveLength(2)
    // The merged message's parts must be the multimodal item's parts
    // (flattened, in order) followed by the string item flattened to text —
    // proving the MULTIMODAL branch of `mergeQueuedMessages` ran, not just
    // the all-string join.
    expect(userMessages[1]?.parts).toEqual([
      { type: 'text', content: 'look' },
      {
        type: 'image',
        source: { type: 'url', value: 'https://example.com/a.png' },
      },
      { type: 'text', content: 'note' },
    ])
  })

  it('flushes the queue on stop()', async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('second')
    expect(client.getQueue()).toHaveLength(1)

    client.stop()
    expect(client.getQueue()).toEqual([])

    // Let the held-open stream settle so it doesn't leak into other tests.
    release()
    await firstSend
  })

  it('flushes the queue when the stream errors', async () => {
    const { connection, release } = createErroringHoldingConnection()
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('second')
    expect(client.getQueue()).toHaveLength(1)

    release()
    await firstSend

    // The queue must be flushed, not stranded or auto-drained into the
    // now-broken endpoint.
    expect(client.getQueue()).toEqual([])
    const userMessages = client.getMessages().filter((m) => m.role === 'user')
    expect(userMessages.map((m) => m.parts[0])).toEqual([
      { type: 'text', content: 'first' },
    ])
  })

  it('flushes the queue on clear()', async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('second')
    expect(client.getQueue()).toHaveLength(1)

    client.clear()
    expect(client.getQueue()).toEqual([])

    release()
    await firstSend
  })
})

describe('ChatClient queue policy branches', () => {
  it("whenBusy: 'interrupt' aborts the in-flight stream and sends immediately", async () => {
    const { connection, release } = createSequencedHoldingConnection()
    const client = new ChatClient({ connection, queue: 'interrupt' })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    const secondSend = client.sendMessage('urgent')
    // Interrupt does not enqueue.
    expect(client.getQueue()).toEqual([])

    // The interrupting send should be in messages immediately (and loading).
    await vi.waitFor(() => {
      const users = client.getMessages().filter((m) => m.role === 'user')
      expect(users.map((m) => m.parts[0])).toEqual([
        { type: 'text', content: 'first' },
        { type: 'text', content: 'urgent' },
      ])
    })

    release()
    await Promise.all([firstSend, secondSend])

    expect(client.getQueue()).toEqual([])
  })

  it('per-call whenBusy override beats the client default', async () => {
    const { connection, release } = createSequencedHoldingConnection()
    // Default is queue; override one send to interrupt.
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('queued-one')
    expect(client.getQueue()).toHaveLength(1)

    const interruptSend = client.sendMessage('urgent', undefined, {
      whenBusy: 'interrupt',
    })
    // Interrupt does not flush existing queue; item stays pending.
    expect(client.getQueue()).toHaveLength(1)

    release()
    await Promise.all([firstSend, interruptSend])

    // After interrupt settles, the previously queued item drains.
    await vi.waitFor(() => {
      expect(client.getQueue()).toEqual([])
    })

    const userMessages = client.getMessages().filter((m) => m.role === 'user')
    expect(userMessages.map((m) => m.parts[0])).toEqual([
      { type: 'text', content: 'first' },
      { type: 'text', content: 'urgent' },
      { type: 'text', content: 'queued-one' },
    ])
  })

  it("maxSize + onOverflow: 'reject' drops the newest when full", async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({
      connection,
      queue: { maxSize: 1, onOverflow: 'reject' },
    })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('a')
    await client.sendMessage('b')
    expect(client.getQueue().map((m) => m.content)).toEqual(['a'])

    release()
    await firstSend
  })

  it("maxSize + onOverflow: 'drop-oldest' rotates the queue", async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({
      connection,
      queue: { maxSize: 1, onOverflow: 'drop-oldest' },
    })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('a')
    await client.sendMessage('b')
    expect(client.getQueue().map((m) => m.content)).toEqual(['b'])

    release()
    await firstSend
  })

  it('maxSize: 0 never enqueues under drop-oldest', async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({
      connection,
      queue: { maxSize: 0, onOverflow: 'drop-oldest' },
    })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('should-not-queue')
    expect(client.getQueue()).toEqual([])

    release()
    await firstSend
  })

  it('QueueStrategy pending.id matches the enqueued item id', async () => {
    const { connection, release } = createHoldingConnection()
    let seenId: string | undefined
    let seenBusyReason: string | undefined
    const client = new ChatClient({
      connection,
      queue: ({ pending, busyReason }) => {
        seenId = pending.id
        seenBusyReason = busyReason
        return { action: 'queue' }
      },
    })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('second')
    const queue = client.getQueue()
    expect(queue).toHaveLength(1)
    expect(seenId).toBe(queue[0]?.id)
    expect(seenBusyReason).toBe('streaming')

    // cancelQueued with the strategy-visible id must work.
    client.cancelQueued(seenId!)
    expect(client.getQueue()).toEqual([])

    release()
    await firstSend
  })

  it('QueueStrategy drop and per-call whenBusy override', async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({
      connection,
      queue: () => ({ action: 'drop' }),
    })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('ignored-by-strategy')
    expect(client.getQueue()).toEqual([])

    // Per-call override beats strategy.
    await client.sendMessage('queued-via-override', undefined, {
      whenBusy: 'queue',
    })
    expect(client.getQueue().map((m) => m.content)).toEqual([
      'queued-via-override',
    ])

    release()
    await firstSend
  })

  it('concurrent rapid sends do not strand user messages without streams', async () => {
    const { connection, release } = createSequencedHoldingConnection()
    const client = new ChatClient({ connection })

    // Fire several sends without awaiting between them (composer spam).
    const sends = [
      client.sendMessage('first'),
      client.sendMessage('second'),
      client.sendMessage('third'),
    ]

    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    // While the first stream is open, at least one of the later sends must be
    // sitting in the queue (not all three racing as concurrent streams).
    await vi.waitFor(() => {
      expect(client.getQueue().length).toBeGreaterThanOrEqual(1)
    })

    release()
    await Promise.all(sends)

    // Every user message must have been delivered with no stranded leftovers
    // in the queue, and all three must appear in order.
    expect(client.getQueue()).toEqual([])
    const userMessages = client.getMessages().filter((m) => m.role === 'user')
    expect(userMessages.map((m) => m.parts[0])).toEqual([
      { type: 'text', content: 'first' },
      { type: 'text', content: 'second' },
      { type: 'text', content: 'third' },
    ])
    // Each user message should have a corresponding assistant reply after
    // the full FIFO drain completes.
    const assistantMessages = client
      .getMessages()
      .filter((m) => m.role === 'assistant')
    expect(assistantMessages.length).toBe(3)
  })

  it('flushes the queue on reload()', async () => {
    const { connection, release } = createSequencedHoldingConnection()
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('queued')
    expect(client.getQueue()).toHaveLength(1)

    // Reload while the first stream is held open and something is queued.
    const reloadPromise = client.reload()
    expect(client.getQueue()).toEqual([])

    release()
    await Promise.all([firstSend, reloadPromise])
    expect(client.getQueue()).toEqual([])
  })

  it('flushes the queue on unsubscribe()', async () => {
    const { connection, release } = createHoldingConnection()
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('queued')
    expect(client.getQueue()).toHaveLength(1)

    client.unsubscribe()
    expect(client.getQueue()).toEqual([])

    release()
    await firstSend
  })

  it('preserves per-message body through FIFO drain and batch last-wins', async () => {
    const seenBodies: Array<Record<string, unknown> | undefined> = []
    const deferred = createDeferred<void>()
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, data) {
        call += 1
        seenBodies.push(
          data && typeof data === 'object'
            ? (data as Record<string, unknown>)
            : undefined,
        )
        if (call === 1) {
          await deferred.promise
        }
        yield* createTextChunks('done', `msg-${call}`)
      },
    }

    // FIFO: each drained send keeps its own body.
    const fifoClient = new ChatClient({ connection })
    const firstFifo = fifoClient.sendMessage('first', { tag: 'seed' })
    await vi.waitFor(() => {
      expect(fifoClient.getIsLoading()).toBe(true)
    })
    await fifoClient.sendMessage('a', { tag: 'a' })
    await fifoClient.sendMessage('b', { tag: 'b' })
    deferred.resolve()
    await firstFifo
    await vi.waitFor(() => {
      expect(fifoClient.getQueue()).toEqual([])
    })
    // First send + two drained: tags seed, a, b (merged with base body).
    expect(seenBodies.map((b) => b?.tag)).toEqual(['seed', 'a', 'b'])

    // Batch: last item's body wins.
    seenBodies.length = 0
    call = 0
    const deferredBatch = createDeferred<void>()
    const batchConnection: ConnectConnectionAdapter = {
      async *connect(_messages, data) {
        call += 1
        seenBodies.push(
          data && typeof data === 'object'
            ? (data as Record<string, unknown>)
            : undefined,
        )
        if (call === 1) {
          await deferredBatch.promise
        }
        yield* createTextChunks('done', `batch-${call}`)
      },
    }
    const batchClient = new ChatClient({
      connection: batchConnection,
      queue: { drain: 'batch' },
    })
    const firstBatch = batchClient.sendMessage('first', { tag: 'seed' })
    await vi.waitFor(() => {
      expect(batchClient.getIsLoading()).toBe(true)
    })
    await batchClient.sendMessage('x', { tag: 'x' })
    await batchClient.sendMessage('y', { tag: 'y' })
    deferredBatch.resolve()
    await firstBatch
    await vi.waitFor(() => {
      expect(batchClient.getQueue()).toEqual([])
    })
    expect(seenBodies.map((b) => b?.tag)).toEqual(['seed', 'y'])
  })

  it('batch drain does not strand messages enqueued during the batch stream', async () => {
    const deferred1 = createDeferred<void>()
    const deferred2 = createDeferred<void>()
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect() {
        call += 1
        if (call === 1) {
          await deferred1.promise
        } else if (call === 2) {
          await deferred2.promise
        }
        yield* createTextChunks('done', `msg-${call}`)
      },
    }
    const client = new ChatClient({ connection, queue: { drain: 'batch' } })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })
    await client.sendMessage('a')
    await client.sendMessage('b')

    deferred1.resolve()
    // Wait until the batch of a+b is streaming.
    await vi.waitFor(() => {
      const users = client.getMessages().filter((m) => m.role === 'user')
      expect(users).toHaveLength(2)
      expect(users[1]?.parts[0]).toEqual({ type: 'text', content: 'a\nb' })
      expect(client.getIsLoading()).toBe(true)
    })

    await client.sendMessage('during-batch')
    expect(client.getQueue().map((m) => m.content)).toEqual(['during-batch'])

    deferred2.resolve()
    await firstSend
    await vi.waitFor(() => {
      expect(client.getQueue()).toEqual([])
    })

    const users = client.getMessages().filter((m) => m.role === 'user')
    expect(users.map((m) => m.parts[0])).toEqual([
      { type: 'text', content: 'first' },
      { type: 'text', content: 'a\nb' },
      { type: 'text', content: 'during-batch' },
    ])
  })

  it('error during FIFO drain flushes remaining queued items', async () => {
    const deferred = createDeferred<void>()
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(): AsyncGenerator<StreamChunk> {
        call += 1
        if (call === 1) {
          await deferred.promise
          yield* createTextChunks('done', 'msg-1')
          return
        }
        if (call === 2) {
          yield {
            type: EventType.RUN_ERROR,
            threadId: 'thread-1',
            timestamp: Date.now(),
            message: 'boom',
            error: { message: 'boom' },
          }
          return
        }
        yield* createTextChunks('should-not-run', `msg-${call}`)
      },
    }
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })
    await client.sendMessage('drains-then-errors')
    await client.sendMessage('should-be-flushed')
    expect(client.getQueue()).toHaveLength(2)

    deferred.resolve()
    await firstSend
    await vi.waitFor(() => {
      expect(client.getQueue()).toEqual([])
    })

    const users = client.getMessages().filter((m) => m.role === 'user')
    // first + the drained item that errored; the third never sends.
    expect(users.map((m) => m.parts[0])).toEqual([
      { type: 'text', content: 'first' },
      { type: 'text', content: 'drains-then-errors' },
    ])
  })

  it('interrupt during FIFO drain keeps remaining items for after the interrupt', async () => {
    const deferred1 = createDeferred<void>()
    const deferred2 = createDeferred<void>()
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect() {
        call += 1
        if (call === 1) {
          await deferred1.promise
        } else if (call === 2) {
          await deferred2.promise
        }
        yield* createTextChunks('done', `msg-${call}`)
      },
    }
    const client = new ChatClient({ connection })

    const firstSend = client.sendMessage('first')
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(true)
    })
    await client.sendMessage('second')
    await client.sendMessage('third')

    deferred1.resolve()
    // Wait until FIFO drain has started streaming "second".
    await vi.waitFor(() => {
      const users = client.getMessages().filter((m) => m.role === 'user')
      expect(users.map((m) => m.parts[0])).toEqual([
        { type: 'text', content: 'first' },
        { type: 'text', content: 'second' },
      ])
      expect(client.getIsLoading()).toBe(true)
    })
    // "third" should still be queued while "second" streams.
    expect(client.getQueue().map((m) => m.content)).toEqual(['third'])

    const interruptSend = client.sendMessage('urgent', undefined, {
      whenBusy: 'interrupt',
    })
    // Interrupt does not flush remaining queue.
    expect(client.getQueue().map((m) => m.content)).toEqual(['third'])

    deferred2.resolve()
    await Promise.all([firstSend, interruptSend])
    await vi.waitFor(() => {
      expect(client.getQueue()).toEqual([])
    })

    const users = client.getMessages().filter((m) => m.role === 'user')
    expect(users.map((m) => m.parts[0])).toEqual([
      { type: 'text', content: 'first' },
      { type: 'text', content: 'second' },
      { type: 'text', content: 'urgent' },
      { type: 'text', content: 'third' },
    ])
  })
})
