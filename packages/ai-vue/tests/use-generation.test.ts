import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useGeneration } from '../src/use-generation'
import { useGenerateImage } from '../src/use-generate-image'
import { useGenerateAudio } from '../src/use-generate-audio'
import { useGenerateSpeech } from '../src/use-generate-speech'
import { useTranscription } from '../src/use-transcription'
import { useSummarize } from '../src/use-summarize'
import { useGenerateVideo } from '../src/use-generate-video'
import { createMockConnectionAdapter } from './test-utils'
import type { StreamChunk } from '@tanstack/ai'

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
      model: 'gpt-4',
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
    const mockResult = { summary: 'A brief summary', model: 'gpt-4' }
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

  it('should require either connection or fetcher', () => {
    expect(() => {
      renderHook(() => useGenerateVideo({} as any))
    }).toThrow(
      'useGenerateVideo requires either a connection or fetcher option',
    )
  })
})
