import { describe, it, expect, vi } from 'vitest'
import { VideoGenerationClient } from '../src/video-generation-client'
import type { StreamChunk } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

/** Cast an event object to StreamChunk for type compatibility with EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

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

describe('VideoGenerationClient', () => {
  describe('fetcher mode', () => {
    it('should generate a result using fetcher', async () => {
      const mockResult = {
        jobId: 'job-1',
        status: 'completed' as const,
        url: 'https://example.com/video.mp4',
      }
      const onResult = vi.fn()
      const onResultChange = vi.fn()

      const client = new VideoGenerationClient({
        fetcher: async () => mockResult,
        onResult,
        onResultChange,
      })

      await client.generate({ prompt: 'test video' })

      expect(onResult).toHaveBeenCalledWith(mockResult)
      expect(onResultChange).toHaveBeenCalledWith(mockResult)
      expect(client.getResult()).toEqual(mockResult)
      expect(client.getStatus()).toBe('success')
      expect(client.getIsLoading()).toBe(false)
    })

    it('should handle fetcher errors', async () => {
      const onError = vi.fn()
      const onErrorChange = vi.fn()

      const client = new VideoGenerationClient({
        fetcher: async () => {
          throw new Error('video fetch failed')
        },
        onError,
        onErrorChange,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(onError.mock.calls[0]![0].message).toBe('video fetch failed')
      expect(client.getStatus()).toBe('error')
      expect(client.getError()?.message).toBe('video fetch failed')
    })

    it('should track loading state during fetcher call', async () => {
      const states: Array<boolean> = []

      const client = new VideoGenerationClient({
        fetcher: async () => ({
          jobId: 'job-1',
          status: 'completed' as const,
          url: 'https://example.com/video.mp4',
        }),
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
          return {
            jobId: 'job-1',
            status: 'completed' as const,
            url: 'https://example.com/video.mp4',
          }
        },
      )

      const client = new VideoGenerationClient({
        fetcher: fetcherSpy,
      })

      await client.generate({ prompt: 'test video' })

      expect(fetcherSpy).toHaveBeenCalledTimes(1)
      expect(fetcherSpy).toHaveBeenCalledWith(
        { prompt: 'test video' },
        { signal: expect.any(AbortSignal) },
      )
    })

    it('should not allow concurrent requests', async () => {
      let resolveFirst: (value: any) => void
      let callCount = 0

      const client = new VideoGenerationClient({
        fetcher: async () => {
          callCount++
          return new Promise((resolve) => {
            resolveFirst = resolve
          })
        },
      })

      const p1 = client.generate({ prompt: 'test' })
      const p2 = client.generate({ prompt: 'test2' }) // should be no-op

      resolveFirst!({
        jobId: 'job-1',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      })
      await p1
      await p2

      expect(callCount).toBe(1)
    })
  })

  describe('connection mode', () => {
    it('should process stream with video job lifecycle events', async () => {
      const onResult = vi.fn()
      const onJobCreated = vi.fn()
      const onStatusUpdate = vi.fn()

      const connection = createMockConnection([
        asChunk({ type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() }),
        asChunk({
          type: 'CUSTOM',
          name: 'video:job:created',
          value: { jobId: 'job-123' },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'CUSTOM',
          name: 'video:status',
          value: {
            jobId: 'job-123',
            status: 'processing',
            progress: 50,
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'CUSTOM',
          name: 'video:status',
          value: {
            jobId: 'job-123',
            status: 'completed',
            progress: 100,
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'CUSTOM',
          name: 'generation:result',
          value: {
            jobId: 'job-123',
            status: 'completed',
            url: 'https://example.com/video.mp4',
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        }),
      ])

      const client = new VideoGenerationClient({
        connection,
        onResult,
        onJobCreated,
        onStatusUpdate,
      })

      await client.generate({ prompt: 'A flying car' })

      expect(onJobCreated).toHaveBeenCalledWith('job-123')
      expect(onStatusUpdate).toHaveBeenCalledTimes(2)
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-123',
          url: 'https://example.com/video.mp4',
        }),
      )
      expect(client.getStatus()).toBe('success')
      expect(client.getJobId()).toBe('job-123')
    })

    it('should track video status updates', async () => {
      const onVideoStatusChange = vi.fn()

      const connection = createMockConnection([
        asChunk({ type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() }),
        asChunk({
          type: 'CUSTOM',
          name: 'video:status',
          value: {
            jobId: 'job-1',
            status: 'processing',
            progress: 25,
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'CUSTOM',
          name: 'generation:result',
          value: {
            jobId: 'job-1',
            status: 'completed',
            url: 'https://example.com/video.mp4',
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        }),
      ])

      const client = new VideoGenerationClient({
        connection,
        onVideoStatusChange,
      })

      await client.generate({ prompt: 'test' })

      // Called with null (reset), then the status, then null (would be if reset called)
      expect(onVideoStatusChange).toHaveBeenCalledWith({
        jobId: 'job-1',
        status: 'processing',
        progress: 25,
      })
      expect(client.getVideoStatus()).toEqual({
        jobId: 'job-1',
        status: 'processing',
        progress: 25,
      })
    })

    it('should handle RUN_ERROR from stream', async () => {
      const onError = vi.fn()

      const connection = createMockConnection([
        asChunk({ type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() }),
        asChunk({
          type: 'RUN_ERROR',
          runId: 'run-1',
          error: { message: 'Video generation failed' },
          timestamp: Date.now(),
        }),
      ])

      const client = new VideoGenerationClient({
        connection,
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getStatus()).toBe('error')
      expect(client.getError()?.message).toBe('Video generation failed')
    })

    it('should report progress from video:status events', async () => {
      const onProgress = vi.fn()

      const connection = createMockConnection([
        asChunk({ type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() }),
        asChunk({
          type: 'CUSTOM',
          name: 'video:status',
          value: {
            jobId: 'job-1',
            status: 'processing',
            progress: 50,
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        }),
      ])

      const client = new VideoGenerationClient({
        connection,
        onProgress,
      })

      await client.generate({ prompt: 'test' })

      expect(onProgress).toHaveBeenCalledWith(50)
    })

    it('should report progress from generation:progress events', async () => {
      const onProgress = vi.fn()

      const connection = createMockConnection([
        asChunk({ type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() }),
        asChunk({
          type: 'CUSTOM',
          name: 'generation:progress',
          value: { progress: 75, message: 'Almost done' },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        }),
      ])

      const client = new VideoGenerationClient({
        connection,
        onProgress,
      })

      await client.generate({ prompt: 'test' })

      expect(onProgress).toHaveBeenCalledWith(75, 'Almost done')
    })

    it('should call onChunk for each stream chunk', async () => {
      const onChunk = vi.fn()

      const connection = createMockConnection([
        asChunk({ type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() }),
        asChunk({
          type: 'CUSTOM',
          name: 'generation:result',
          value: {
            jobId: 'job-1',
            status: 'completed',
            url: 'https://example.com/video.mp4',
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        }),
      ])

      const client = new VideoGenerationClient({
        connection,
        onChunk,
      })

      await client.generate({ prompt: 'test' })

      expect(onChunk).toHaveBeenCalledTimes(3)
    })

    it('should pass body and input as data to connection', async () => {
      const connectSpy = vi.fn(async function* () {
        yield asChunk({
          type: 'RUN_FINISHED' as const,
          runId: 'run-1',
          finishReason: 'stop' as const,
          timestamp: Date.now(),
        })
      })

      const connection: ConnectConnectionAdapter = { connect: connectSpy }

      const client = new VideoGenerationClient({
        connection,
        body: { model: 'runway-gen3' },
      })

      await client.generate({ prompt: 'A sunset', size: '1280x720' })

      expect(connectSpy).toHaveBeenCalledWith(
        [],
        { model: 'runway-gen3', prompt: 'A sunset', size: '1280x720' },
        expect.any(AbortSignal),
      )
    })
  })

  describe('stop()', () => {
    it('should abort in-flight request and reset to idle', async () => {
      let resolvePromise: (value: any) => void

      const client = new VideoGenerationClient({
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

      resolvePromise!({
        jobId: 'job-1',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      })
      await generatePromise
    })
  })

  describe('reset()', () => {
    it('should clear all state and return to idle', async () => {
      const onJobIdChange = vi.fn()
      const onVideoStatusChange = vi.fn()

      const connection = createMockConnection([
        asChunk({ type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() }),
        asChunk({
          type: 'CUSTOM',
          name: 'video:job:created',
          value: { jobId: 'job-123' },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'CUSTOM',
          name: 'video:status',
          value: {
            jobId: 'job-123',
            status: 'processing',
            progress: 50,
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'CUSTOM',
          name: 'generation:result',
          value: {
            jobId: 'job-123',
            status: 'completed',
            url: 'https://example.com/video.mp4',
          },
          timestamp: Date.now(),
        }),
        asChunk({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          finishReason: 'stop',
          timestamp: Date.now(),
        }),
      ])

      const client = new VideoGenerationClient({
        connection,
        onJobIdChange,
        onVideoStatusChange,
      })

      await client.generate({ prompt: 'test' })
      expect(client.getResult()).not.toBeNull()
      expect(client.getJobId()).toBe('job-123')
      expect(client.getStatus()).toBe('success')

      client.reset()
      expect(client.getResult()).toBeNull()
      expect(client.getJobId()).toBeNull()
      expect(client.getVideoStatus()).toBeNull()
      expect(client.getError()).toBeUndefined()
      expect(client.getStatus()).toBe('idle')
    })
  })

  describe('updateOptions()', () => {
    it('should update body without recreating client', async () => {
      const connectSpy = vi.fn(async function* () {
        yield asChunk({
          type: 'RUN_FINISHED' as const,
          runId: 'run-1',
          finishReason: 'stop' as const,
          timestamp: Date.now(),
        })
      })

      const connection: ConnectConnectionAdapter = { connect: connectSpy }

      const client = new VideoGenerationClient({
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
      const onJobCreated = vi.fn()

      const connection: ConnectConnectionAdapter = {
        async *connect(_msgs, _data, signal) {
          yield asChunk({
            type: 'RUN_STARTED' as const,
            runId: 'run-1',
            timestamp: Date.now(),
          })
          yield asChunk({
            type: 'CUSTOM' as const,
            name: 'video:job:created',
            value: { jobId: 'job-123' },
            timestamp: Date.now(),
          })
          // Wait until abort is triggered
          await new Promise<void>((resolve) => {
            signal?.addEventListener('abort', () => resolve())
          })
          // Adapter honors abort signal and stops yielding
          if (signal?.aborted) return
          yield asChunk({
            type: 'CUSTOM' as const,
            name: 'generation:result',
            value: {
              jobId: 'job-123',
              status: 'completed',
              url: 'https://example.com/video.mp4',
            },
            timestamp: Date.now(),
          })
        },
      }

      const client = new VideoGenerationClient({
        connection,
        onResult,
        onJobCreated,
      })

      const generatePromise = client.generate({ prompt: 'test' })
      await new Promise((r) => setTimeout(r, 0))

      client.stop()
      await generatePromise

      expect(onResult).not.toHaveBeenCalled()
      expect(client.getResult()).toBeNull()
      expect(client.getStatus()).toBe('idle')
    })
  })

  describe('error wrapping', () => {
    it('should wrap non-Error thrown values in Error', async () => {
      const onError = vi.fn()

      const client = new VideoGenerationClient({
        fetcher: async () => {
          throw 'video error string'
        },
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(onError.mock.calls[0]![0].message).toBe('video error string')
      expect(client.getError()?.message).toBe('video error string')
    })

    it('should throw if neither connection nor fetcher is provided', async () => {
      const onError = vi.fn()

      const client = new VideoGenerationClient({
        onError,
      } as any)

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getError()?.message).toBe(
        'VideoGenerationClient requires either a connection or fetcher option',
      )
    })
  })

  describe('sequential generation', () => {
    it('should allow a second generation after the first completes', async () => {
      let callCount = 0

      const client = new VideoGenerationClient({
        fetcher: async () => {
          callCount++
          return {
            jobId: `job-${callCount}`,
            status: 'completed' as const,
            url: `https://example.com/video-${callCount}.mp4`,
          }
        },
      })

      await client.generate({ prompt: 'first' })
      expect(client.getResult()?.jobId).toBe('job-1')

      await client.generate({ prompt: 'second' })
      expect(client.getResult()?.jobId).toBe('job-2')
      expect(callCount).toBe(2)
    })
  })

  describe('state transitions', () => {
    it('should follow idle -> generating -> success', async () => {
      const states: Array<string> = []

      const client = new VideoGenerationClient({
        fetcher: async () => ({
          jobId: 'job-1',
          status: 'completed' as const,
          url: 'https://example.com/video.mp4',
        }),
        onStatusChange: (status) => states.push(status),
      })

      expect(client.getStatus()).toBe('idle')
      await client.generate({ prompt: 'test' })

      expect(states).toEqual(['generating', 'success'])
    })

    it('should follow idle -> generating -> error on failure', async () => {
      const states: Array<string> = []

      const client = new VideoGenerationClient({
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
