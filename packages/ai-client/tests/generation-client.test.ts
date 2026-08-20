import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  GenerationClient,
  UnsupportedResponseStreamError,
  VideoGenerationClient,
  reconstructImageResult,
} from '../src'
import type { StreamChunk } from '@tanstack/ai/client'
import type { PersistedArtifactRef } from '@tanstack/ai/client'
import type {
  ConnectConnectionAdapter,
  GenerationHydrationResult,
} from '../src/connection-adapters'

// A durable output image artifact carrying an app-origin serve URL, used to
// verify the restore-path result repaint via reconstructImageResult.
const restoredImageArtifact: PersistedArtifactRef = {
  role: 'output',
  artifactId: 'artifact-image-1',
  threadId: 'thread-img',
  runId: 'run-img',
  name: 'image.png',
  mimeType: 'image/png',
  size: 2048,
  createdAt: '2026-07-06T00:00:00.000Z',
  url: '/api/artifacts/artifact-image-1',
  source: {
    activity: 'image',
    path: 'runs/run-img/image.png',
    provider: 'test',
    model: 'test-image',
    mediaType: 'image',
  },
}

// The video equivalent: a durable output video artifact served from the app's
// own origin, used to verify the video client's restore-path repaint.
const restoredVideoArtifact: PersistedArtifactRef = {
  role: 'output',
  artifactId: 'artifact-video-1',
  threadId: 'thread-video',
  runId: 'run-video',
  name: 'clip.mp4',
  mimeType: 'video/mp4',
  size: 40960,
  createdAt: '2026-07-06T00:00:00.000Z',
  url: '/api/artifacts/artifact-video-1',
  source: {
    activity: 'video',
    path: 'runs/run-video/clip.mp4',
    provider: 'test',
    model: 'test-video',
    mediaType: 'video',
  },
}

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

function createDeferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function waitForCondition(assertion: () => void): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  throw lastError
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
        async (
          _input: { prompt: string },
          options?: { signal: AbortSignal },
        ) => {
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
      let resolveFirst: (value: { id: string }) => void
      let callCount = 0

      const client = new GenerationClient({
        fetcher: async () => {
          callCount++
          return new Promise<{ id: string }>((resolve) => {
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: mockResult,
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_ERROR,
          message: 'Generation failed',
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:progress',
          value: { progress: 50, message: 'Halfway' },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { id: '1' },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { id: '1' },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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
          type: EventType.CUSTOM as const,
          name: 'generation:result',
          value: { id: '1' },
          timestamp: Date.now(),
        }
        yield {
          type: EventType.RUN_FINISHED as const,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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
        expect.objectContaining({
          threadId: expect.stringMatching(/^generation-/),
          runId: expect.stringMatching(/^run-/),
        }),
      )
    })
  })

  describe('stop()', () => {
    it('should abort in-flight request and reset to idle', async () => {
      let resolvePromise: (value: { id: string }) => void

      const client = new GenerationClient({
        fetcher: async () => {
          return new Promise<{ id: string }>((resolve) => {
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
          type: EventType.RUN_FINISHED as const,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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
        expect.objectContaining({
          threadId: expect.stringMatching(/^generation-/),
          runId: expect.stringMatching(/^run-/),
        }),
      )
    })
  })

  describe('abort handling', () => {
    it('should not set result if aborted mid-stream', async () => {
      const onResult = vi.fn()

      const connection: ConnectConnectionAdapter = {
        async *connect(_msgs, _data, signal) {
          yield {
            type: EventType.RUN_STARTED as const,
            runId: 'run-1',
            threadId: 'thread-1',
            timestamp: Date.now(),
          }
          // Wait until abort is triggered
          await new Promise<void>((resolve) => {
            signal?.addEventListener('abort', () => resolve())
          })
          // Adapter honors abort signal and stops yielding
          if (signal?.aborted) return
          yield {
            type: EventType.CUSTOM as const,
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

    it('should ignore chunks yielded after stop() by an abort-ignoring connection', async () => {
      const onResult = vi.fn()
      const aborted = createDeferred()

      const connection: ConnectConnectionAdapter = {
        async *connect(_msgs, _data, signal) {
          yield {
            type: EventType.RUN_STARTED as const,
            runId: 'run-1',
            threadId: 'thread-1',
            timestamp: Date.now(),
          }
          signal?.addEventListener('abort', () => aborted.resolve(undefined), {
            once: true,
          })
          await aborted.promise
          yield {
            type: EventType.CUSTOM as const,
            name: 'generation:result',
            value: { id: 'late-result' },
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED as const,
            runId: 'run-1',
            threadId: 'thread-1',
            metadata: { tanstack: { finishReason: 'stop' } },
            timestamp: Date.now(),
          }
        },
      }

      const client = new GenerationClient({
        connection,
        onResult,
      })

      const generatePromise = client.generate({ prompt: 'test' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      client.stop()
      await generatePromise

      expect(onResult).not.toHaveBeenCalled()
      expect(client.getResult()).toBeNull()
      expect(client.getStatus()).toBe('idle')
    })

    it('should not let a stopped run clear the controller for a newer generation', async () => {
      const firstAborted = createDeferred()
      const firstCanFinish = createDeferred()
      const secondAborted = createDeferred()
      const signals: Array<AbortSignal | undefined> = []

      const connection: ConnectConnectionAdapter = {
        async *connect(_msgs, data, signal) {
          signals.push(signal)
          if (data?.prompt === 'first') {
            yield {
              type: EventType.RUN_STARTED as const,
              runId: 'run-1',
              threadId: 'thread-1',
              timestamp: Date.now(),
            }
            signal?.addEventListener(
              'abort',
              () => firstAborted.resolve(undefined),
              { once: true },
            )
            await firstAborted.promise
            await firstCanFinish.promise
            yield {
              type: EventType.CUSTOM as const,
              name: 'generation:result',
              value: { id: 'late-first' },
              timestamp: Date.now(),
            }
            return
          }

          yield {
            type: EventType.RUN_STARTED as const,
            runId: 'run-2',
            threadId: 'thread-1',
            timestamp: Date.now(),
          }
          signal?.addEventListener(
            'abort',
            () => secondAborted.resolve(undefined),
            { once: true },
          )
          await secondAborted.promise
        },
      }

      const client = new GenerationClient({
        connection,
      })

      const firstGenerate = client.generate({ prompt: 'first' })
      await waitForCondition(() => {
        expect(signals).toHaveLength(1)
      })

      client.stop()
      const secondGenerate = client.generate({ prompt: 'second' })
      await waitForCondition(() => {
        expect(signals).toHaveLength(2)
        expect(client.getIsLoading()).toBe(true)
      })

      firstCanFinish.resolve(undefined)
      await firstGenerate

      expect(client.getIsLoading()).toBe(true)

      client.stop()
      expect(signals[1]?.aborted).toBe(true)

      await secondGenerate
      expect(client.getIsLoading()).toBe(false)
    })

    it('should ignore video chunks yielded after stop() by an abort-ignoring connection', async () => {
      const onResult = vi.fn()
      const onStatusUpdate = vi.fn()
      const aborted = createDeferred()

      const connection: ConnectConnectionAdapter = {
        async *connect(_msgs, _data, signal) {
          yield {
            type: EventType.RUN_STARTED as const,
            runId: 'run-1',
            threadId: 'thread-1',
            timestamp: Date.now(),
          }
          signal?.addEventListener('abort', () => aborted.resolve(undefined), {
            once: true,
          })
          await aborted.promise
          yield {
            type: EventType.CUSTOM as const,
            name: 'generation:result',
            value: { id: 'late-video' },
            timestamp: Date.now(),
          }
          yield {
            type: EventType.CUSTOM as const,
            name: 'video:status',
            value: { status: 'completed', progress: 100 },
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED as const,
            runId: 'run-1',
            threadId: 'thread-1',
            metadata: { tanstack: { finishReason: 'stop' } },
            timestamp: Date.now(),
          }
        },
      }

      const client = new VideoGenerationClient({
        connection,
        onResult,
        onStatusUpdate,
      })

      const generatePromise = client.generate({ prompt: 'test' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      client.stop()
      await generatePromise

      expect(onResult).not.toHaveBeenCalled()
      expect(onStatusUpdate).not.toHaveBeenCalled()
      expect(client.getResult()).toBeNull()
      expect(client.getVideoStatus()).toBeNull()
      expect(client.getStatus()).toBe('idle')
    })

    it('should not let a stopped video run clear the controller for a newer generation', async () => {
      const firstAborted = createDeferred()
      const firstCanFinish = createDeferred()
      const secondAborted = createDeferred()
      const signals: Array<AbortSignal | undefined> = []

      const connection: ConnectConnectionAdapter = {
        async *connect(_msgs, data, signal) {
          signals.push(signal)
          if (data?.prompt === 'first') {
            yield {
              type: EventType.RUN_STARTED as const,
              runId: 'run-1',
              threadId: 'thread-1',
              timestamp: Date.now(),
            }
            signal?.addEventListener(
              'abort',
              () => firstAborted.resolve(undefined),
              { once: true },
            )
            await firstAborted.promise
            await firstCanFinish.promise
            yield {
              type: EventType.CUSTOM as const,
              name: 'generation:result',
              value: {
                jobId: 'late-first',
                status: 'completed',
                url: 'https://example.com/late.mp4',
              },
              timestamp: Date.now(),
            }
            return
          }

          yield {
            type: EventType.RUN_STARTED as const,
            runId: 'run-2',
            threadId: 'thread-1',
            timestamp: Date.now(),
          }
          signal?.addEventListener(
            'abort',
            () => secondAborted.resolve(undefined),
            { once: true },
          )
          await secondAborted.promise
        },
      }

      const client = new VideoGenerationClient({
        connection,
      })

      const firstGenerate = client.generate({ prompt: 'first' })
      await waitForCondition(() => {
        expect(signals).toHaveLength(1)
      })

      client.stop()
      const secondGenerate = client.generate({ prompt: 'second' })
      await waitForCondition(() => {
        expect(signals).toHaveLength(2)
        expect(client.getIsLoading()).toBe(true)
      })

      firstCanFinish.resolve(undefined)
      await firstGenerate

      expect(client.getIsLoading()).toBe(true)

      client.stop()
      expect(signals[1]?.aborted).toBe(true)

      await secondGenerate
      expect(client.getIsLoading()).toBe(false)
    })

    it('should not set result if fetcher resolves after stop()', async () => {
      let resolvePromise: (value: { id: string }) => void
      const onResult = vi.fn()

      const client = new GenerationClient({
        fetcher: async () => {
          return new Promise<{ id: string }>((resolve) => {
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

      // @ts-expect-error verifying the runtime guard for JavaScript callers
      const client = new GenerationClient({
        onError,
      })

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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'unknown:event',
          value: { foo: 'bar' },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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
        { prompt: string },
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { id: '1', images: [] },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
          timestamp: Date.now(),
        },
      ])

      const client = new GenerationClient<
        { prompt: string },
        { id: string; images: Array<{ url?: string }> },
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
        { prompt: string },
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
        { prompt: string },
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
    function createSSEResponse(
      lines: Array<string>,
      options: { spaceAfterDataColon?: boolean } = {},
    ): Response {
      const prefix = options.spaceAfterDataColon === false ? 'data:' : 'data: '
      const sseData = lines.map((l) => `${prefix}${l}`).join('\n\n') + '\n\n'
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
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: 100,
        }),
        JSON.stringify({
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: mockResult,
          timestamp: 200,
        }),
        JSON.stringify({
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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

    it('should parse SSE Response data frames without a space after the colon', async () => {
      const mockResult = { id: '1', images: [{ url: 'http://example.com' }] }
      const onResult = vi.fn()

      const response = createSSEResponse(
        [
          JSON.stringify({
            type: EventType.CUSTOM,
            name: 'generation:result',
            value: mockResult,
            timestamp: 200,
          }),
          JSON.stringify({
            type: EventType.RUN_FINISHED,
            runId: 'run-1',
            threadId: 'thread-1',
            metadata: { tanstack: { finishReason: 'stop' } },
            timestamp: 300,
          }),
        ],
        { spaceAfterDataColon: false },
      )

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
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: 100,
        }),
        JSON.stringify({
          type: EventType.RUN_ERROR,
          message: 'Generation failed',
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
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: 100,
        }),
        JSON.stringify({
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { id: '1' },
          timestamp: 200,
        }),
        JSON.stringify({
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: 100,
        }),
        JSON.stringify({
          type: EventType.CUSTOM,
          name: 'generation:progress',
          value: { progress: 50, message: 'Halfway' },
          timestamp: 200,
        }),
        JSON.stringify({
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { id: '1' },
          timestamp: 300,
        }),
        JSON.stringify({
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' } },
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

    it('should surface unsupported streaming from a fetcher-returned Response', async () => {
      const onError = vi.fn()
      const response = new Response(null, { status: 200 })
      Object.defineProperty(response, 'body', {
        value: null,
      })

      const client = new GenerationClient({
        fetcher: async () => response,
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(
        expect.any(UnsupportedResponseStreamError),
      )
      expect(client.getError()).toMatchObject({
        missingFeature: 'Response.body',
      })
      expect(client.getStatus()).toBe('error')
    })

    it('should pass input type-safely (fetcher receives typed input)', async () => {
      const fetcherSpy = vi.fn(async (_input: { prompt: string }) => {
        return createSSEResponse([
          JSON.stringify({
            type: EventType.CUSTOM,
            name: 'generation:result',
            value: { id: '1' },
            timestamp: 100,
          }),
          JSON.stringify({
            type: EventType.RUN_FINISHED,
            runId: 'run-1',
            threadId: 'thread-1',
            metadata: { tanstack: { finishReason: 'stop' } },
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

  describe('server-driven persistence (persistence: true)', () => {
    const completedHydration: GenerationHydrationResult = {
      resumeSnapshot: {
        schemaVersion: 1,
        resumeState: null,
        status: 'complete',
        result: { id: 'result-1', model: 'image-model' },
      },
      activeRun: null,
    }

    function createHydratingConnection(result: GenerationHydrationResult): {
      connection: ConnectConnectionAdapter
      hydrateGeneration: ReturnType<typeof vi.fn>
    } {
      const hydrateGeneration = vi.fn(async () => result)
      return {
        connection: { async *connect() {}, hydrateGeneration },
        hydrateGeneration,
      }
    }

    it('adopts the server snapshot on mount, keyed by threadId, without a local store', async () => {
      const { connection, hydrateGeneration } =
        createHydratingConnection(completedHydration)
      const onResumeSnapshotChange = vi.fn()
      const client = new GenerationClient({
        threadId: 'thread-server',
        connection,
        persistence: true,
        onResumeSnapshotChange,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getResumeSnapshot()).toMatchObject({
          status: 'complete',
          result: { id: 'result-1' },
        })
      })
      expect(hydrateGeneration).toHaveBeenCalledWith('thread-server')
      expect(onResumeSnapshotChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'complete' }),
      )
    })

    it('repaints result from the server snapshot via reconstructResult (image)', async () => {
      const { connection } = createHydratingConnection({
        resumeSnapshot: {
          schemaVersion: 1,
          resumeState: null,
          status: 'complete',
          activity: 'image',
          result: {
            id: 'srv-img',
            model: 'test-image',
            artifacts: [restoredImageArtifact],
          },
        },
        activeRun: null,
      })
      const onResumeStateChange = vi.fn()
      const client = new GenerationClient({
        threadId: 'thread-img-server',
        connection,
        persistence: true,
        reconstructResult: reconstructImageResult,
        onResumeStateChange,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getResult()).toEqual({
          id: 'srv-img',
          model: 'test-image',
          images: [{ url: '/api/artifacts/artifact-image-1' }],
          artifacts: [restoredImageArtifact],
        })
      })
      expect(client.getStatus()).toBe('success')
      expect(onResumeStateChange).toHaveBeenLastCalledWith(null)
    })

    it('rejoins an in-flight run reported by the server and finishes it in place', async () => {
      const runId = 'run-live-1'
      const chunks: Array<StreamChunk> = [
        {
          type: EventType.RUN_STARTED,
          runId,
          threadId: 'thread-live',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: {
            id: 'live-img',
            model: 'test-image',
            images: [{ url: '/live.png' }],
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId,
          threadId: 'thread-live',
          timestamp: Date.now(),
        },
      ]
      const joinRun = vi.fn(async function* () {
        for (const chunk of chunks) yield chunk
      })
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-live', runId },
          status: 'running' as const,
        },
        activeRun: { runId },
      }))
      const client = new GenerationClient({
        threadId: 'thread-live',
        connection: { async *connect() {}, hydrateGeneration, joinRun },
        persistence: true,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('success')
        expect(client.getResult()).toMatchObject({ id: 'live-img' })
      })
      expect(joinRun).toHaveBeenCalledWith(runId, expect.anything())
      expect(client.getIsLoading()).toBe(false)
    })

    it('surfaces an error (never stays stuck generating) when the rejoin throws', async () => {
      // The server still reports the run as in flight, but its delivery log has
      // aged out / the route can't serve the join, so `joinRun` throws. The
      // client must fall out of `generating` into `error`, not hang forever.
      const runId = 'run-gone-1'
      const joinRun = vi.fn(async function* (): AsyncGenerator<StreamChunk> {
        throw new Error('Unknown or expired memory stream run')
      })
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-gone', runId },
          status: 'running' as const,
        },
        activeRun: { runId },
      }))
      const client = new GenerationClient({
        threadId: 'thread-gone',
        connection: { async *connect() {}, hydrateGeneration, joinRun },
        persistence: true,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getIsLoading()).toBe(false)
      expect(client.getError()?.message).toContain('expired')
    })

    it('surfaces an error when the rejoin delivers a terminal RUN_ERROR chunk', async () => {
      // The realistic gone-log case: the join GET fast-fails by EMITTING a
      // RUN_ERROR chunk (not throwing). `observeResumeSnapshot` flips the
      // snapshot to `error` as that chunk streams, so the client must still push
      // `error` onto the observable status — otherwise it stays stuck on
      // `generating` even though the snapshot already knows it failed.
      const runId = 'run-gone-2'
      const joinRun = vi.fn(async function* (): AsyncGenerator<StreamChunk> {
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId: 'thread-gone-2',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.RUN_ERROR,
          message: 'Memory stream run produced no data within 100ms',
          timestamp: Date.now(),
        } as StreamChunk
      })
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-gone-2', runId },
          status: 'running' as const,
        },
        activeRun: { runId },
      }))
      const client = new GenerationClient({
        threadId: 'thread-gone-2',
        connection: { async *connect() {}, hydrateGeneration, joinRun },
        persistence: true,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getIsLoading()).toBe(false)
      expect(client.getError()?.message).toContain('no data')
    })

    it('does nothing when the connection exposes no hydrateGeneration', async () => {
      const client = new GenerationClient({
        threadId: 'thread-server',
        connection: createMockConnection([]),
        persistence: true,
      })

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(client.getResumeSnapshot()).toBeUndefined()
    })

    it('ignores an invalid server snapshot without throwing', async () => {
      const { connection } = createHydratingConnection({
        // Structurally invalid status — must be rejected by the client's parser.
        resumeSnapshot: {
          resumeState: null,
          status: 'bogus',
        } as unknown as GenerationHydrationResult['resumeSnapshot'],
        activeRun: null,
      })
      const client = new GenerationClient({
        threadId: 'thread-server',
        connection,
        persistence: true,
      })

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(client.getResumeSnapshot()).toBeUndefined()
    })

    it('does not stomp a run that a generate() started before hydration resolves', async () => {
      const hydrateGeneration = vi.fn(
        async (): Promise<GenerationHydrationResult> => completedHydration,
      )
      const connection: ConnectConnectionAdapter = {
        async *connect() {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'run-live',
            threadId: 'thread-server',
            timestamp: Date.now(),
          } satisfies StreamChunk
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'run-live',
            threadId: 'thread-server',
            metadata: { tanstack: { finishReason: 'stop' } },
            timestamp: Date.now(),
          } satisfies StreamChunk
        },
        hydrateGeneration,
      }
      const client = new GenerationClient({
        threadId: 'thread-server',
        connection,
        persistence: true,
      })

      // Start a live run immediately; it owns the client and hydration backs off.
      await client.generate({ prompt: 'test' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(client.getStatus()).toBe('success')
      // The live run's terminal snapshot (from run-live), not the server's.
      expect(client.getResumeSnapshot()).toMatchObject({ status: 'complete' })
      expect(client.getResumeSnapshot()?.result?.id).toBeUndefined()
    })

    it('adopts the server snapshot for the video client too', async () => {
      const { connection, hydrateGeneration } = createHydratingConnection({
        resumeSnapshot: {
          schemaVersion: 1,
          resumeState: null,
          status: 'complete',
          activity: 'video',
          result: {
            id: 'srv-video',
            model: 'test-video',
            providerJobId: 'job-7',
            artifacts: [restoredVideoArtifact],
          },
        },
        activeRun: null,
      })
      const client = new VideoGenerationClient({
        threadId: 'thread-video',
        connection,
        persistence: true,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getResumeSnapshot()).toMatchObject({ status: 'complete' })
      })
      expect(hydrateGeneration).toHaveBeenCalledWith('thread-video')
      // The video restores from its durable artifact URL, not the provider's
      // expired link.
      expect(client.getStatus()).toBe('success')
      expect(client.getResult()).toMatchObject({
        jobId: 'job-7',
        status: 'completed',
        url: '/api/artifacts/artifact-video-1',
      })
      expect(client.getJobId()).toBe('job-7')
    })

    it('hydrates via the hydrateGeneration option in fetcher mode (no connection)', async () => {
      const hydrateGeneration = vi.fn(async () => completedHydration)
      const client = new GenerationClient<{ prompt: string }, unknown>({
        threadId: 'thread-server',
        fetcher: async () => ({}),
        persistence: true,
        hydrateGeneration,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getResumeSnapshot()).toMatchObject({
          status: 'complete',
          result: { id: 'result-1' },
        })
      })
      expect(hydrateGeneration).toHaveBeenCalledWith('thread-server')
    })

    it('rejoins an in-flight run via the joinRun option when the connection lacks one', async () => {
      const runId = 'run-option-1'
      const joinRun = vi.fn(async function* () {
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId: 'thread-option',
          timestamp: Date.now(),
        } satisfies StreamChunk
        yield {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { id: 'option-img' },
          timestamp: Date.now(),
        } satisfies StreamChunk
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId: 'thread-option',
          timestamp: Date.now(),
        } satisfies StreamChunk
      })
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-option', runId },
          status: 'running' as const,
        },
        activeRun: { runId },
      }))
      const client = new GenerationClient({
        threadId: 'thread-option',
        connection: createMockConnection([]),
        persistence: true,
        hydrateGeneration,
        joinRun,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('success')
        expect(client.getResult()).toMatchObject({ id: 'option-img' })
      })
      expect(joinRun).toHaveBeenCalledWith(runId, expect.anything())
      expect(client.getIsLoading()).toBe(false)
    })

    it('warns only when persistence: true has no hydrate source at all', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Fetcher with no handlers anywhere: warns.
      new GenerationClient<{ prompt: string }, unknown>({
        threadId: 'thread-warn',
        fetcher: async () => ({}),
        persistence: true,
      }).mountDevtools()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('`persistence: true`'),
      )
      warn.mockClear()

      // The hydrateGeneration option counts as a hydrate source: no warning.
      new GenerationClient<{ prompt: string }, unknown>({
        threadId: 'thread-warn',
        fetcher: async () => ({}),
        persistence: true,
        hydrateGeneration: vi.fn(async () => ({
          resumeSnapshot: null,
          activeRun: null,
        })),
      }).mountDevtools()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('`persistence: true`'),
      )
      warn.mockRestore()
    })

    it('repaints a running server snapshot with no joinRun available as an interrupted error', async () => {
      const runId = 'run-stranded'
      const { connection } = createHydratingConnection({
        resumeSnapshot: {
          schemaVersion: 1,
          resumeState: { threadId: 'thread-stranded', runId },
          status: 'running',
        },
        activeRun: { runId },
      })
      const client = new GenerationClient({
        threadId: 'thread-stranded',
        connection,
        persistence: true,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getIsLoading()).toBe(false)
      expect(client.getError()?.message).toMatch(/interrupted/)
      expect(client.getResumeSnapshot()).toMatchObject({
        status: 'error',
        resumeState: null,
      })
    })

    it('surfaces a hydration transport failure instead of looking like a fresh thread', async () => {
      // A 403 from the authorize gate, a network drop, a 500 — all reach the
      // client as a rejected `hydrateGeneration`. Swallowing it would leave the
      // app unable to tell a broken server from an empty thread.
      const onError = vi.fn()
      const hydrateGeneration = vi.fn(async (): Promise<never> => {
        throw new Error('403 Forbidden')
      })
      const client = new GenerationClient({
        threadId: 'thread-denied',
        connection: { async *connect() {}, hydrateGeneration },
        persistence: true,
        onError,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getError()?.message).toContain('403 Forbidden')
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getIsLoading()).toBe(false)
    })

    it('stays silent for a genuine hydration miss (no record for the thread)', async () => {
      const onError = vi.fn()
      const { connection } = createHydratingConnection({
        resumeSnapshot: null,
        activeRun: null,
      })
      const client = new GenerationClient({
        threadId: 'thread-fresh',
        connection,
        persistence: true,
        onError,
      })
      client.mountDevtools()

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(client.getStatus()).toBe('idle')
      expect(client.getError()).toBeUndefined()
      expect(onError).not.toHaveBeenCalled()
    })

    it('surfaces a hydration failure for the video client too', async () => {
      const onError = vi.fn()
      const hydrateGeneration = vi.fn(async (): Promise<never> => {
        throw new Error('503 Service Unavailable')
      })
      const client = new VideoGenerationClient({
        threadId: 'thread-video-denied',
        connection: { async *connect() {}, hydrateGeneration },
        persistence: true,
        onError,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getError()?.message).toContain('503')
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('truncated stream (no terminal chunk)', () => {
    // A stream that simply ENDS — proxy/LB idle timeout, server restart
    // mid-run, or a durable log whose terminal append failed — returns normally
    // from `for await`. Without an explicit check the client would sit on
    // `status: 'generating'` forever with a `running` snapshot that every
    // reload rejoins again.
    const truncatedChunks = (
      runId: string,
      threadId: string,
    ): Array<StreamChunk> => [
      {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        timestamp: Date.now(),
      },
      {
        type: EventType.CUSTOM,
        name: 'generation:progress',
        value: { progress: 40 },
        timestamp: Date.now(),
      },
    ]

    it('settles generate() to an error when the stream ends without RUN_FINISHED', async () => {
      const onError = vi.fn()
      const client = new GenerationClient({
        threadId: 'thread-trunc',
        connection: createMockConnection(
          truncatedChunks('run-trunc', 'thread-trunc'),
        ),
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(client.getStatus()).toBe('error')
      expect(client.getIsLoading()).toBe(false)
      expect(client.getError()?.message).toMatch(
        /ended before the run finished/,
      )
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      // The snapshot must not stay `running`, or the next mount rejoins a run
      // that is already gone.
      expect(client.getResumeSnapshot()).toMatchObject({
        status: 'error',
        resumeState: null,
      })
    })

    it('settles a rejoin to an error when the replayed stream ends without RUN_FINISHED', async () => {
      const runId = 'run-trunc-rejoin'
      const onError = vi.fn()
      const joinRun = vi.fn(async function* () {
        for (const chunk of truncatedChunks(runId, 'thread-trunc-rejoin')) {
          yield chunk
        }
      })
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-trunc-rejoin', runId },
          status: 'running' as const,
        },
        activeRun: { runId },
      }))
      const client = new GenerationClient({
        threadId: 'thread-trunc-rejoin',
        connection: { async *connect() {}, hydrateGeneration, joinRun },
        persistence: true,
        onError,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getIsLoading()).toBe(false)
      expect(client.getError()?.message).toMatch(
        /ended before the run finished/,
      )
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getResumeSnapshot()).toMatchObject({
        status: 'error',
        resumeState: null,
      })
    })

    it('settles a video generate() to an error when the stream ends without RUN_FINISHED', async () => {
      const onError = vi.fn()
      const client = new VideoGenerationClient({
        threadId: 'thread-video-trunc',
        connection: createMockConnection(
          truncatedChunks('run-video-trunc', 'thread-video-trunc'),
        ),
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(client.getStatus()).toBe('error')
      expect(client.getIsLoading()).toBe(false)
      expect(client.getError()?.message).toMatch(
        /ended before the run finished/,
      )
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getResumeSnapshot()).toMatchObject({
        status: 'error',
        resumeState: null,
      })
    })

    it('settles a video rejoin to an error when the replayed stream ends without RUN_FINISHED', async () => {
      const runId = 'run-video-trunc-rejoin'
      const onError = vi.fn()
      const joinRun = vi.fn(async function* () {
        for (const chunk of truncatedChunks(runId, 'thread-video-rejoin')) {
          yield chunk
        }
      })
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-video-rejoin', runId },
          status: 'running' as const,
        },
        activeRun: { runId },
      }))
      const client = new VideoGenerationClient({
        threadId: 'thread-video-rejoin',
        connection: { async *connect() {}, hydrateGeneration, joinRun },
        persistence: true,
        onError,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getIsLoading()).toBe(false)
      expect(client.getError()?.message).toMatch(
        /ended before the run finished/,
      )
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getResumeSnapshot()).toMatchObject({
        status: 'error',
        resumeState: null,
      })
    })

    it('does not report a truncation when the stream was stopped by the caller', async () => {
      // `stop()` aborts the reader mid-stream. That is a deliberate cancel, not
      // a dropped connection, so it must stay `idle` with no error.
      const onError = vi.fn()
      const client = new GenerationClient({
        connection: {
          async *connect(_messages, _data, signal) {
            yield {
              type: EventType.RUN_STARTED,
              runId: 'run-stop',
              threadId: 'thread-stop',
              timestamp: Date.now(),
            } satisfies StreamChunk
            await new Promise((resolve) => setTimeout(resolve, 0))
            if (signal?.aborted) return
            yield {
              type: EventType.RUN_FINISHED,
              runId: 'run-stop',
              threadId: 'thread-stop',
              timestamp: Date.now(),
            } satisfies StreamChunk
          },
        },
        onError,
      })

      const generating = client.generate({ prompt: 'test' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      client.stop()
      await generating

      expect(client.getStatus()).toBe('idle')
      expect(client.getError()).toBeUndefined()
      expect(onError).not.toHaveBeenCalled()
    })
  })

  describe('declined result reconstruction on restore', () => {
    /** A `complete` snapshot carrying result metadata but no artifacts. */
    function createResultOnlyHydratingConnection(): ConnectConnectionAdapter {
      return {
        async *connect() {},
        hydrateGeneration: vi.fn(
          async (): Promise<GenerationHydrationResult> => ({
            resumeSnapshot: {
              schemaVersion: 1,
              resumeState: null,
              status: 'complete',
              result: { id: 'result-1', model: 'image-model' },
            },
            activeRun: null,
          }),
        ),
      }
    }

    it('reports a complete snapshot the activity mapper cannot rebuild', async () => {
      // The persisted record says the run completed, but its output artifact
      // carries no serve `url` — so `reconstructImageResult` declines. A
      // `success` status with a `null` result is unrenderable and hides the
      // cause, so the restore settles as an error instead.
      const onError = vi.fn()
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: null,
          status: 'complete' as const,
          activity: 'image',
          result: { id: 'srv-img', model: 'test-image', artifacts: [] },
        },
        activeRun: null,
      }))
      const client = new GenerationClient({
        threadId: 'thread-unrestorable',
        connection: { async *connect() {}, hydrateGeneration },
        persistence: true,
        reconstructResult: reconstructImageResult,
        onError,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getResult()).toBeNull()
      expect(client.getError()?.message).toMatch(/could not be rebuilt/)
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('stays a plain success when no reconstructResult mapper is configured', async () => {
      // Nothing declined — there is simply nothing to rebuild. The generic
      // client with no mapper must keep restoring as it always has.
      const onError = vi.fn()
      const connection = createResultOnlyHydratingConnection()
      const client = new GenerationClient({
        threadId: 'thread-no-mapper',
        connection,
        persistence: true,
        onError,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getResumeSnapshot()).toMatchObject({
          status: 'complete',
        })
      })
      expect(client.getStatus()).toBe('success')
      expect(client.getResult()).toBeNull()
      expect(onError).not.toHaveBeenCalled()
    })

    it('does not report a decline while a restored run is still in flight', async () => {
      // A `running` snapshot has no result yet by definition; the rejoin
      // delivers it. Reporting the decline here would error out every resume.
      const runId = 'run-still-live'
      const onError = vi.fn()
      const joinRun = vi.fn(async function* () {
        yield {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { id: 'late-img', model: 'm', images: [{ url: '/x.png' }] },
          timestamp: Date.now(),
        } satisfies StreamChunk
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId: 'thread-live-decline',
          timestamp: Date.now(),
        } satisfies StreamChunk
      })
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-live-decline', runId },
          status: 'running' as const,
        },
        activeRun: { runId },
      }))
      const client = new GenerationClient({
        threadId: 'thread-live-decline',
        connection: { async *connect() {}, hydrateGeneration, joinRun },
        persistence: true,
        reconstructResult: reconstructImageResult,
        onError,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('success')
      })
      expect(client.getResult()).toMatchObject({ id: 'late-img' })
      expect(onError).not.toHaveBeenCalled()
    })

    it('reports a complete video snapshot with no durable artifact', async () => {
      const onError = vi.fn()
      const connection = createResultOnlyHydratingConnection()
      const client = new VideoGenerationClient({
        threadId: 'thread-video-unrestorable',
        connection,
        persistence: true,
        onError,
      })
      client.mountDevtools()

      await waitForCondition(() => {
        expect(client.getStatus()).toBe('error')
      })
      expect(client.getResult()).toBeNull()
      expect(client.getError()?.message).toMatch(/could not be rebuilt/)
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })
  })
})
