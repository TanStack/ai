import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { useGeneration } from '../src/use-generation'
import { useGenerateImage } from '../src/use-generate-image'
import { useGenerateAudio } from '../src/use-generate-audio'
import { useGenerateSpeech } from '../src/use-generate-speech'
import { useTranscription } from '../src/use-transcription'
import { useSummarize } from '../src/use-summarize'
import { useGenerateVideo } from '../src/use-generate-video'
import { createMockConnectionAdapter } from './test-utils'
import type {
  PersistedArtifactRef,
  StreamChunk,
  TTSResult,
  TranscriptionResult,
} from '@tanstack/ai'
import { EventType } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationResumeSnapshot,
  GenerationServerPersistence,
  RunAgentInputContext,
} from '@tanstack/ai-client'

// Helper to create generation stream chunks
function createGenerationChunks(result: unknown): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: result,
      timestamp: Date.now(),
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    },
  ]
}

// Helper to create video generation stream chunks
function createVideoChunks(jobId: string, url: string): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: 'video:job:created',
      value: { jobId },
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: 'video:status',
      value: { jobId, status: 'processing', progress: 50 },
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: { jobId, status: 'completed', url },
      timestamp: Date.now(),
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    },
  ]
}

const videoResumeSnapshot: GenerationResumeSnapshot = {
  resumeState: {
    threadId: 'thread-resume',
    runId: 'run-resume',
    cursor: 'cursor-resume',
  },
  status: 'running',
}

const replayedVideoArtifact: PersistedArtifactRef = {
  role: 'output',
  artifactId: 'artifact-video-1',
  threadId: 'thread-resume',
  runId: 'run-resume',
  name: 'video.mp4',
  mimeType: 'video/mp4',
  size: 1234,
  createdAt: '2026-07-06T00:00:00.000Z',
  externalUrl: 'https://example.com/video.mp4',
  source: {
    activity: 'video',
    path: 'runs/run-resume/video.mp4',
    provider: 'test',
    model: 'test-video',
    mediaType: 'video',
    jobId: 'job-replay',
    expiresAt: '2026-07-07T00:00:00.000Z',
  },
}

function createReplayVideoChunks(): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-resume',
      threadId: 'thread-resume',
      cursor: 'cursor-start',
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: {
        jobId: 'job-replay',
        status: 'completed',
        url: 'https://example.com/video.mp4',
        artifacts: [replayedVideoArtifact],
      },
      cursor: 'cursor-result',
      timestamp: Date.now(),
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'run-resume',
      threadId: 'thread-resume',
      cursor: 'cursor-finished',
      timestamp: Date.now(),
    },
  ]
}

function createRunContextCaptureAdapter(chunks: Array<StreamChunk>): {
  adapter: ConnectConnectionAdapter
  connect: ReturnType<typeof vi.fn>
  runContexts: Array<RunAgentInputContext | undefined>
} {
  const runContexts: Array<RunAgentInputContext | undefined> = []
  const connect = vi.fn()
  const adapter: ConnectConnectionAdapter = {
    async *connect(_messages, _data, _signal, runContext) {
      connect(runContext)
      runContexts.push(runContext)
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
  return { adapter, connect, runContexts }
}

function createDeferred<T>(): {
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

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// Helper to create error stream chunks.
// NOTE: The AG-UI spec for RUN_ERROR carries `message` directly on the event
// (not nested under `error`). We emit BOTH shapes here because GenerationClient
// supports the legacy `chunk.error.message` fallback (see generation-client.ts:
// `chunk.message ?? chunk.error?.message`). Once that fallback is removed, the
// `error` field can drop.
function createErrorChunks(message: string): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    },
    {
      type: EventType.RUN_ERROR,
      message,
      // Legacy shape preserved for the fallback branch in generation-client.ts.
      // AGUIEventSchema is `passthrough` so unknown keys are allowed at runtime;
      // the strict TS union still requires a cast on this single chunk.
      error: { message },
    } as StreamChunk,
  ]
}

