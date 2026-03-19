import { describe, it, expect, vi } from 'vitest'
import { GenerationClient } from '../src/generation-client'
import type { StreamChunk } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

// Helper to create a mock connect-based adapter from StreamChunks
function createMockConnection(
  chunks: Array<StreamChunk>,
): ConnectConnectionAdapter {
  return {
    async *connect() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('GenerationClient', () => {
  describe('fetcher mode', () => {
    it('should generate a result using fetcher', async () => {
      const mockResult = { id: '1', images: [] }
      const onResult = vi.fn()
      const onResultChange = vi.fn()

      const client = new GenerationClient({
        fetcher: async () => mockResult,
        onResult,
        onResultChange,
      })

      await client.generate({ prompt: 'test' })

      expect(onResult).toHaveBeenCalledWith(mockResult)
      expect(onResultChange).toHaveBeenCalledWith(mockResult)
      expect(client.getResult()).toEqual(mockResult)
      expect(client.getStatus()).toBe('success')
      expect(client.getIsLoading()).toBe(false)
    })

    it('should handle fetcher errors', async () => {
      const onError = vi.fn()
      const onErrorChange = vi.fn()

      const client = new GenerationClient({
        fetcher: async () => {
          throw new Error('fetch failed')
        },
        onError,
        onErrorChange,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(onError.mock.calls[0]![0].message).toBe('fetch failed')
      expect(client.getStatus()).toBe('error')
      expect(client.getError()?.message).toBe('fetch failed')
    })

    it('should track loading state during fetcher call', async () => {
      const states: Array<boolean> = []

      const client = new GenerationClient({
        fetcher: async () => {
          return { id: '1' }
        },
        onLoadingChange: (isLoading) => states.push(isLoading),
      })

      await client.generate({ prompt: 'test' })

      expect(states).toEqual([true, false])
    })

    it('should pass abort signal to fetcher', async () => {
      const fetcherSpy = vi.fn(
        async (_input: any, options?: { signal: AbortSignal }) => {
          expect(options).toBeDefined()
          expect(options!.signal).toBeInstanceOf(AbortSignal)
          expect(options!.signal.aborted).toBe(false)
          return { id: '1' }
        },
      )

      const client = new GenerationClient({
        fetcher: fetcherSpy,
      })

      await client.generate({ prompt: 'test' })

      expect(fetcherSpy).toHaveBeenCalledTimes(1)
      expect(fetcherSpy).toHaveBeenCalledWith(
        { prompt: 'test' },
        { signal: expect.any(AbortSignal) },
      )
    })

    it('should not allow concurrent requests', async () => {
      let resolveFirst: (value: any) => void
      let callCount = 0

      const client = new GenerationClient({
        fetcher: async () => {
          callCount++
          return new Promise((resolve) => {
            resolveFirst = resolve
          })
        },
      })

      const p1 = client.generate({ prompt: 'test' })
      const p2 = client.generate({ prompt: 'test2' }) // should be no-op

      resolveFirst!({ id: '1' })
      await p1
      await p2

      expect(callCount).toBe(1)
    })
  })

  describe('connection mode', () => {
    it('should process stream and extract result from CUSTOM event', async () => {
      const mockResult = {
        id: '1',
        images: [{ url: 'http://example.com/img.png' }],
      }
      const onResult = vi.fn()

      const connection = createMockConnection([
        { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
        {
          type: 'CUSTOM',
          name: 'generation:result',
          value: mockResult,
          timestamp: Date.now(),
        },
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        },
      ])

      const client = new GenerationClient({
        connection,
        onResult,
      })

      await client.generate({ prompt: 'test' })

      expect(onResult).toHaveBeenCalledWith(mockResult)
      expect(client.getResult()).toEqual(mockResult)
      expect(client.getStatus()).toBe('success')
    })

    it('should handle RUN_ERROR from stream', async () => {
      const onError = vi.fn()

      const connection = createMockConnection([
        { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
        {
          type: 'RUN_ERROR',
          runId: 'run-1',
          error: { message: 'Generation failed' },
          timestamp: Date.now(),
        },
      ])

      const client = new GenerationClient({
        connection,
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getStatus()).toBe('error')
      expect(client.getError()?.message).toBe('Generation failed')
    })

    it('should report progress from CUSTOM progress events', async () => {
      const onProgress = vi.fn()

      const connection = createMockConnection([
        { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
        {
          type: 'CUSTOM',
          name: 'generation:progress',
          value: { progress: 50, message: 'Halfway' },
          timestamp: Date.now(),
        },
        {
          type: 'CUSTOM',
          name: 'generation:result',
          value: { id: '1' },
          timestamp: Date.now(),
        },
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        },
      ])

      const client = new GenerationClient({
        connection,
        onProgress,
      })

      await client.generate({ prompt: 'test' })

      expect(onProgress).toHaveBeenCalledWith(50, 'Halfway')
    })

    it('should call onChunk for each stream chunk', async () => {
      const onChunk = vi.fn()

      const chunks: Array<StreamChunk> = [
        { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
        {
          type: 'CUSTOM',
          name: 'generation:result',
          value: { id: '1' },
          timestamp: Date.now(),
        },
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        },
      ]

      const connection = createMockConnection(chunks)

      const client = new GenerationClient({
        connection,
        onChunk,
      })

      await client.generate({ prompt: 'test' })

      expect(onChunk).toHaveBeenCalledTimes(3)
    })

    it('should pass body and input as data to connection', async () => {
      const connectSpy = vi.fn(async function* () {
        yield {
          type: 'CUSTOM' as const,
          name: 'generation:result',
          value: { id: '1' },
          timestamp: Date.now(),
        }
        yield {
          type: 'RUN_FINISHED' as const,
          runId: 'run-1',
          finishReason: 'stop' as const,
          timestamp: Date.now(),
        }
      })

      const connection: ConnectConnectionAdapter = {
        connect: connectSpy,
      }

      const client = new GenerationClient({
        connection,
        body: { model: 'dall-e-3' },
      })

      await client.generate({ prompt: 'sunset', size: '1024x1024' })

      expect(connectSpy).toHaveBeenCalledWith(
        [],
        { model: 'dall-e-3', prompt: 'sunset', size: '1024x1024' },
        expect.any(AbortSignal),
      )
    })
  })

  describe('stop()', () => {
    it('should abort in-flight request and reset to idle', async () => {
      let resolvePromise: (value: any) => void

      const client = new GenerationClient({
        fetcher: async () => {
          return new Promise((resolve) => {
            resolvePromise = resolve
          })
        },
      })

      const generatePromise = client.generate({ prompt: 'test' })
      expect(client.getIsLoading()).toBe(true)

      client.stop()
      expect(client.getIsLoading()).toBe(false)
      expect(client.getStatus()).toBe('idle')

      resolvePromise!({ id: '1' })
      await generatePromise
    })
  })

  describe('reset()', () => {
    it('should clear result, error, and return to idle', async () => {
      const client = new GenerationClient({
        fetcher: async () => ({ id: '1' }),
      })

      await client.generate({ prompt: 'test' })
      expect(client.getResult()).toEqual({ id: '1' })
      expect(client.getStatus()).toBe('success')

      client.reset()
      expect(client.getResult()).toBeNull()
      expect(client.getError()).toBeUndefined()
      expect(client.getStatus()).toBe('idle')
    })
  })

  describe('updateOptions()', () => {
    it('should update body without recreating client', async () => {
      const connectSpy = vi.fn(async function* () {
        yield {
          type: 'RUN_FINISHED' as const,
          runId: 'run-1',
          finishReason: 'stop' as const,
          timestamp: Date.now(),
        }
      })

      const connection: ConnectConnectionAdapter = { connect: connectSpy }

      const client = new GenerationClient({
        connection,
        body: { model: 'old' },
      })

      client.updateOptions({ body: { model: 'new' } })
      await client.generate({ prompt: 'test' })

      expect(connectSpy).toHaveBeenCalledWith(
        [],
        { model: 'new', prompt: 'test' },
        expect.any(AbortSignal),
      )
    })
  })

  describe('abort handling', () => {
    it('should not set result if aborted mid-stream', async () => {
      const onResult = vi.fn()

      const connection: ConnectConnectionAdapter = {
        async *connect(_msgs, _data, signal) {
          yield {
            type: 'RUN_STARTED' as const,
            runId: 'run-1',
            timestamp: Date.now(),
          }
          // Wait until abort is triggered
          await new Promise<void>((resolve) => {
            signal?.addEventListener('abort', () => resolve())
          })
          // Adapter honors abort signal and stops yielding
          if (signal?.aborted) return
          yield {
            type: 'CUSTOM' as const,
            name: 'generation:result',
            value: { id: '1' },
            timestamp: Date.now(),
          }
        },
      }

      const client = new GenerationClient({
        connection,
        onResult,
      })

      const generatePromise = client.generate({ prompt: 'test' })
      await new Promise((r) => setTimeout(r, 0))

      client.stop()
      await generatePromise

      expect(onResult).not.toHaveBeenCalled()
      expect(client.getResult()).toBeNull()
      expect(client.getStatus()).toBe('idle')
    })

    it('should not set result if fetcher resolves after stop()', async () => {
      let resolvePromise: (value: any) => void
      const onResult = vi.fn()

      const client = new GenerationClient({
        fetcher: async () => {
          return new Promise((resolve) => {
            resolvePromise = resolve
          })
        },
        onResult,
      })

      const generatePromise = client.generate({ prompt: 'test' })
      client.stop()
      resolvePromise!({ id: '1' })
      await generatePromise

      expect(onResult).not.toHaveBeenCalled()
      expect(client.getResult()).toBeNull()
    })
  })

  describe('error wrapping', () => {
    it('should wrap non-Error thrown values in Error', async () => {
      const onError = vi.fn()

      const client = new GenerationClient({
        fetcher: async () => {
          throw 'string error'
        },
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(onError.mock.calls[0]![0].message).toBe('string error')
      expect(client.getError()?.message).toBe('string error')
    })

    it('should throw if neither connection nor fetcher is provided', async () => {
      const onError = vi.fn()

      const client = new GenerationClient({
        onError,
      } as any)

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getError()?.message).toBe(
        'GenerationClient requires either a connection or fetcher option',
      )
    })
  })

  describe('stream edge cases', () => {
    it('should finish with success but null result if stream has no result event', async () => {
      const onResult = vi.fn()

      const connection = createMockConnection([
        { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        },
      ])

      const client = new GenerationClient({
        connection,
        onResult,
      })

      await client.generate({ prompt: 'test' })

      expect(client.getStatus()).toBe('success')
      expect(client.getResult()).toBeNull()
      expect(onResult).not.toHaveBeenCalled()
    })

    it('should ignore unknown CUSTOM event names and still call onChunk', async () => {
      const onChunk = vi.fn()

      const connection = createMockConnection([
        { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
        {
          type: 'CUSTOM',
          name: 'unknown:event',
          value: { foo: 'bar' },
          timestamp: Date.now(),
        },
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        },
      ])

      const client = new GenerationClient({
        connection,
        onChunk,
      })

      await client.generate({ prompt: 'test' })

      expect(onChunk).toHaveBeenCalledTimes(3)
      expect(client.getStatus()).toBe('success')
      expect(client.getResult()).toBeNull()
    })
  })

  describe('sequential generation', () => {
    it('should allow a second generation after the first completes', async () => {
      let callCount = 0

      const client = new GenerationClient({
        fetcher: async () => {
          callCount++
          return { id: String(callCount) }
        },
      })

      await client.generate({ prompt: 'first' })
      expect(client.getResult()).toEqual({ id: '1' })
      expect(client.getStatus()).toBe('success')

      await client.generate({ prompt: 'second' })
      expect(client.getResult()).toEqual({ id: '2' })
      expect(client.getStatus()).toBe('success')
      expect(callCount).toBe(2)
    })
  })

  describe('onResult transform', () => {
    it('should transform result when onResult returns a non-null value (fetcher)', async () => {
      const onResultChange = vi.fn()

      const client = new GenerationClient<
        Record<string, any>,
        { id: string },
        { transformed: boolean }
      >({
        fetcher: async () => ({ id: '1' }),
        onResult: (_raw) => ({ transformed: true }),
        onResultChange,
      })

      await client.generate({ prompt: 'test' })

      expect(client.getResult()).toEqual({ transformed: true })
      expect(onResultChange).toHaveBeenCalledWith({ transformed: true })
      expect(client.getStatus()).toBe('success')
    })

    it('should keep previous result when onResult returns null', async () => {
      const onResultChange = vi.fn()

      const client = new GenerationClient({
        fetcher: async () => ({ id: '1' }),
        onResult: () => null,
        onResultChange,
      })

      await client.generate({ prompt: 'test' })

      // null return → keep previous result (which was null initially)
      expect(client.getResult()).toBeNull()
      // onResultChange should NOT be called when result is unchanged
      expect(onResultChange).not.toHaveBeenCalled()
      expect(client.getStatus()).toBe('success')
    })

    it('should use raw result when onResult returns void', async () => {
      const onResult = vi.fn() // returns void implicitly

      const client = new GenerationClient({
        fetcher: async () => ({ id: '1', data: 'test' }),
        onResult,
      })

      await client.generate({ prompt: 'test' })

      expect(onResult).toHaveBeenCalledWith({ id: '1', data: 'test' })
      expect(client.getResult()).toEqual({ id: '1', data: 'test' })
    })

    it('should transform result from stream CUSTOM event', async () => {
      const connection = createMockConnection([
        { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
        {
          type: 'CUSTOM',
          name: 'generation:result',
          value: { id: '1', images: [] },
          timestamp: Date.now(),
        },
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        },
      ])

      const client = new GenerationClient<
        Record<string, any>,
        { id: string; images: Array<any> },
        { imageCount: number }
      >({
        connection,
        onResult: (raw) => ({ imageCount: raw.images.length }),
      })

      await client.generate({ prompt: 'test' })

      expect(client.getResult()).toEqual({ imageCount: 0 })
    })

    it('should reset transformed result to null on reset()', async () => {
      const client = new GenerationClient<
        Record<string, any>,
        { id: string },
        { transformed: boolean }
      >({
        fetcher: async () => ({ id: '1' }),
        onResult: () => ({ transformed: true }),
      })

      await client.generate({ prompt: 'test' })
      expect(client.getResult()).toEqual({ transformed: true })

      client.reset()
      expect(client.getResult()).toBeNull()
    })

    it('should keep previous transformed result on second generation when onResult returns null', async () => {
      let callCount = 0
      const client = new GenerationClient<
        Record<string, any>,
        { id: string },
        { transformed: string }
      >({
        fetcher: async () => {
          callCount++
          return { id: String(callCount) }
        },
        onResult: (raw) => {
          // Only transform the first result, reject subsequent ones
          if (raw.id === '1') return { transformed: 'first' }
          return null
        },
      })

      await client.generate({ prompt: 'first' })
      expect(client.getResult()).toEqual({ transformed: 'first' })

      await client.generate({ prompt: 'second' })
      // onResult returned null → keep previous result
      expect(client.getResult()).toEqual({ transformed: 'first' })
    })
  })

  describe('fetcher returning Response (SSE stream)', () => {
    function createSSEResponse(lines: Array<string>): Response {
      const sseData = lines.map((l) => `data: ${l}`).join('\n\n') + '\n\n'
      const mockReader = {
        _callCount: 0,
        _chunks: [new TextEncoder().encode(sseData)],
        read() {
          if (this._callCount < this._chunks.length) {
            return Promise.resolve({
              done: false,
              value: this._chunks[this._callCount++],
            })
          }
          return Promise.resolve({ done: true, value: undefined })
        },
        releaseLock() {},
      }
      const response = new Response(null, { status: 200 })
      Object.defineProperty(response, 'body', {
        value: { getReader: () => mockReader },
      })
      return response
    }

    it('should parse SSE Response and extract result from CUSTOM event', async () => {
      const mockResult = { id: '1', images: [{ url: 'http://example.com' }] }
      const onResult = vi.fn()

      const response = createSSEResponse([
        JSON.stringify({
          type: 'RUN_STARTED',
          runId: 'run-1',
          timestamp: 100,
        }),
        JSON.stringify({
          type: 'CUSTOM',
          name: 'generation:result',
          value: mockResult,
          timestamp: 200,
        }),
        JSON.stringify({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: 300,
        }),
      ])

      const client = new GenerationClient({
        fetcher: async () => response,
        onResult,
      })

      await client.generate({ prompt: 'test' })

      expect(onResult).toHaveBeenCalledWith(mockResult)
      expect(client.getResult()).toEqual(mockResult)
      expect(client.getStatus()).toBe('success')
    })

    it('should handle RUN_ERROR from SSE Response', async () => {
      const onError = vi.fn()

      const response = createSSEResponse([
        JSON.stringify({
          type: 'RUN_STARTED',
          runId: 'run-1',
          timestamp: 100,
        }),
        JSON.stringify({
          type: 'RUN_ERROR',
          runId: 'run-1',
          error: { message: 'Generation failed' },
          timestamp: 200,
        }),
      ])

      const client = new GenerationClient({
        fetcher: async () => response,
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getStatus()).toBe('error')
      expect(client.getError()?.message).toBe('Generation failed')
    })

    it('should call onChunk for each SSE chunk from Response', async () => {
      const onChunk = vi.fn()

      const response = createSSEResponse([
        JSON.stringify({
          type: 'RUN_STARTED',
          runId: 'run-1',
          timestamp: 100,
        }),
        JSON.stringify({
          type: 'CUSTOM',
          name: 'generation:result',
          value: { id: '1' },
          timestamp: 200,
        }),
        JSON.stringify({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: 300,
        }),
      ])

      const client = new GenerationClient({
        fetcher: async () => response,
        onChunk,
      })

      await client.generate({ prompt: 'test' })

      expect(onChunk).toHaveBeenCalledTimes(3)
    })

    it('should report progress from SSE Response stream', async () => {
      const onProgress = vi.fn()

      const response = createSSEResponse([
        JSON.stringify({
          type: 'RUN_STARTED',
          runId: 'run-1',
          timestamp: 100,
        }),
        JSON.stringify({
          type: 'CUSTOM',
          name: 'generation:progress',
          value: { progress: 50, message: 'Halfway' },
          timestamp: 200,
        }),
        JSON.stringify({
          type: 'CUSTOM',
          name: 'generation:result',
          value: { id: '1' },
          timestamp: 300,
        }),
        JSON.stringify({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: 400,
        }),
      ])

      const client = new GenerationClient({
        fetcher: async () => response,
        onProgress,
      })

      await client.generate({ prompt: 'test' })

      expect(onProgress).toHaveBeenCalledWith(50, 'Halfway')
    })

    it('should handle HTTP error Response from fetcher', async () => {
      const onError = vi.fn()

      const errorResponse = new Response(null, {
        status: 500,
        statusText: 'Internal Server Error',
      })

      const client = new GenerationClient({
        fetcher: async () => errorResponse,
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getStatus()).toBe('error')
      expect(client.getError()?.message).toContain('500')
    })

    it('should pass input type-safely (fetcher receives typed input)', async () => {
      const fetcherSpy = vi.fn(async (_input: { prompt: string }) => {
        return createSSEResponse([
          JSON.stringify({
            type: 'CUSTOM',
            name: 'generation:result',
            value: { id: '1' },
            timestamp: 100,
          }),
          JSON.stringify({
            type: 'RUN_FINISHED',
            runId: 'run-1',
            finishReason: 'stop',
            timestamp: 200,
          }),
        ])
      })

      const client = new GenerationClient({
        fetcher: fetcherSpy,
      })

      await client.generate({ prompt: 'sunset' })

      expect(fetcherSpy).toHaveBeenCalledWith(
        { prompt: 'sunset' },
        { signal: expect.any(AbortSignal) },
      )
      expect(client.getResult()).toEqual({ id: '1' })
    })
  })

  describe('state transitions', () => {
    it('should follow idle -> generating -> success', async () => {
      const states: Array<string> = []

      const client = new GenerationClient({
        fetcher: async () => ({ id: '1' }),
        onStatusChange: (status) => states.push(status),
      })

      expect(client.getStatus()).toBe('idle')
      await client.generate({ prompt: 'test' })

      expect(states).toEqual(['generating', 'success'])
    })

    it('should follow idle -> generating -> error on failure', async () => {
      const states: Array<string> = []

      const client = new GenerationClient({
        fetcher: async () => {
          throw new Error('fail')
        },
        onStatusChange: (status) => states.push(status),
      })

      await client.generate({ prompt: 'test' })

      expect(states).toEqual(['generating', 'error'])
    })
  })
})
