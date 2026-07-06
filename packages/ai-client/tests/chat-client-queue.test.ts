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
    const fn = () => ({ action: 'enqueue' as const })
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
      } as StreamChunk
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
})
