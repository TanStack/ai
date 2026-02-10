import { describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '../src/session-adapter'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'
import type { StreamChunk } from '@tanstack/ai'

describe('createDefaultSession', () => {
  it('should yield chunks sent through send() via subscribe()', async () => {
    const chunks = createTextChunks('Hi', 'msg-1')
    const connection = createMockConnectionAdapter({ chunks })
    const session = createDefaultSession(connection)

    const abortController = new AbortController()
    const iterator = session.subscribe(abortController.signal)

    // Send messages — this pushes all chunks into the queue
    await session.send([], undefined)

    // Collect chunks from the subscription
    const received: Array<StreamChunk> = []
    for await (const chunk of iterator) {
      received.push(chunk)
      // Stop after receiving all expected chunks
      if (received.length === chunks.length) {
        abortController.abort()
      }
    }

    expect(received).toEqual(chunks)
  })

  it('should deliver chunks from multiple sends in order', async () => {
    const chunks1: Array<StreamChunk> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'A',
        content: 'A',
      },
    ]
    const chunks2: Array<StreamChunk> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-2',
        model: 'test',
        timestamp: Date.now(),
        delta: 'B',
        content: 'B',
      },
    ]

    let callCount = 0
    const connection = createMockConnectionAdapter({
      chunks: [], // overridden below
    })
    // Override connect to return different chunks per call
    connection.connect = function (_messages, _data, _signal) {
      callCount++
      const currentChunks = callCount === 1 ? chunks1 : chunks2
      return (async function* () {
        for (const chunk of currentChunks) {
          yield chunk
        }
      })()
    }

    const session = createDefaultSession(connection)
    const abortController = new AbortController()
    const iterator = session.subscribe(abortController.signal)

    // Send both in sequence
    await session.send([], undefined)
    await session.send([], undefined)

    const received: Array<StreamChunk> = []
    for await (const chunk of iterator) {
      received.push(chunk)
      if (received.length === 2) {
        abortController.abort()
      }
    }

    expect(received).toEqual([...chunks1, ...chunks2])
  })

  it('should stop the iterator when the abort signal fires', async () => {
    const connection = createMockConnectionAdapter({ chunks: [] })
    const session = createDefaultSession(connection)

    const abortController = new AbortController()
    const iterator = session.subscribe(abortController.signal)

    // Abort immediately — the iterator should stop without yielding
    abortController.abort()

    const received: Array<StreamChunk> = []
    for await (const chunk of iterator) {
      received.push(chunk)
    }

    expect(received).toEqual([])
  })

  it('should abort a waiting subscriber', async () => {
    const connection = createMockConnectionAdapter({ chunks: [] })
    const session = createDefaultSession(connection)

    const abortController = new AbortController()
    const iterator = session.subscribe(abortController.signal)

    // Start consuming — this will block waiting for chunks
    const resultPromise = (async () => {
      const received: Array<StreamChunk> = []
      for await (const chunk of iterator) {
        received.push(chunk)
      }
      return received
    })()

    // Let the subscriber start waiting
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Abort — should unblock the subscriber
    abortController.abort()

    const received = await resultPromise
    expect(received).toEqual([])
  })

  it('should propagate errors from connection.connect() through send()', async () => {
    const testError = new Error('connection failed')
    const connection = createMockConnectionAdapter({
      shouldError: true,
      error: testError,
    })
    const session = createDefaultSession(connection)

    await expect(session.send([], undefined)).rejects.toThrow(
      'connection failed',
    )
  })

  it('should buffer chunks when subscriber is not yet consuming', async () => {
    const chunks = createTextChunks('AB', 'msg-1')
    const connection = createMockConnectionAdapter({ chunks })
    const session = createDefaultSession(connection)

    // Send first, before subscribing
    await session.send([], undefined)

    // Now subscribe and consume
    const abortController = new AbortController()
    const iterator = session.subscribe(abortController.signal)

    const received: Array<StreamChunk> = []
    for await (const chunk of iterator) {
      received.push(chunk)
      if (received.length === chunks.length) {
        abortController.abort()
      }
    }

    expect(received).toEqual(chunks)
  })

  it('should pass messages and data through to connection.connect()', async () => {
    const onConnect = vi.fn()
    const connection = createMockConnectionAdapter({
      chunks: [
        {
          type: 'RUN_FINISHED',
          runId: 'r1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        },
      ],
      onConnect,
    })
    const session = createDefaultSession(connection)

    const messages = [
      {
        id: 'u1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'hello' }],
      },
    ]
    const data = { model: 'gpt-4o' }

    await session.send(messages, data)

    expect(onConnect).toHaveBeenCalledWith(
      messages,
      data,
      undefined, // signal
    )
  })

  it('should pass abort signal from send() to connection.connect()', async () => {
    const onConnect = vi.fn()
    const connection = createMockConnectionAdapter({
      chunks: [],
      onConnect,
    })
    const session = createDefaultSession(connection)

    const abortController = new AbortController()
    await session.send([], undefined, abortController.signal)

    expect(onConnect).toHaveBeenCalledWith([], undefined, abortController.signal)
  })

  it('should not lose chunks after stop-then-resume subscription cycle', async () => {
    const connection = createMockConnectionAdapter({ chunks: [] })
    const session = createDefaultSession(connection)

    // First subscription — abort while waiting (simulates stop)
    const ac1 = new AbortController()
    const iter1 = session.subscribe(ac1.signal)

    // Start consuming — will block waiting for chunks
    const result1Promise = (async () => {
      const received: Array<StreamChunk> = []
      for await (const chunk of iter1) {
        received.push(chunk)
      }
      return received
    })()

    // Let the subscriber enter the wait path
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Abort — this resolves the dead waiter with null
    ac1.abort()
    const received1 = await result1Promise
    expect(received1).toEqual([])

    // Second subscription — should work correctly
    const ac2 = new AbortController()
    const iter2 = session.subscribe(ac2.signal)

    // Send a chunk — it should be delivered to the new subscriber
    const testChunk: StreamChunk = {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'msg-1',
      model: 'test',
      timestamp: Date.now(),
      delta: 'Hello',
      content: 'Hello',
    }

    // Override connect to yield the test chunk
    connection.connect = function* () {
      yield testChunk
    } as any

    await session.send([], undefined)

    const received2: Array<StreamChunk> = []
    for await (const chunk of iter2) {
      received2.push(chunk)
      if (received2.length === 1) {
        ac2.abort()
      }
    }

    // The chunk should NOT be lost
    expect(received2).toEqual([testChunk])
  })
})
