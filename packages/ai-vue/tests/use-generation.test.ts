import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick, reactive } from 'vue'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { useGeneration } from '../src/use-generation'
import { useGenerateImage } from '../src/use-generate-image'
import { useGenerateAudio } from '../src/use-generate-audio'
import { useGenerateSpeech } from '../src/use-generate-speech'
import { useTranscription } from '../src/use-transcription'
import { useSummarize } from '../src/use-summarize'
import { useGenerateVideo } from '../src/use-generate-video'
import { createMockConnectionAdapter } from './test-utils'
import type { StreamChunk, TTSResult, TranscriptionResult } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationResumeSnapshot,
  RunAgentInputContext,
} from '@tanstack/ai-client'
import type { DeepReadonly } from 'vue'

// Helper to create generation stream chunks
function createGenerationChunks(result: unknown): Array<StreamChunk> {
  return [
    { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
    {
      type: 'CUSTOM',
      name: 'generation:result',
      value: result,
      timestamp: Date.now(),
    },
    {
      type: 'RUN_FINISHED',
      runId: 'run-1',
      finishReason: 'stop',
      timestamp: Date.now(),
    },
  ] as unknown as Array<StreamChunk>
}

// Helper to create video generation stream chunks
function createVideoChunks(jobId: string, url: string): Array<StreamChunk> {
  return [
    { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
    {
      type: 'CUSTOM',
      name: 'video:job:created',
      value: { jobId },
      timestamp: Date.now(),
    },
    {
      type: 'CUSTOM',
      name: 'video:status',
      value: { jobId, status: 'processing', progress: 50 },
      timestamp: Date.now(),
    },
    {
      type: 'CUSTOM',
      name: 'generation:result',
      value: { jobId, status: 'completed', url },
      timestamp: Date.now(),
    },
    {
      type: 'RUN_FINISHED',
      runId: 'run-1',
      finishReason: 'stop',
      timestamp: Date.now(),
    },
  ] as unknown as Array<StreamChunk>
}

const videoResumeSnapshot: GenerationResumeSnapshot = {
  resumeState: {
    threadId: 'thread-resume',
    runId: 'run-resume',
    cursor: 'cursor-resume',
  },
  status: 'running',
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createReplayVideoChunks(): Array<StreamChunk> {
  return [
    {
      type: 'RUN_STARTED',
      runId: 'run-resume',
      threadId: 'thread-resume',
      cursor: 'cursor-start',
      timestamp: Date.now(),
    },
    {
      type: 'CUSTOM',
      name: 'generation:result',
      value: {
        jobId: 'job-replay',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      },
      cursor: 'cursor-result',
      timestamp: Date.now(),
    },
    {
      type: 'RUN_FINISHED',
      runId: 'run-resume',
      threadId: 'thread-resume',
      cursor: 'cursor-finished',
      timestamp: Date.now(),
    },
  ] as unknown as Array<StreamChunk>
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

// Helper to create error stream chunks
function createErrorChunks(message: string): Array<StreamChunk> {
  return [
    { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
    {
      type: 'RUN_ERROR',
      runId: 'run-1',
      error: { message },
      timestamp: Date.now(),
    },
  ] as unknown as Array<StreamChunk>
}

/**
 * Renders a Vue composable inside a minimal defineComponent wrapper.
 * Returns the hook result (with `.value` access for refs) and the wrapper.
 */
function renderHook<T>(setup: () => T) {
  let hookResult: T
  const TestComponent = defineComponent({
    setup() {
      hookResult = setup()
      return {}
    },
    template: '<div></div>',
  })
  const wrapper = mount(TestComponent)
  return { result: hookResult!, wrapper }
}

describe('useGeneration', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      expect(result.result.value).toBeNull()
      expect(result.isLoading.value).toBe(false)
      expect(result.error.value).toBeUndefined()
      expect(result.status.value).toBe('idle')
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

      await result.generate({ prompt: 'test' })
      await flushPromises()
      await nextTick()

      expect(result.result.value).toEqual(mockResult)
      expect(result.status.value).toBe('success')
      expect(result.isLoading.value).toBe(false)
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

      await result.generate({ prompt: 'test' })
      await flushPromises()
      await nextTick()

      expect(result.status.value).toBe('error')
      expect(result.error.value?.message).toBe('fetch failed')
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

      await result.generate({ prompt: 'test' })
      await flushPromises()
      await nextTick()

      expect(result.result.value).toEqual(mockResult)
      expect(result.status.value).toBe('success')
    })

    it('should handle stream errors', async () => {
      const chunks = createErrorChunks('Generation failed')
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      await result.generate({ prompt: 'test' })
      await flushPromises()
      await nextTick()

      expect(result.status.value).toBe('error')
      expect(result.error.value?.message).toBe('Generation failed')
    })

    it('should ignore auto-resume rejection after unmount', async () => {
      const deferred = createDeferred<GenerationResumeSnapshot | null>()
      const getItem = vi.fn(() => deferred.promise)
      const onError = vi.fn()
      const { result, wrapper } = renderHook(() =>
        useGeneration({
          fetcher: async () => ({ id: '1' }),
          persistence: {
            server: {
              getItem,
              setItem: vi.fn(),
              removeItem: vi.fn(),
            },
          },
          onError,
        }),
      )

      await vi.waitFor(() => expect(getItem).toHaveBeenCalled())
      wrapper.unmount()
      deferred.reject(new Error('resume failed'))
      await deferred.promise.catch(() => {})
      await flushPromises()
      await nextTick()

      expect(onError).not.toHaveBeenCalled()
      expect(result.error.value).toBeUndefined()
      expect(result.status.value).toBe('idle')
    })

    it('should use updated resumeState without requiring a body change', async () => {
      const firstResumeState = {
        threadId: 'thread-first',
        runId: 'run-first',
        cursor: 'cursor-first',
      }
      const nextResumeState = {
        threadId: 'thread-next',
        runId: 'run-next',
        cursor: 'cursor-next',
      }
      const { adapter, runContexts } = createRunContextCaptureAdapter(
        createGenerationChunks({ id: 'resumed' }),
      )
      const options = reactive({
        connection: adapter,
        autoResume: false,
        resumeState: firstResumeState,
      })
      const { result } = renderHook(() => useGeneration(options))

      options.resumeState = nextResumeState
      await nextTick()

      await result.resume()
      await flushPromises()
      await nextTick()

      expect(runContexts[0]).toEqual(nextResumeState)
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

      const generatePromise = result.generate({ prompt: 'test' })
      await flushPromises()
      await nextTick()

      expect(result.isLoading.value).toBe(true)

      result.stop()
      await flushPromises()
      await nextTick()

      expect(result.isLoading.value).toBe(false)
      expect(result.status.value).toBe('idle')

      // Resolve the promise to clean up
      resolvePromise!({ id: '1' })
      await generatePromise.catch(() => {
        // Ignore errors from stopped generation
      })
    })

    it('should reset all state', async () => {
      const { result } = renderHook(() =>
        useGeneration({
          fetcher: async () => ({ id: '1' }),
        }),
      )

      await result.generate({ prompt: 'test' })
      await flushPromises()
      await nextTick()

      expect(result.result.value).toEqual({ id: '1' })

      result.reset()
      await flushPromises()
      await nextTick()

      expect(result.result.value).toBeNull()
      expect(result.error.value).toBeUndefined()
      expect(result.status.value).toBe('idle')
    })
  })

  describe('error handling', () => {
    it('should require either connection or fetcher', () => {
      expect(() => {
        renderHook(() => useGeneration({} as any))
      }).toThrow('useGeneration requires either a connection or fetcher option')
    })

    it('should call onChunk callback in connection mode', async () => {
      const mockResult = { id: '1' }
      const chunks = createGenerationChunks(mockResult)
      const adapter = createMockConnectionAdapter({ chunks })
      const onChunk = vi.fn()

      const { result } = renderHook(() =>
        useGeneration({ connection: adapter, onChunk }),
      )

      await result.generate({ prompt: 'test' })
      await flushPromises()
      await nextTick()

      expect(onChunk).toHaveBeenCalled()
      expect(onChunk.mock.calls.length).toBeGreaterThan(0)
    })
  })
})