describe('useGeneration', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      expect(result.current.result).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeUndefined()
      expect(result.current.status).toBe('idle')
    })
  })

  describe('fetcher mode', () => {
    it('should generate a result using fetcher', async () => {
      const mockResult = { id: '1', data: 'test' }
      const onResult = vi.fn()

      const { result } = renderHook(() =>
        useGeneration({
          fetcher: async () => mockResult,
          onResult,
        }),
      )

      await act(async () => {
        await result.current.generate({ prompt: 'test' })
      })

      expect(result.current.result).toEqual(mockResult)
      expect(result.current.status).toBe('success')
      expect(result.current.isLoading).toBe(false)
      expect(onResult).toHaveBeenCalledWith(mockResult)
    })

    it('should handle fetcher errors', async () => {
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useGeneration({
          fetcher: async () => {
            throw new Error('fetch failed')
          },
          onError,
        }),
      )

      await act(async () => {
        await result.current.generate({ prompt: 'test' })
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error?.message).toBe('fetch failed')
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('connection mode', () => {
    it('should process stream and extract result', async () => {
      const mockResult = {
        id: '1',
        images: [{ url: 'http://example.com/img.png' }],
      }
      const chunks = createGenerationChunks(mockResult)
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      await act(async () => {
        await result.current.generate({ prompt: 'test' })
      })

      expect(result.current.result).toEqual(mockResult)
      expect(result.current.status).toBe('success')
    })

    it('should handle stream errors', async () => {
      const chunks = createErrorChunks('Generation failed')
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      await act(async () => {
        await result.current.generate({ prompt: 'test' })
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error?.message).toBe('Generation failed')
    })
  })

  describe('stop and reset', () => {
    it('should stop generation and return to idle', async () => {
      let resolvePromise: (value: any) => void

      const { result } = renderHook(() =>
        useGeneration({
          fetcher: async () =>
            new Promise((resolve) => {
              resolvePromise = resolve
            }),
        }),
      )

      act(() => {
        result.current.generate({ prompt: 'test' })
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      act(() => {
        result.current.stop()
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.status).toBe('idle')

      resolvePromise!({ id: '1' })
    })

    it('should reset all state', async () => {
      const { result } = renderHook(() =>
        useGeneration({
          fetcher: async () => ({ id: '1' }),
        }),
      )

      await act(async () => {
        await result.current.generate({ prompt: 'test' })
      })

      expect(result.current.result).toEqual({ id: '1' })

      act(() => {
        result.current.reset()
      })

      expect(result.current.result).toBeNull()
      expect(result.current.error).toBeUndefined()
      expect(result.current.status).toBe('idle')
    })
  })

  describe('cleanup', () => {
    it('should call stop on unmount during active generation', async () => {
      let resolvePromise: (value: any) => void

      const { result, unmount } = renderHook(() =>
        useGeneration({
          fetcher: async () => {
            return new Promise((resolve) => {
              resolvePromise = resolve
            })
          },
        }),
      )

      // Start generation (don't await — it's in-flight)
      act(() => {
        result.current.generate({ prompt: 'test' })
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      // Unmount should trigger cleanup (calls client.stop())
      unmount()

      // Resolve the promise after unmount — should not cause errors
      resolvePromise!({ id: '1' })
    })

    it('should not generate when stop is called before auto-resume hydration finishes', async () => {
      const hydration = createDeferred<GenerationResumeSnapshot | null>()
      const connect = vi.fn()
      const adapter: ConnectConnectionAdapter = {
        async *connect() {
          connect()
        },
      }
      const persistence: GenerationServerPersistence = {
        getItem: vi.fn(() => hydration.promise),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      }

      const { result } = renderHook(() =>
        useGeneration({
          id: 'auto-resume-stop',
          connection: adapter,
          persistence: { server: persistence },
        }),
      )

      await waitFor(() => {
        expect(persistence.getItem).toHaveBeenCalledWith('auto-resume-stop')
      })

      act(() => {
        result.current.stop()
      })

      hydration.resolve({
        resumeState: {
          threadId: 'thread-resume',
          runId: 'run-resume',
          cursor: 'cursor-resume',
        },
        status: 'running',
      })
      await act(async () => {
        await flushPromises()
      })

      expect(connect).not.toHaveBeenCalled()
    })

    it('should report auto-resume hydration rejections without unhandled rejections', async () => {
      const onError = vi.fn()
      const hydrationError = new Error('hydrate failed')
      const persistence: GenerationServerPersistence = {
        getItem: vi.fn(async () => {
          throw hydrationError
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      }

      const { result } = renderHook(() =>
        useGeneration({
          id: 'auto-resume-reject',
          connection: createMockConnectionAdapter(),
          persistence: { server: persistence },
          onError,
        }),
      )

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(hydrationError)
        expect(result.current.error).toBe(hydrationError)
        expect(result.current.status).toBe('error')
      })
    })
  })
})

describe('useGenerateImage', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateImage({ connection: adapter }),
    )

    expect(result.current.result).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('should generate images using fetcher', async () => {
    const mockResult = {
      id: 'img-1',
      images: [{ url: 'http://example.com/img.png' }],
      model: 'dall-e-3',
    }

    const { result } = renderHook(() =>
      useGenerateImage({
        fetcher: async () => mockResult,
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'A sunset' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })

  it('should generate images using connection', async () => {
    const mockResult = {
      images: [{ url: 'http://example.com/img.png' }],
      model: 'dall-e-3',
    }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useGenerateImage({ connection: adapter }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'A sunset' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })

  it('should handle errors', async () => {
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useGenerateImage({
        fetcher: async () => {
          throw new Error('Image generation failed')
        },
        onError,
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'test' })
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error?.message).toBe('Image generation failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should expose stop and reset', async () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateImage({ connection: adapter }),
    )

    expect(typeof result.current.stop).toBe('function')
    expect(typeof result.current.reset).toBe('function')
  })
})

describe('useGenerateSpeech', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateSpeech({ connection: adapter }),
    )

    expect(result.current.result).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('should generate speech using fetcher', async () => {
    const mockResult = {
      id: 'tts-1',
      audio: 'base64data',
      format: 'mp3' as const,
      model: 'tts-1',
    }

    const { result } = renderHook(() =>
      useGenerateSpeech({
        fetcher: async () => mockResult,
      }),
    )

    await act(async () => {
      await result.current.generate({ text: 'Hello world' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })

  it('should generate speech using connection', async () => {
    const mockResult = { audio: 'base64data', format: 'mp3', model: 'tts-1' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useGenerateSpeech({ connection: adapter }),
    )

    await act(async () => {
      await result.current.generate({ text: 'Hello world' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })
})

describe('useGenerateAudio', () => {
  const mockAudioResult = {
    id: 'audio-1',
    model: 'fal-ai/diffrhythm',
    audio: {
      url: 'https://example.com/a.mp3',
      contentType: 'audio/mpeg',
      duration: 10,
    },
  }

  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateAudio({ connection: adapter }),
    )

    expect(result.current.result).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('should generate audio using fetcher', async () => {
    const { result } = renderHook(() =>
      useGenerateAudio({
        fetcher: async () => mockAudioResult,
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'Upbeat synths', duration: 10 })
    })

    expect(result.current.result).toEqual(mockAudioResult)
    expect(result.current.status).toBe('success')
  })

  it('should generate audio using connection', async () => {
    const chunks = createGenerationChunks(mockAudioResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useGenerateAudio({ connection: adapter }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'Upbeat synths', duration: 10 })
    })

    expect(result.current.result).toEqual(mockAudioResult)
    expect(result.current.status).toBe('success')
  })
})

describe('useTranscription', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useTranscription({ connection: adapter }),
    )

    expect(result.current.result).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('should transcribe audio using fetcher', async () => {
    const mockResult = {
      id: 'trans-1',
      text: 'Hello world',
      model: 'whisper-1',
    }

    const { result } = renderHook(() =>
      useTranscription({
        fetcher: async () => mockResult,
      }),
    )

    await act(async () => {
      await result.current.generate({ audio: 'base64audio' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })

  it('should transcribe audio using connection', async () => {
    const mockResult = { text: 'Hello world', model: 'whisper-1' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useTranscription({ connection: adapter }),
    )

    await act(async () => {
      await result.current.generate({ audio: 'base64audio' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })
})

describe('useSummarize', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() => useSummarize({ connection: adapter }))

    expect(result.current.result).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('should summarize text using fetcher', async () => {
    const mockResult = {
      id: 'sum-1',
      summary: 'A brief summary',
      model: 'gpt-5.5',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    }

    const { result } = renderHook(() =>
      useSummarize({
        fetcher: async () => mockResult,
      }),
    )

    await act(async () => {
      await result.current.generate({ text: 'Long text to summarize...' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })

  it('should summarize text using connection', async () => {
    const mockResult = { summary: 'A brief summary', model: 'gpt-5.5' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() => useSummarize({ connection: adapter }))

    await act(async () => {
      await result.current.generate({ text: 'Long text to summarize...' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })
})

describe('useGenerateVideo', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateVideo({ connection: adapter }),
    )

    expect(result.current.result).toBeNull()
    expect(result.current.jobId).toBeNull()
    expect(result.current.videoStatus).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('should generate video using fetcher', async () => {
    const mockResult = {
      jobId: 'job-1',
      status: 'completed' as const,
      url: 'https://example.com/video.mp4',
    }

    const { result } = renderHook(() =>
      useGenerateVideo({
        fetcher: async () => mockResult,
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'A flying car' })
    })

    expect(result.current.result).toEqual(mockResult)
    expect(result.current.status).toBe('success')
  })

  it('should track video job lifecycle via connection', async () => {
    const chunks = createVideoChunks('job-123', 'https://example.com/video.mp4')
    const adapter = createMockConnectionAdapter({ chunks })
    const onJobCreated = vi.fn()
    const onStatusUpdate = vi.fn()

    const { result } = renderHook(() =>
      useGenerateVideo({
        connection: adapter,
        onJobCreated,
        onStatusUpdate,
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'A flying car' })
    })

    expect(result.current.result).toEqual(
      expect.objectContaining({
        jobId: 'job-123',
        url: 'https://example.com/video.mp4',
      }),
    )
    expect(result.current.jobId).toBe('job-123')
    expect(result.current.status).toBe('success')
    expect(onJobCreated).toHaveBeenCalledWith('job-123')
    expect(onStatusUpdate).toHaveBeenCalled()
  })

  it('should handle video generation errors', async () => {
    const chunks = createErrorChunks('Video generation failed')
    const adapter = createMockConnectionAdapter({ chunks })
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useGenerateVideo({
        connection: adapter,
        onError,
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'test' })
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error?.message).toBe('Video generation failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should stop and reset', async () => {
    const { result } = renderHook(() =>
      useGenerateVideo({
        fetcher: async () => ({
          jobId: 'job-1',
          status: 'completed' as const,
          url: 'https://example.com/video.mp4',
        }),
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'test' })
    })

    expect(result.current.result).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.result).toBeNull()
    expect(result.current.jobId).toBeNull()
    expect(result.current.videoStatus).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('should auto-resume on mount by default from an initial snapshot', async () => {
    const { adapter, connect, runContexts } = createRunContextCaptureAdapter(
      createReplayVideoChunks(),
    )

    const { result } = renderHook(() =>
      useGenerateVideo({
        connection: adapter,
        initialResumeSnapshot: videoResumeSnapshot,
      }),
    )

    await waitFor(() => {
      expect(connect).toHaveBeenCalledTimes(1)
    })
    expect(runContexts[0]).toEqual(videoResumeSnapshot.resumeState)

    await waitFor(() => {
      expect(result.current.result).toEqual(
        expect.objectContaining({
          jobId: 'job-replay',
          artifacts: [replayedVideoArtifact],
        }),
      )
      expect(result.current.resumeSnapshot).toEqual(
        expect.objectContaining({
          status: 'complete',
          resumeState: null,
          pendingArtifacts: [replayedVideoArtifact],
        }),
      )
    })
  })

  it('should not auto-resume when autoResume is false', async () => {
    const { adapter, connect } = createRunContextCaptureAdapter(
      createReplayVideoChunks(),
    )

    const { result } = renderHook(() =>
      useGenerateVideo({
        connection: adapter,
        initialResumeSnapshot: videoResumeSnapshot,
        autoResume: false,
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(connect).not.toHaveBeenCalled()
    expect(result.current.resumeSnapshot).toEqual(videoResumeSnapshot)
  })

  it('should explicitly resume from the current snapshot', async () => {
    const { adapter, connect, runContexts } = createRunContextCaptureAdapter(
      createReplayVideoChunks(),
    )

    const { result } = renderHook(() =>
      useGenerateVideo({
        connection: adapter,
        initialResumeSnapshot: videoResumeSnapshot,
        autoResume: false,
      }),
    )

    let didResume = false
    await act(async () => {
      didResume = await result.current.resume()
    })

    expect(didResume).toBe(true)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(runContexts[0]).toEqual(videoResumeSnapshot.resumeState)
  })

  it('should abort the current request without clearing durable resume state', async () => {
    let abortSignal: AbortSignal | undefined
    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, signal) {
        abortSignal = signal
        yield {
          type: EventType.RUN_STARTED,
          runId: 'run-resume',
          threadId: 'thread-resume',
          cursor: 'cursor-live',
          timestamp: Date.now(),
        }
        await new Promise<void>(() => {})
      },
    }

    const { result } = renderHook(() =>
      useGenerateVideo({
        connection: adapter,
        initialResumeSnapshot: videoResumeSnapshot,
        autoResume: false,
      }),
    )

    act(() => {
      void result.current.resume()
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true)
      expect(result.current.resumeState).toEqual({
        threadId: 'thread-resume',
        runId: 'run-resume',
        cursor: 'cursor-live',
      })
    })

    act(() => {
      result.current.stop()
    })

    expect(abortSignal?.aborted).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.resumeState).toEqual({
      threadId: 'thread-resume',
      runId: 'run-resume',
      cursor: 'cursor-live',
    })
  })

  it('should not generate video when unmounted before auto-resume hydration finishes', async () => {
    const hydration = createDeferred<GenerationResumeSnapshot | null>()
    const connect = vi.fn()
    const adapter: ConnectConnectionAdapter = {
      async *connect() {
        connect()
      },
    }
    const persistence: GenerationServerPersistence = {
      getItem: vi.fn(() => hydration.promise),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    const { unmount } = renderHook(() =>
      useGenerateVideo({
        id: 'video-auto-resume-unmount',
        connection: adapter,
        persistence: { server: persistence },
      }),
    )

    await waitFor(() => {
      expect(persistence.getItem).toHaveBeenCalledWith(
        'video-auto-resume-unmount',
      )
    })

    unmount()
    hydration.resolve({
      resumeState: {
        threadId: 'thread-resume',
        runId: 'run-resume',
        cursor: 'cursor-resume',
      },
      status: 'running',
    })
    await flushPromises()

    expect(connect).not.toHaveBeenCalled()
  })

  it('should report video auto-resume hydration rejections without unhandled rejections', async () => {
    const onError = vi.fn()
    const hydrationError = new Error('video hydrate failed')
    const persistence: GenerationServerPersistence = {
      getItem: vi.fn(async () => {
        throw hydrationError
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    const { result } = renderHook(() =>
      useGenerateVideo({
        id: 'video-auto-resume-reject',
        connection: createMockConnectionAdapter(),
        persistence: { server: persistence },
        onError,
      }),
    )

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(hydrationError)
      expect(result.current.error).toBe(hydrationError)
      expect(result.current.status).toBe('error')
    })
  })
})

describe('onResult transform', () => {
  it('should transform result when onResult returns a value (fetcher)', async () => {
    // Inference (issue #848): `onResult`'s parameter is contextually typed from
    // the fetcher's return, and `result` narrows to the transform's return —
    // no explicit type arguments needed.
    const { result } = renderHook(() =>
      useGeneration({
        fetcher: async () => ({ id: '1', audio: 'base64data' }),
        onResult: (raw) => ({ playable: raw.audio.length > 0 }),
      }),
    )
    expectTypeOf(result.current.result).toEqualTypeOf<{
      playable: boolean
    } | null>()

    await act(async () => {
      await result.current.generate({ prompt: 'test' })
    })

    expect(result.current.result).toEqual({ playable: true })
    expect(result.current.status).toBe('success')
  })

  it('should use raw result when onResult returns void', async () => {
    const onResult = vi.fn()

    const { result } = renderHook(() =>
      useGeneration({
        fetcher: async () => ({ id: '1', data: 'test' }),
        onResult,
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'test' })
    })

    expect(onResult).toHaveBeenCalledWith({ id: '1', data: 'test' })
    expect(result.current.result).toEqual({ id: '1', data: 'test' })
  })

  it('should keep previous result when onResult returns null', async () => {
    const { result } = renderHook(() =>
      useGeneration({
        fetcher: async () => ({ id: '1' }),
        onResult: () => null,
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'test' })
    })

    // null return → keep previous (which was null initially)
    expect(result.current.result).toBeNull()
    expect(result.current.status).toBe('success')
  })

  it('should transform result from connection stream', async () => {
    type StreamResult = { id: string; images: Array<string> }
    const mockResult: StreamResult = { id: '1', images: ['img1', 'img2'] }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    // `connection` is untyped, but annotating the `onResult` parameter gives the
    // base hook a site to infer `TResult` from (it appears directly in the
    // callback parameter position) — no explicit type arguments needed.
    const { result } = renderHook(() =>
      useGeneration({
        connection: adapter,
        onResult: (raw: StreamResult) => ({ count: raw.images.length }),
      }),
    )
    expectTypeOf(result.current.result).toEqualTypeOf<{
      count: number
    } | null>()

    await act(async () => {
      await result.current.generate({ prompt: 'test' })
    })

    expect(result.current.result).toEqual({ count: 2 })
  })

  it('should work with useGenerateSpeech transform', async () => {
    const mockTTSResult: TTSResult = {
      id: '1',
      model: 'tts-1',
      audio: 'base64audio',
      format: 'mp3',
      contentType: 'audio/mpeg',
    }

    // Inference (issue #848): the wrapper hooks infer the output type from
    // `onResult` with no explicit type argument. `raw` is contextually typed
    // as `TTSResult`.
    const { result } = renderHook(() =>
      useGenerateSpeech({
        fetcher: async () => mockTTSResult,
        onResult: (raw) => ({
          audioUrl: `data:${raw.contentType};base64,${raw.audio}`,
        }),
      }),
    )
    expectTypeOf(result.current.result).toEqualTypeOf<{
      audioUrl: string
    } | null>()

    await act(async () => {
      await result.current.generate({ text: 'Hello' })
    })

    expect(result.current.result).toEqual({
      audioUrl: 'data:audio/mpeg;base64,base64audio',
    })
  })

  it('infers the raw result type when no onResult is provided', () => {
    const { result } = renderHook(() =>
      useTranscription({
        fetcher: async () => ({ id: '1', text: 'hi', model: 'whisper-1' }),
      }),
    )
    // Without a transform, `result` stays the raw TranscriptionResult.
    expectTypeOf(
      result.current.result,
    ).toEqualTypeOf<TranscriptionResult | null>()
  })

  it('narrows the wrapper result type to the transform return', () => {
    const { result } = renderHook(() =>
      useTranscription({
        fetcher: async () => ({ id: '1', text: 'hi', model: 'whisper-1' }),
        onResult: (res) => res.text,
      }),
    )
    expectTypeOf(result.current.result).toEqualTypeOf<string | null>()
  })
})
