import { describe, it, expect, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { VideoGenerationClient } from '../src/video-generation-client'
import type { StreamChunk } from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { VideoGenerateInput } from '../src/generation-types'

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
        async (
          _input: VideoGenerateInput,
          options?: { signal: AbortSignal },
        ) => {
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
      let resolveFirst: (value: {
        jobId: string
        status: 'completed'
        url: string
      }) => void
      let callCount = 0

      const client = new VideoGenerationClient({
        fetcher: async () => {
          callCount++
          return new Promise<{
            jobId: string
            status: 'completed'
            url: string
          }>((resolve) => {
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'video:job:created',
          value: { jobId: 'job-123' },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'video:status',
          value: {
            jobId: 'job-123',
            status: 'processing',
            progress: 50,
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'video:status',
          value: {
            jobId: 'job-123',
            status: 'completed',
            progress: 100,
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: {
            jobId: 'job-123',
            status: 'completed',
            url: 'https://example.com/video.mp4',
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' as const } },
          timestamp: Date.now(),
        },
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
      expect(client.getSnapshot().runId).toBeNull()
    })

    it('should track video status updates', async () => {
      const onVideoStatusChange = vi.fn()

      const connection = createMockConnection([
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'video:status',
          value: {
            jobId: 'job-1',
            status: 'processing',
            progress: 25,
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: {
            jobId: 'job-1',
            status: 'completed',
            url: 'https://example.com/video.mp4',
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' as const } },
          timestamp: Date.now(),
        },
      ])

      const client = new VideoGenerationClient({
        connection,
        onVideoStatusChange,
      })

      await client.generate({ prompt: 'test' })

      expect(onVideoStatusChange).toHaveBeenCalledWith({
        jobId: 'job-1',
        status: 'processing',
        progress: 25,
      })
      expect(client.getVideoStatus()).toEqual({
        jobId: 'job-1',
        status: 'completed',
        progress: 100,
        url: 'https://example.com/video.mp4',
      })
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
          message: 'Video generation failed',
          runId: 'run-1',
          error: { message: 'Video generation failed' },
          timestamp: Date.now(),
        },
      ])

      const client = new VideoGenerationClient({
        connection,
        onError,
      })

      await client.generate({ prompt: 'test' })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(client.getStatus()).toBe('error')
      expect(client.getError()?.message).toBe('Video generation failed')
      expect(client.getSnapshot().runId).toBeNull()
    })

    it('should report progress from video:status events', async () => {
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
          name: 'video:status',
          value: {
            jobId: 'job-1',
            status: 'processing',
            progress: 50,
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' as const } },
          timestamp: Date.now(),
        },
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:progress',
          value: { progress: 75, message: 'Almost done' },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' as const } },
          timestamp: Date.now(),
        },
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
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: {
            jobId: 'job-1',
            status: 'completed',
            url: 'https://example.com/video.mp4',
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' as const } },
          timestamp: Date.now(),
        },
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
        yield {
          type: EventType.RUN_FINISHED as const,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' as const } },
          timestamp: Date.now(),
        }
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
        expect.objectContaining({
          threadId: expect.stringMatching(/^video-/),
          runId: expect.stringMatching(/^run-/),
        }),
      )
    })
  })

  describe('stop()', () => {
    it('should abort in-flight request and reset to idle', async () => {
      let resolvePromise: (value: {
        jobId: string
        status: 'completed'
        url: string
      }) => void

      const client = new VideoGenerationClient({
        fetcher: async () => {
          return new Promise<{
            jobId: string
            status: 'completed'
            url: string
          }>((resolve) => {
            resolvePromise = resolve
          })
        },
      })

      const generatePromise = client.generate({ prompt: 'test' })
      expect(client.getIsLoading()).toBe(true)
      expect(client.getSnapshot().runId).toEqual(expect.any(String))

      client.stop()
      expect(client.getIsLoading()).toBe(false)
      expect(client.getStatus()).toBe('idle')
      expect(client.getSnapshot().runId).toBeNull()

      resolvePromise!({
        jobId: 'job-1',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      })
      await generatePromise
    })

    it('should not overwrite a run started by the stopped loading callback', async () => {
      const firstVideo = {
        jobId: 'job-1',
        status: 'completed' as const,
        url: 'https://example.com/first.mp4',
      }
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseFirst!: (value: typeof firstVideo) => void
      let releaseSecond!: (value: typeof secondVideo) => void
      const firstResult = new Promise<typeof firstVideo>((resolve) => {
        releaseFirst = resolve
      })
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      let secondGenerate: Promise<void> | undefined
      let secondRunId: string | null = null
      let replaced = false
      let client!: VideoGenerationClient
      client = new VideoGenerationClient({
        fetcher: async (input) =>
          input.prompt === 'first' ? firstResult : secondResult,
        onLoadingChange: (isLoading) => {
          if (isLoading || replaced) return
          replaced = true
          secondGenerate = client.generate({ prompt: 'second' })
          secondRunId = client.getSnapshot().runId
        },
      })

      const firstGenerate = client.generate({ prompt: 'first' })
      client.stop()

      expect(secondRunId).not.toBeNull()
      expect(client.getSnapshot().runId).toBe(secondRunId)
      expect(client.getIsLoading()).toBe(true)
      expect(client.getStatus()).toBe('generating')
      releaseFirst(firstVideo)
      releaseSecond(secondVideo)
      await Promise.all([firstGenerate, secondGenerate])
    })

    it('should clear the run id when the success status callback stops', async () => {
      let client!: VideoGenerationClient
      client = new VideoGenerationClient({
        fetcher: async () => ({
          jobId: 'job-1',
          status: 'completed',
          url: 'https://example.com/video.mp4',
        }),
        onStatusChange: (status) => {
          if (status === 'success') client.stop()
        },
      })

      await client.generate({ prompt: 'test' })

      expect(client.getStatus()).toBe('success')
      expect(client.getSnapshot().runId).toBeNull()
      expect(client.getResumeSnapshot()).toBeUndefined()
    })

    it('should remain stopped when the error callback stops', async () => {
      let client!: VideoGenerationClient
      client = new VideoGenerationClient({
        fetcher: async () => {
          throw new Error('failed')
        },
        onErrorChange: (error) => {
          if (error) client.stop()
        },
      })

      await client.generate({ prompt: 'test' })

      expect(client.getStatus()).toBe('idle')
      expect(client.getSnapshot().runId).toBeNull()
    })

    it('should stop before transport work when loading callback stops', async () => {
      const fetcher = vi.fn(async () => ({
        jobId: 'unexpected',
        status: 'completed' as const,
        url: 'https://example.com/unexpected.mp4',
      }))
      let client!: VideoGenerationClient
      client = new VideoGenerationClient({
        fetcher,
        onLoadingChange: (isLoading) => {
          if (isLoading) client.stop()
        },
      })

      await client.generate({ prompt: 'test' })

      expect(fetcher).not.toHaveBeenCalled()
      expect(client.getStatus()).toBe('idle')
      expect(client.getSnapshot().runId).toBeNull()
    })

    it('should not let initialization continue after loading callback starts a replacement', async () => {
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseSecond!: (value: typeof secondVideo) => void
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      const prompts: Array<string> = []
      let client!: VideoGenerationClient
      let replaced = false
      let secondGenerate: Promise<void> | undefined
      client = new VideoGenerationClient({
        fetcher: async (input) => {
          if (typeof input.prompt === 'string') prompts.push(input.prompt)
          return input.prompt === 'second'
            ? secondResult
            : {
                jobId: 'job-1',
                status: 'completed',
                url: 'https://example.com/first.mp4',
              }
        },
        onLoadingChange: (isLoading) => {
          if (!isLoading || replaced) return
          replaced = true
          client.stop()
          secondGenerate = client.generate({ prompt: 'second' })
        },
      })

      await client.generate({ prompt: 'first' })

      expect(prompts).toEqual(['second'])
      expect(client.getStatus()).toBe('generating')
      releaseSecond(secondVideo)
      await secondGenerate
    })

    it('should not let an old result callback complete a replacement run', async () => {
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseSecond!: (value: typeof secondVideo) => void
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      let client!: VideoGenerationClient
      let secondGenerate: Promise<void> | undefined
      let secondRunId: string | null = null
      client = new VideoGenerationClient({
        fetcher: async (input) =>
          input.prompt === 'first'
            ? {
                jobId: 'job-1',
                status: 'completed',
                url: 'https://example.com/first.mp4',
              }
            : secondResult,
        onResultChange: (result) => {
          if (result?.jobId !== 'job-1') return
          client.stop()
          secondGenerate = client.generate({ prompt: 'second' })
          secondRunId = client.getSnapshot().runId
        },
      })

      await client.generate({ prompt: 'first' })

      expect(secondRunId).not.toBeNull()
      expect(client.getSnapshot().runId).toBe(secondRunId)
      expect(client.getStatus()).toBe('generating')
      expect(client.getResumeSnapshot()).toBeUndefined()
      releaseSecond(secondVideo)
      await secondGenerate
    })

    it('should not let an old error callback overwrite a replacement run', async () => {
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseSecond!: (value: typeof secondVideo) => void
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      let client!: VideoGenerationClient
      let secondGenerate: Promise<void> | undefined
      let secondRunId: string | null = null
      client = new VideoGenerationClient({
        fetcher: async (input) => {
          if (input.prompt === 'first') throw new Error('first failed')
          return secondResult
        },
        onErrorChange: (error) => {
          if (error?.message !== 'first failed') return
          client.stop()
          secondGenerate = client.generate({ prompt: 'second' })
          secondRunId = client.getSnapshot().runId
        },
      })

      await client.generate({ prompt: 'first' })

      expect(secondRunId).not.toBeNull()
      expect(client.getSnapshot().runId).toBe(secondRunId)
      expect(client.getStatus()).toBe('generating')
      releaseSecond(secondVideo)
      await secondGenerate
    })

    it('should not let an old error status callback overwrite a replacement run', async () => {
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseSecond!: (value: typeof secondVideo) => void
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      let client!: VideoGenerationClient
      let secondGenerate: Promise<void> | undefined
      let replaced = false
      client = new VideoGenerationClient({
        fetcher: async (input) => {
          if (input.prompt === 'first') throw new Error('first failed')
          return secondResult
        },
        onStatusChange: (status) => {
          if (status !== 'error' || replaced) return
          replaced = true
          client.stop()
          secondGenerate = client.generate({ prompt: 'second' })
        },
      })

      await client.generate({ prompt: 'first' })

      expect(client.getStatus()).toBe('generating')
      expect(client.getError()).toBeUndefined()
      releaseSecond(secondVideo)
      await secondGenerate
    })

    it('should stop before transport when the run id subscriber stops', async () => {
      const fetcher = vi.fn(async () => ({
        jobId: 'unexpected',
        status: 'completed' as const,
        url: 'https://example.com/unexpected.mp4',
      }))
      const onLoadingChange = vi.fn()
      const client = new VideoGenerationClient({ fetcher, onLoadingChange })
      client.subscribe(() => {
        if (client.getSnapshot().runId) client.stop()
      })

      await client.generate({ prompt: 'test' })

      expect(fetcher).not.toHaveBeenCalled()
      expect(onLoadingChange).not.toHaveBeenCalledWith(true)
      expect(client.getSnapshot().runId).toBeNull()
    })

    it('should not continue an old run after the run id subscriber starts a replacement', async () => {
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseSecond!: (value: typeof secondVideo) => void
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      const prompts: Array<string> = []
      let secondGenerate: Promise<void> | undefined
      let replaced = false
      const client = new VideoGenerationClient({
        fetcher: async (input) => {
          if (typeof input.prompt === 'string') prompts.push(input.prompt)
          return input.prompt === 'second'
            ? secondResult
            : {
                jobId: 'job-1',
                status: 'completed',
                url: 'https://example.com/first.mp4',
              }
        },
      })
      client.subscribe(() => {
        if (!client.getSnapshot().runId || replaced) return
        replaced = true
        client.stop()
        secondGenerate = client.generate({ prompt: 'second' })
      })

      await client.generate({ prompt: 'first' })

      expect(prompts).toEqual(['second'])
      expect(client.getStatus()).toBe('generating')
      releaseSecond(secondVideo)
      await secondGenerate
    })

    it('should not call the loading callback after its snapshot subscriber stops', async () => {
      const fetcher = vi.fn(async () => ({
        jobId: 'unexpected',
        status: 'completed' as const,
        url: 'https://example.com/unexpected.mp4',
      }))
      const onLoadingChange = vi.fn()
      const client = new VideoGenerationClient({ fetcher, onLoadingChange })
      client.subscribe(() => {
        if (client.getSnapshot().isLoading) client.stop()
      })

      await client.generate({ prompt: 'test' })

      expect(fetcher).not.toHaveBeenCalled()
      expect(onLoadingChange).not.toHaveBeenCalledWith(true)
    })

    it('should not call the old status callback after its subscriber starts a replacement', async () => {
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseSecond!: (value: typeof secondVideo) => void
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      const generatingStatuses: Array<string> = []
      let secondGenerate: Promise<void> | undefined
      let replaced = false
      const client = new VideoGenerationClient({
        fetcher: async (input) =>
          input.prompt === 'second'
            ? secondResult
            : {
                jobId: 'job-1',
                status: 'completed',
                url: 'https://example.com/first.mp4',
              },
        onStatusChange: (status) => {
          if (status === 'generating') generatingStatuses.push(status)
        },
      })
      client.subscribe(() => {
        if (client.getSnapshot().status !== 'generating' || replaced) return
        replaced = true
        client.stop()
        secondGenerate = client.generate({ prompt: 'second' })
      })

      await client.generate({ prompt: 'first' })

      expect(generatingStatuses).toEqual(['generating'])
      expect(client.getStatus()).toBe('generating')
      releaseSecond(secondVideo)
      await secondGenerate
    })

    it('should not call the old result callback after its subscriber starts a replacement', async () => {
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseSecond!: (value: typeof secondVideo) => void
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      const onResultChange = vi.fn()
      let secondGenerate: Promise<void> | undefined
      let replaced = false
      const client = new VideoGenerationClient({
        fetcher: async (input) =>
          input.prompt === 'second'
            ? secondResult
            : {
                jobId: 'job-1',
                status: 'completed',
                url: 'https://example.com/first.mp4',
              },
        onResultChange,
      })
      client.subscribe(() => {
        if (client.getResult()?.jobId !== 'job-1' || replaced) return
        replaced = true
        client.stop()
        secondGenerate = client.generate({ prompt: 'second' })
      })

      await client.generate({ prompt: 'first' })

      expect(onResultChange).not.toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-1' }),
      )
      expect(client.getStatus()).toBe('generating')
      releaseSecond(secondVideo)
      await secondGenerate
    })

    it('should not call the old error callback after its subscriber starts a replacement', async () => {
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseSecond!: (value: typeof secondVideo) => void
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      const onErrorChange = vi.fn()
      let secondGenerate: Promise<void> | undefined
      let replaced = false
      const client = new VideoGenerationClient({
        fetcher: async (input) => {
          if (input.prompt === 'first') throw new Error('first failed')
          return secondResult
        },
        onErrorChange,
      })
      client.subscribe(() => {
        if (client.getError()?.message !== 'first failed' || replaced) return
        replaced = true
        client.stop()
        secondGenerate = client.generate({ prompt: 'second' })
      })

      await client.generate({ prompt: 'first' })

      expect(onErrorChange).not.toHaveBeenCalledWith(expect.any(Error))
      expect(client.getStatus()).toBe('generating')
      releaseSecond(secondVideo)
      await secondGenerate
    })
  })

  describe('reset()', () => {
    it('should clear all state and return to idle', async () => {
      const onJobIdChange = vi.fn()
      const onVideoStatusChange = vi.fn()

      const connection = createMockConnection([
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'video:job:created',
          value: { jobId: 'job-123' },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'video:status',
          value: {
            jobId: 'job-123',
            status: 'processing',
            progress: 50,
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: {
            jobId: 'job-123',
            status: 'completed',
            url: 'https://example.com/video.mp4',
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' as const } },
          timestamp: Date.now(),
        },
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
      expect(client.getSnapshot().runId).toBeNull()
    })

    it('should not overwrite a run started by the reset loading callback', async () => {
      const seedVideo = {
        jobId: 'seed',
        status: 'completed' as const,
        url: 'https://example.com/seed.mp4',
      }
      const firstVideo = {
        jobId: 'job-1',
        status: 'completed' as const,
        url: 'https://example.com/first.mp4',
      }
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseFirst!: (value: typeof firstVideo) => void
      let releaseSecond!: (value: typeof secondVideo) => void
      const firstResult = new Promise<typeof firstVideo>((resolve) => {
        releaseFirst = resolve
      })
      const secondResult = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      let replaceOnStop = false
      let secondGenerate: Promise<void> | undefined
      let secondRunId: string | null = null
      let client!: VideoGenerationClient
      client = new VideoGenerationClient({
        fetcher: async (input) => {
          if (input.prompt === 'seed') return seedVideo
          return input.prompt === 'first' ? firstResult : secondResult
        },
        onLoadingChange: (isLoading) => {
          if (isLoading || !replaceOnStop) return
          replaceOnStop = false
          secondGenerate = client.generate({ prompt: 'second' })
          secondRunId = client.getSnapshot().runId
        },
      })
      await client.generate({ prompt: 'seed' })
      const firstGenerate = client.generate({ prompt: 'first' })
      replaceOnStop = true

      client.reset()

      expect(secondRunId).not.toBeNull()
      expect(client.getSnapshot().runId).toBe(secondRunId)
      expect(client.getStatus()).toBe('generating')
      expect(client.getIsLoading()).toBe(true)
      expect(client.getResult()).toEqual(seedVideo)
      releaseFirst(firstVideo)
      releaseSecond(secondVideo)
      await Promise.all([firstGenerate, secondGenerate])
    })
  })

  describe('dispose()', () => {
    it('should not overwrite a run started by the dispose loading callback', async () => {
      const firstVideo = {
        jobId: 'job-1',
        status: 'completed' as const,
        url: 'https://example.com/first.mp4',
      }
      const secondVideo = {
        jobId: 'job-2',
        status: 'completed' as const,
        url: 'https://example.com/second.mp4',
      }
      let releaseFirst!: (value: typeof firstVideo) => void
      let releaseSecond!: (value: typeof secondVideo) => void
      const first = new Promise<typeof firstVideo>((resolve) => {
        releaseFirst = resolve
      })
      const second = new Promise<typeof secondVideo>((resolve) => {
        releaseSecond = resolve
      })
      let replaceOnDispose = false
      let secondGenerate: Promise<void> | undefined
      let secondRunId: string | null = null
      let client!: VideoGenerationClient
      client = new VideoGenerationClient({
        fetcher: (input) => (input.prompt === 'first' ? first : second),
        onLoadingChange: (isLoading) => {
          if (isLoading || !replaceOnDispose) return
          replaceOnDispose = false
          client.mountDevtools()
          secondGenerate = client.generate({ prompt: 'second' })
          secondRunId = client.getSnapshot().runId
        },
      })
      const firstGenerate = client.generate({ prompt: 'first' })
      replaceOnDispose = true

      client.dispose()

      expect(secondRunId).not.toBeNull()
      expect(client.getSnapshot().runId).toBe(secondRunId)
      expect(client.getStatus()).toBe('generating')
      expect(client.getIsLoading()).toBe(true)
      releaseFirst(firstVideo)
      releaseSecond(secondVideo)
      await Promise.all([firstGenerate, secondGenerate])
    })
  })

  describe('updateOptions()', () => {
    it('should update body without recreating client', async () => {
      const connectSpy = vi.fn(async function* () {
        yield {
          type: EventType.RUN_FINISHED as const,
          runId: 'run-1',
          threadId: 'thread-1',
          metadata: { tanstack: { finishReason: 'stop' as const } },
          timestamp: Date.now(),
        }
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
        expect.objectContaining({
          threadId: expect.stringMatching(/^video-/),
          runId: expect.stringMatching(/^run-/),
        }),
      )
    })
  })

  describe('abort handling', () => {
    it('should not set result if aborted mid-stream', async () => {
      const onResult = vi.fn()
      const onJobCreated = vi.fn()

      const connection: ConnectConnectionAdapter = {
        async *connect(_msgs, _data, signal) {
          yield {
            type: EventType.RUN_STARTED as const,
            runId: 'run-1',
            threadId: 'thread-1',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.CUSTOM as const,
            name: 'video:job:created',
            value: { jobId: 'job-123' },
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
            value: {
              jobId: 'job-123',
              status: 'completed',
              url: 'https://example.com/video.mp4',
            },
            timestamp: Date.now(),
          }
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

    it('should not publish a run id after onChunk stops the run', async () => {
      const connection: ConnectConnectionAdapter = {
        async *connect() {
          yield {
            type: EventType.RUN_STARTED as const,
            runId: 'run-1',
            threadId: 'thread-1',
            timestamp: Date.now(),
          }
        },
      }
      let client!: VideoGenerationClient
      client = new VideoGenerationClient({
        connection,
        onChunk: (chunk) => {
          if (chunk.type === EventType.RUN_STARTED) client.stop()
        },
      })

      await client.generate({ prompt: 'test' })

      expect(client.getSnapshot().runId).toBeNull()
      expect(client.getStatus()).toBe('idle')
    })

    it('should not let an old onChunk continuation overwrite a newer run', async () => {
      let connectionCount = 0
      let releaseSecond!: () => void
      const secondBlocked = new Promise<void>((resolve) => {
        releaseSecond = resolve
      })
      const connection: ConnectConnectionAdapter = {
        async *connect() {
          connectionCount++
          if (connectionCount === 1) {
            yield {
              type: EventType.RUN_STARTED as const,
              runId: 'run-1',
              threadId: 'thread-1',
              timestamp: Date.now(),
            }
            return
          }
          await secondBlocked
        },
      }
      let client!: VideoGenerationClient
      let secondGenerate: Promise<void> | undefined
      let secondLocalRunId: string | null = null
      client = new VideoGenerationClient({
        connection,
        onChunk: (chunk) => {
          if (chunk.type !== EventType.RUN_STARTED) return
          client.stop()
          secondGenerate = client.generate({ prompt: 'second' })
          secondLocalRunId = client.getSnapshot().runId
        },
      })

      await client.generate({ prompt: 'first' })

      expect(secondLocalRunId).not.toBeNull()
      expect(client.getSnapshot().runId).toBe(secondLocalRunId)
      expect(client.getIsLoading()).toBe(true)
      client.stop()
      releaseSecond()
      await secondGenerate
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

      // @ts-expect-error verifying the runtime guard for JavaScript callers
      const client = new VideoGenerationClient({
        onError,
      })

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