describe('useGenerateImage', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateImage({ connection: adapter }),
    )

    expect(result.result.value).toBeNull()
    expect(result.isLoading.value).toBe(false)
    expect(result.status.value).toBe('idle')
  })

  it('should generate images using fetcher', async () => {
    const mockResult = {
      images: [{ url: 'http://example.com/img.png' }],
      model: 'dall-e-3',
    }

    const { result } = renderHook(() =>
      useGenerateImage({
        fetcher: async () => mockResult as any,
      }),
    )

    await result.generate({ prompt: 'A sunset' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
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

    await result.generate({ prompt: 'A sunset' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
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

    await result.generate({ prompt: 'test' })
    await flushPromises()
    await nextTick()

    expect(result.status.value).toBe('error')
    expect(result.error.value?.message).toBe('Image generation failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should expose stop and reset', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateImage({ connection: adapter }),
    )

    expect(typeof result.stop).toBe('function')
    expect(typeof result.reset).toBe('function')
  })
})

describe('useGenerateSpeech', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateSpeech({ connection: adapter }),
    )

    expect(result.result.value).toBeNull()
    expect(result.isLoading.value).toBe(false)
    expect(result.status.value).toBe('idle')
  })

  it('should generate speech using fetcher', async () => {
    const mockResult = {
      audio: 'base64data',
      format: 'mp3' as const,
      model: 'tts-1',
    }

    const { result } = renderHook(() =>
      useGenerateSpeech({
        fetcher: async () => mockResult as any,
      }),
    )

    await result.generate({ text: 'Hello world' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
  })

  it('should generate speech using connection', async () => {
    const mockResult = { audio: 'base64data', format: 'mp3', model: 'tts-1' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useGenerateSpeech({ connection: adapter }),
    )

    await result.generate({ text: 'Hello world' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
  })

  it('should handle errors', async () => {
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useGenerateSpeech({
        fetcher: async () => {
          throw new Error('Speech generation failed')
        },
        onError,
      }),
    )

    await result.generate({ text: 'test' })
    await flushPromises()
    await nextTick()

    expect(result.status.value).toBe('error')
    expect(result.error.value?.message).toBe('Speech generation failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should expose stop and reset', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateSpeech({ connection: adapter }),
    )

    expect(typeof result.stop).toBe('function')
    expect(typeof result.reset).toBe('function')
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

    expect(result.result.value).toBeNull()
    expect(result.isLoading.value).toBe(false)
    expect(result.status.value).toBe('idle')
  })

  it('should generate audio using fetcher', async () => {
    const { result } = renderHook(() =>
      useGenerateAudio({
        fetcher: async () => mockAudioResult,
      }),
    )

    await result.generate({ prompt: 'Upbeat synths', duration: 10 })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockAudioResult)
    expect(result.status.value).toBe('success')
  })

  it('should generate audio using connection', async () => {
    const chunks = createGenerationChunks(mockAudioResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useGenerateAudio({ connection: adapter }),
    )

    await result.generate({ prompt: 'Upbeat synths', duration: 10 })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockAudioResult)
    expect(result.status.value).toBe('success')
  })
})

