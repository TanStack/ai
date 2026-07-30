import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
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
import type {
  ConnectConnectionAdapter,
  GenerationResumeSnapshot,
  RunAgentInputContext,
} from '@tanstack/ai-client'
import type { DeepReadonly } from 'vue'

// Helper to create generation stream chunks
function createGenerationChunks(result: unknown): Array<StreamChunk> {
  return [
    {
      type: 'RUN_STARTED',
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    },
    {
      type: 'CUSTOM',
      name: 'generation:result',
      value: result,
      timestamp: Date.now(),
    },
    {
      type: 'RUN_FINISHED',
      runId: 'run-1',
      threadId: 'thread-1',
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
  },
  status: 'running',
}

function createReplayVideoChunks(): Array<StreamChunk> {
  return [
    {
      type: 'RUN_STARTED',
      runId: 'run-resume',
      threadId: 'thread-resume',
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
      timestamp: Date.now(),
    },
    {
      type: 'RUN_FINISHED',
      runId: 'run-resume',
      threadId: 'thread-resume',
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

    it('does not auto-fire a generation on mount from a persisted running snapshot', async () => {
      // Regression guard for the removed generation resume surface.
      const snapshot: GenerationResumeSnapshot = {
        resumeState: { threadId: 'thread-resume', runId: 'run-resume' },
        status: 'running',
      }
      const { adapter, connect } = createRunContextCaptureAdapter(
        createGenerationChunks({ id: '1' }),
      )
      const getItem = vi.fn(() => snapshot)
      const { result } = renderHook(() =>
        useGeneration({
          id: 'no-auto-fire',
          threadId: 'no-auto-fire',
          connection: adapter,
          persistence: { getItem, setItem: vi.fn(), removeItem: vi.fn() },
          initialResumeSnapshot: snapshot,
        }),
      )

      await flushPromises()
      await nextTick()

      expect(connect).not.toHaveBeenCalled()
      expect(getItem).not.toHaveBeenCalled()
      expect(result.isLoading.value).toBe(false)
      expect(result.status.value).toBe('idle')
      // The persisted snapshot remains exposed as read-only state.
      expect(result.runId.value).toBe(snapshot.resumeState?.runId)
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

  describe('persistence', () => {
    it('repaints status from a stored complete snapshot on mount without starting a run', async () => {
      const { adapter, connect } = createRunContextCaptureAdapter(
        createGenerationChunks({ id: '1' }),
      )
      const getItem = vi.fn(() => ({
        resumeState: null,
        status: 'complete' as const,
        result: { id: 'result-1', model: 'image-model' },
      }))

      const { result } = renderHook(() =>
        useGeneration({
          id: 'hydrated',
          threadId: 'hydrated',
          connection: adapter,
          persistence: { getItem, setItem: vi.fn(), removeItem: vi.fn() },
        }),
      )

      await flushPromises()
      await nextTick()

      // A completed snapshot repaints the normal `status` field to `success`.
      expect(result.status.value).toBe('success')
      expect(getItem).toHaveBeenCalledWith('generation:hydrated')
      expect(connect).not.toHaveBeenCalled()
      // The base hook injects no reconstructResult, so `result` stays null.
      expect(result.result.value).toBeNull()
      expect(result.runId.value).toBeNull()
    })

    it('repaints a stored running snapshot with no joinRun as an interrupted error on mount', async () => {
      const { adapter, connect } = createRunContextCaptureAdapter(
        createGenerationChunks({ id: '1' }),
      )
      const getItem = vi.fn(() => ({
        resumeState: { threadId: 'thread-resume', runId: 'run-resume' },
        status: 'running' as const,
      }))

      const { result } = renderHook(() =>
        useGeneration({
          id: 'running-hydrate',
          threadId: 'running-hydrate',
          connection: adapter,
          persistence: { getItem, setItem: vi.fn(), removeItem: vi.fn() },
        }),
      )

      await flushPromises()
      await nextTick()

      // Without a `joinRun` handler the restored run cannot be tailed, so it
      // surfaces as an interrupted error instead of a `generating` status
      // that would never settle.
      expect(result.error.value?.message).toMatch(/interrupted/)
      expect(result.runId.value).toBeNull()
      expect(result.status.value).toBe('error')
      expect(result.isLoading.value).toBe(false)
      expect(connect).not.toHaveBeenCalled()
    })

    it('server-driven (persistence: true) hydrates from the connection by threadId without a local store', async () => {
      const { adapter, connect } = createRunContextCaptureAdapter(
        createGenerationChunks({ id: '1' }),
      )
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: null,
          status: 'complete' as const,
          result: { id: 'server-result', model: 'image-model' },
        },
        activeRun: null,
      }))

      const { result } = renderHook(() =>
        useGeneration({
          threadId: 'thread-server',
          connection: { ...adapter, hydrateGeneration },
          persistence: true,
        }),
      )

      await flushPromises()
      await nextTick()

      // The server snapshot repaints `status` to `success`.
      expect(result.status.value).toBe('success')
      expect(hydrateGeneration).toHaveBeenCalledWith('thread-server')
      expect(connect).not.toHaveBeenCalled()
    })

    it('clears resumeState once a streamed run finishes', async () => {
      const adapter = createMockConnectionAdapter({
        chunks: createGenerationChunks({ id: '1' }),
      })

      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      await result.generate({ prompt: 'replay' })
      await flushPromises()
      await nextTick()

      expect(result.status.value).toBe('success')
      // Once the run ends the in-flight identity is gone.
      expect(result.runId.value).toBeNull()
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

  it('restores a completed image result from a durable artifact url', async () => {
    // useGenerateImage injects `reconstructImageResult`, so a restored complete
    // snapshot repaints `result` with the durable serve url — as if the run had
    // just finished.
    const artifact: PersistedArtifactRef = {
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
    const getItem = vi.fn(() => ({
      resumeState: null,
      status: 'complete' as const,
      activity: 'image' as const,
      result: {
        id: 'img-restored',
        model: 'test-image',
        artifacts: [artifact],
      },
    }))
    const adapter = createMockConnectionAdapter()

    const { result } = renderHook(() =>
      useGenerateImage({
        id: 'img-hydrate',
        threadId: 'img-hydrate',
        connection: adapter,
        persistence: { getItem, setItem: vi.fn(), removeItem: vi.fn() },
      }),
    )

    await flushPromises()
    await nextTick()

    expect(result.status.value).toBe('success')
    expect(result.result.value).toEqual({
      id: 'img-restored',
      model: 'test-image',
      images: [{ url: '/api/artifacts/artifact-image-1' }],
      artifacts: [artifact],
    })
    expect(result.runId.value).toBeNull()
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

  it('does not auto-fire a video generation on mount from a persisted running snapshot', async () => {
    // Regression guard for the removed generation resume surface (video).
    const { adapter, connect } = createRunContextCaptureAdapter(
      createReplayVideoChunks(),
    )
    const getItem = vi.fn(() => videoResumeSnapshot)
    const { result } = renderHook(() =>
      useGenerateVideo({
        id: 'video-no-auto-fire',
        threadId: 'video-no-auto-fire',
        connection: adapter,
        persistence: { getItem, setItem: vi.fn(), removeItem: vi.fn() },
        initialResumeSnapshot: videoResumeSnapshot,
      }),
    )

    await flushPromises()
    await nextTick()

    expect(connect).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(result.isLoading.value).toBe(false)
    expect(result.status.value).toBe('idle')
    // The seeded in-flight identity is exposed as read-only `resumeState`.
    expect(result.runId.value).toBe(videoResumeSnapshot.resumeState?.runId)
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
