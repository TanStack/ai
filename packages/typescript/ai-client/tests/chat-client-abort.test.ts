import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import type { ConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai'

describe('ChatClient - Abort Signal Handling', () => {
  let mockAdapter: ConnectionAdapter
  let receivedAbortSignal: AbortSignal | undefined

  beforeEach(() => {
    receivedAbortSignal = undefined

    mockAdapter = {
      // eslint-disable-next-line @typescript-eslint/require-await
      async *connect(_messages, _data, abortSignal) {
        receivedAbortSignal = abortSignal

        // Simulate streaming chunks (AG-UI format)
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: '1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
          content: 'Hello',
        }
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: '1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' World',
          content: 'Hello World',
        }
        yield {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        }
      },
    }
  })

  it('should create AbortController and pass signal to adapter', async () => {
    const client = new ChatClient({
      connection: mockAdapter,
    })

    const appendPromise = client.append({
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello' }],
      createdAt: new Date(),
    })

    // Wait a bit to ensure connect is called
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(receivedAbortSignal).toBeDefined()
    expect(receivedAbortSignal).toBeInstanceOf(AbortSignal)
    expect(receivedAbortSignal?.aborted).toBe(false)

    await appendPromise
  })

  it('should abort request when stop() is called', async () => {
    let abortControllerRef: AbortController | null = null

    const adapterWithAbort: ConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        abortControllerRef = new AbortController()
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            abortControllerRef?.abort()
          })
        }

        try {
          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: '1',
            model: 'test',
            timestamp: Date.now(),
            delta: 'Hello',
            content: 'Hello',
          }
          // Simulate long-running stream
          await new Promise((resolve) => setTimeout(resolve, 100))
          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: '1',
            model: 'test',
            timestamp: Date.now(),
            delta: ' World',
            content: 'Hello World',
          }
        } catch (err) {
          // Abort errors are expected
          if (err instanceof Error && err.name === 'AbortError') {
            return
          }
          throw err
        }
      },
    }

    const client = new ChatClient({
      connection: adapterWithAbort,
    })

    const appendPromise = client.append({
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello' }],
      createdAt: new Date(),
    })

    // Wait a bit then stop
    await new Promise((resolve) => setTimeout(resolve, 10))
    client.stop()

    await appendPromise

    expect(client.getIsLoading()).toBe(false)
  })

  it('should preserve partial content when aborted', async () => {
    const chunks: Array<StreamChunk> = []
    let yieldedChunks = 0

    const adapterWithPartial: ConnectionAdapter = {
      // eslint-disable-next-line @typescript-eslint/require-await
      async *connect(_messages, _data, abortSignal) {
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: '1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
          content: 'Hello',
        }
        yieldedChunks++

        if (abortSignal?.aborted) {
          return
        }

        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: '1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' World',
          content: 'Hello World',
        }
        yieldedChunks++
      },
    }

    const client = new ChatClient({
      connection: adapterWithPartial,
      onChunk: (chunk) => {
        chunks.push(chunk)
      },
    })

    const appendPromise = client.append({
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello' }],
      createdAt: new Date(),
    })

    // Wait for first chunk then abort
    await new Promise((resolve) => setTimeout(resolve, 10))
    client.stop()

    await appendPromise

    // Should have received at least one chunk before abort
    expect(chunks.length).toBeGreaterThan(0)
    expect(client.getMessages().length).toBeGreaterThan(0)
  })

  it('should handle abort gracefully without throwing error', async () => {
    const errorSpy = vi.fn()

    const adapterWithAbort: ConnectionAdapter = {
      // eslint-disable-next-line @typescript-eslint/require-await
      async *connect(_messages, _data, abortSignal) {
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: '1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
          content: 'Hello',
        }

        if (abortSignal?.aborted) {
          return
        }
      },
    }

    const client = new ChatClient({
      connection: adapterWithAbort,
      onError: errorSpy,
    })

    const appendPromise = client.append({
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello' }],
      createdAt: new Date(),
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    client.stop()

    await appendPromise

    // Should not have called onError for abort
    expect(errorSpy).not.toHaveBeenCalled()
    expect(client.getError()).toBeUndefined()
  })

  it('should set isLoading to false after abort', async () => {
    const adapterWithAbort: ConnectionAdapter = {
      async *connect(_messages, _data, _abortSignal) {
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: '1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
          content: 'Hello',
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      },
    }

    const client = new ChatClient({
      connection: adapterWithAbort,
    })

    const appendPromise = client.append({
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello' }],
      createdAt: new Date(),
    })

    expect(client.getIsLoading()).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 10))
    client.stop()

    await appendPromise

    expect(client.getIsLoading()).toBe(false)
  })

  it('should create new AbortController for each request', async () => {
    const abortSignals: Array<AbortSignal> = []

    const adapter: ConnectionAdapter = {
      // eslint-disable-next-line @typescript-eslint/require-await
      async *connect(_messages, _data, abortSignal) {
        if (abortSignal) {
          abortSignals.push(abortSignal)
        }
        yield {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        }
      },
    }

    const client = new ChatClient({
      connection: adapter,
    })

    // First request
    await client.append({
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello 1' }],
      createdAt: new Date(),
    })

    // Second request
    await client.append({
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello 2' }],
      createdAt: new Date(),
    })

    expect(abortSignals.length).toBe(2)
    // Each should be a different signal instance
    expect(abortSignals[0]).not.toBe(abortSignals[1])
  })
})
