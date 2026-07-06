import { describe, expect, it, vi } from 'vitest'
import { ChatClient, normalizeQueueOption } from '../src/chat-client'
import { createTextChunks } from './test-utils'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

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
  })
})