describe('useTranscription', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useTranscription({ connection: adapter }),
    )

    expect(result.result.value).toBeNull()
    expect(result.isLoading.value).toBe(false)
    expect(result.status.value).toBe('idle')
  })

  it('should transcribe audio using fetcher', async () => {
    const mockResult = {
      text: 'Hello world',
      model: 'whisper-1',
    }

    const { result } = renderHook(() =>
      useTranscription({
        fetcher: async () => mockResult as any,
      }),
    )

    await result.generate({ audio: 'base64audio' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
  })

  it('should transcribe audio using connection', async () => {
    const mockResult = { text: 'Hello world', model: 'whisper-1' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useTranscription({ connection: adapter }),
    )

    await result.generate({ audio: 'base64audio' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
  })

  it('should handle errors', async () => {
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useTranscription({
        fetcher: async () => {
          throw new Error('Transcription failed')
        },
        onError,
      }),
    )

    await result.generate({ audio: 'base64audio' })
    await flushPromises()
    await nextTick()

    expect(result.status.value).toBe('error')
    expect(result.error.value?.message).toBe('Transcription failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should expose stop and reset', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useTranscription({ connection: adapter }),
    )

    expect(typeof result.stop).toBe('function')
    expect(typeof result.reset).toBe('function')
  })
})

describe('useSummarize', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() => useSummarize({ connection: adapter }))

    expect(result.result.value).toBeNull()
    expect(result.isLoading.value).toBe(false)
    expect(result.status.value).toBe('idle')
  })

  it('should summarize text using fetcher', async () => {
    const mockResult = {
      summary: 'A brief summary',
      model: 'gpt-5.5',
    }

    const { result } = renderHook(() =>
      useSummarize({
        fetcher: async () => mockResult as any,
      }),
    )

    await result.generate({ text: 'Long text to summarize...' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
  })

  it('should summarize text using connection', async () => {
    const mockResult = { summary: 'A brief summary', model: 'gpt-5.5' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() => useSummarize({ connection: adapter }))

    await result.generate({ text: 'Long text to summarize...' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
  })

  it('should handle errors', async () => {
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useSummarize({
        fetcher: async () => {
          throw new Error('Summarization failed')
        },
        onError,
      }),
    )

    await result.generate({ text: 'test' })
    await flushPromises()
    await nextTick()

    expect(result.status.value).toBe('error')
    expect(result.error.value?.message).toBe('Summarization failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should expose stop and reset', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() => useSummarize({ connection: adapter }))

    expect(typeof result.stop).toBe('function')
    expect(typeof result.reset).toBe('function')
  })
})

describe('useGenerateVideo', () => {
  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderHook(() =>
      useGenerateVideo({ connection: adapter }),
    )

    expect(result.result.value).toBeNull()
    expect(result.jobId.value).toBeNull()
    expect(result.videoStatus.value).toBeNull()
    expect(result.isLoading.value).toBe(false)
    expect(result.status.value).toBe('idle')
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

    await result.generate({ prompt: 'A flying car' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(mockResult)
    expect(result.status.value).toBe('success')
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

    await result.generate({ prompt: 'A flying car' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual(
      expect.objectContaining({
        jobId: 'job-123',
        url: 'https://example.com/video.mp4',
      }),
    )
    expect(result.jobId.value).toBe('job-123')
    expect(result.status.value).toBe('success')
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

    await result.generate({ prompt: 'test' })
    await flushPromises()
    await nextTick()

    expect(result.status.value).toBe('error')
    expect(result.error.value?.message).toBe('Video generation failed')
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

    await result.generate({ prompt: 'test' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).not.toBeNull()

    result.reset()
    await flushPromises()
    await nextTick()

    expect(result.result.value).toBeNull()
    expect(result.jobId.value).toBeNull()
    expect(result.videoStatus.value).toBeNull()
    expect(result.status.value).toBe('idle')
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

    const didResume = await result.resume()
    await flushPromises()
    await nextTick()

    expect(didResume).toBe(true)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(runContexts[0]).toEqual(videoResumeSnapshot.resumeState)
    expect(result.resumeSnapshot.value).toEqual(
      expect.objectContaining({
        status: 'complete',
        resumeState: null,
      }),
    )
    expect(result.result.value).toEqual(
      expect.objectContaining({
        jobId: 'job-replay',
      }),
    )
  })

  it('should ignore video auto-resume rejection after unmount', async () => {
    const deferred = createDeferred<GenerationResumeSnapshot | null>()
    const getItem = vi.fn(() => deferred.promise)
    const onError = vi.fn()
    const { result, wrapper } = renderHook(() =>
      useGenerateVideo({
        fetcher: async () => ({
          jobId: 'job-1',
          status: 'completed',
          url: 'https://example.com/video.mp4',
        }),
        persistence: {
          server: {
            getItem,
            setItem: vi.fn(),
            removeItem: vi.fn(),
          },
        },
        onError,
      }),
    )

    await vi.waitFor(() => expect(getItem).toHaveBeenCalled())
    wrapper.unmount()
    deferred.reject(new Error('video resume failed'))
    await deferred.promise.catch(() => {})
    await flushPromises()
    await nextTick()

    expect(onError).not.toHaveBeenCalled()
    expect(result.error.value).toBeUndefined()
    expect(result.status.value).toBe('idle')
  })

  it('should use updated video resumeState without requiring a body change', async () => {
    const firstResumeState = {
      threadId: 'thread-video-first',
      runId: 'run-video-first',
      cursor: 'cursor-video-first',
    }
    const nextResumeState = {
      threadId: 'thread-video-next',
      runId: 'run-video-next',
      cursor: 'cursor-video-next',
    }
    const { adapter, runContexts } = createRunContextCaptureAdapter(
      createReplayVideoChunks(),
    )
    const options = reactive({
      connection: adapter,
      autoResume: false,
      resumeState: firstResumeState,
    })
    const { result } = renderHook(() => useGenerateVideo(options))

    options.resumeState = nextResumeState
    await nextTick()

    await result.resume()
    await flushPromises()
    await nextTick()

    expect(runContexts[0]).toEqual(nextResumeState)
  })

  it('should require either connection or fetcher', () => {
    expect(() => {
      renderHook(() => useGenerateVideo({} as any))
    }).toThrow(
      'useGenerateVideo requires either a connection or fetcher option',
    )
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
    expectTypeOf(result.result.value).toEqualTypeOf<
      DeepReadonly<{
        playable: boolean
      } | null>
    >()

    await result.generate({ prompt: 'test' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual({ playable: true })
    expect(result.status.value).toBe('success')
  })

  it('should use raw result when onResult returns void', async () => {
    const onResult = vi.fn()

    const { result } = renderHook(() =>
      useGeneration({
        fetcher: async () => ({ id: '1', data: 'test' }),
        onResult,
      }),
    )

    await result.generate({ prompt: 'test' })
    await flushPromises()
    await nextTick()

    expect(onResult).toHaveBeenCalledWith({ id: '1', data: 'test' })
    expect(result.result.value).toEqual({ id: '1', data: 'test' })
  })

  it('should keep previous result when onResult returns null', async () => {
    const { result } = renderHook(() =>
      useGeneration({
        fetcher: async () => ({ id: '1' }),
        onResult: () => null,
      }),
    )

    await result.generate({ prompt: 'test' })
    await flushPromises()
    await nextTick()

    // null return → keep previous (which was null initially)
    expect(result.result.value).toBeNull()
    expect(result.status.value).toBe('success')
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
    expectTypeOf(result.result.value).toEqualTypeOf<
      DeepReadonly<{
        count: number
      } | null>
    >()

    await result.generate({ prompt: 'test' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual({ count: 2 })
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
    expectTypeOf(result.result.value).toEqualTypeOf<
      DeepReadonly<{
        audioUrl: string
      } | null>
    >()

    await result.generate({ text: 'Hello' })
    await flushPromises()
    await nextTick()

    expect(result.result.value).toEqual({
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
    expectTypeOf(result.result.value).toEqualTypeOf<
      DeepReadonly<TranscriptionResult | null>
    >()
  })

  it('narrows the wrapper result type to the transform return', () => {
    const { result } = renderHook(() =>
      useTranscription({
        fetcher: async () => ({ id: '1', text: 'hi', model: 'whisper-1' }),
        onResult: (res) => res.text,
      }),
    )
    expectTypeOf(result.result.value).toEqualTypeOf<string | null>()
  })
})
