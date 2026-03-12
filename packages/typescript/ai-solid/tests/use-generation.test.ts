import { renderHook } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { useGeneration } from '../src/use-generation'
import { useGenerateImage } from '../src/use-generate-image'
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
  ]
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
  ]
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
  ]
}

describe('useGeneration', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      expect(result.result()).toBeNull()
      expect(result.isLoading()).toBe(false)
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
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

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
      expect(result.isLoading()).toBe(false)
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

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('fetch failed')
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should track loading state during fetcher call', async () => {
      const states: Array<boolean> = []
      let resolvePromise: (value: any) => void

      const { result } = renderHook(() =>
        useGeneration({
          fetcher: async () => {
            return new Promise((resolve) => {
              resolvePromise = resolve
            })
          },
        }),
      )

      expect(result.isLoading()).toBe(false)

      const generatePromise = result.generate({ prompt: 'test' })

      // Loading should be true during generation
      expect(result.isLoading()).toBe(true)

      resolvePromise!({ id: '1' })
      await generatePromise

      expect(result.isLoading()).toBe(false)
    })

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn()
      const chunks: Array<StreamChunk> = [
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
      ]
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() =>
        useGeneration({
          connection: adapter,
          onProgress,
        }),
      )

      await result.generate({ prompt: 'test' })

      expect(onProgress).toHaveBeenCalledWith(50, 'Halfway')
    })

    it('should call onChunk callback for each chunk', async () => {
      const onChunk = vi.fn()
      const generationChunks = createGenerationChunks({ id: '1' })
      const adapter = createMockConnectionAdapter({ chunks: generationChunks })

      const { result } = renderHook(() =>
        useGeneration({
          connection: adapter,
          onChunk,
        }),
      )

      await result.generate({ prompt: 'test' })

      expect(onChunk).toHaveBeenCalledTimes(3)
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

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
    })

    it('should handle stream errors', async () => {
      const chunks = createErrorChunks('Generation failed')
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      await result.generate({ prompt: 'test' })

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Generation failed')
    })

    it('should handle connection adapter errors', async () => {
      const onError = vi.fn()
      const adapter = createMockConnectionAdapter({
        shouldError: true,
        error: new Error('Connection failed'),
      })

      const { result } = renderHook(() =>
        useGeneration({
          connection: adapter,
          onError,
        }),
      )

      await result.generate({ prompt: 'test' })

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Connection failed')
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
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

      expect(result.isLoading()).toBe(true)

      result.stop()

      expect(result.isLoading()).toBe(false)
      expect(result.status()).toBe('idle')

      resolvePromise!({ id: '1' })
      await generatePromise
    })

    it('should reset all state', async () => {
      const { result } = renderHook(() =>
        useGeneration({
          fetcher: async () => ({ id: '1' }),
        }),
      )

      await result.generate({ prompt: 'test' })

      expect(result.result()).toEqual({ id: '1' })
      expect(result.status()).toBe('success')

      result.reset()

      expect(result.result()).toBeNull()
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })

    it('should be safe to call stop multiple times', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGeneration({ connection: adapter }),
      )

      // Should not throw
      result.stop()
      result.stop()
      result.stop()

      expect(result.isLoading()).toBe(false)
      expect(result.status()).toBe('idle')
    })
  })

  describe('error handling', () => {
    it('should require either connection or fetcher', () => {
      expect(() => {
        renderHook(() => useGeneration({} as any))
      }).toThrow('useGeneration requires either a connection or fetcher option')
    })
  })
})

describe('useGenerateImage', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGenerateImage({ connection: adapter }),
      )

      expect(result.result()).toBeNull()
      expect(result.isLoading()).toBe(false)
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })

  describe('fetcher mode', () => {
    it('should generate images using fetcher', async () => {
      const mockResult = {
        images: [{ url: 'http://example.com/img.png' }],
        model: 'dall-e-3',
      }
      const onResult = vi.fn()

      const { result } = renderHook(() =>
        useGenerateImage({
          fetcher: async () => mockResult,
          onResult,
        }),
      )

      await result.generate({ prompt: 'A sunset' })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
      expect(result.isLoading()).toBe(false)
      expect(onResult).toHaveBeenCalledWith(mockResult)
    })

    it('should handle fetcher errors', async () => {
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

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Image generation failed')
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('connection mode', () => {
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

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
    })
  })

  describe('stop and reset', () => {
    it('should expose stop and reset functions', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGenerateImage({ connection: adapter }),
      )

      expect(typeof result.stop).toBe('function')
      expect(typeof result.reset).toBe('function')
    })

    it('should reset state after generation', async () => {
      const mockResult = {
        images: [{ url: 'http://example.com/img.png' }],
        model: 'dall-e-3',
      }

      const { result } = renderHook(() =>
        useGenerateImage({
          fetcher: async () => mockResult,
        }),
      )

      await result.generate({ prompt: 'A sunset' })
      expect(result.result()).not.toBeNull()

      result.reset()

      expect(result.result()).toBeNull()
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })
})

describe('useGenerateSpeech', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGenerateSpeech({ connection: adapter }),
      )

      expect(result.result()).toBeNull()
      expect(result.isLoading()).toBe(false)
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })

  describe('fetcher mode', () => {
    it('should generate speech using fetcher', async () => {
      const mockResult = {
        audio: 'base64data',
        format: 'mp3' as const,
        model: 'tts-1',
      }
      const onResult = vi.fn()

      const { result } = renderHook(() =>
        useGenerateSpeech({
          fetcher: async () => mockResult,
          onResult,
        }),
      )

      await result.generate({ text: 'Hello world' })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
      expect(result.isLoading()).toBe(false)
      expect(onResult).toHaveBeenCalledWith(mockResult)
    })

    it('should handle fetcher errors', async () => {
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useGenerateSpeech({
          fetcher: async () => {
            throw new Error('Speech generation failed')
          },
          onError,
        }),
      )

      await result.generate({ text: 'Hello' })

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Speech generation failed')
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('connection mode', () => {
    it('should generate speech using connection', async () => {
      const mockResult = {
        audio: 'base64data',
        format: 'mp3',
        model: 'tts-1',
      }
      const chunks = createGenerationChunks(mockResult)
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() =>
        useGenerateSpeech({ connection: adapter }),
      )

      await result.generate({ text: 'Hello world' })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
    })
  })

  describe('stop and reset', () => {
    it('should reset state after generation', async () => {
      const mockResult = {
        audio: 'base64data',
        format: 'mp3' as const,
        model: 'tts-1',
      }

      const { result } = renderHook(() =>
        useGenerateSpeech({
          fetcher: async () => mockResult,
        }),
      )

      await result.generate({ text: 'Hello world' })
      expect(result.result()).not.toBeNull()

      result.reset()

      expect(result.result()).toBeNull()
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })
})

describe('useTranscription', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useTranscription({ connection: adapter }),
      )

      expect(result.result()).toBeNull()
      expect(result.isLoading()).toBe(false)
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })

  describe('fetcher mode', () => {
    it('should transcribe audio using fetcher', async () => {
      const mockResult = {
        text: 'Hello world',
        model: 'whisper-1',
      }
      const onResult = vi.fn()

      const { result } = renderHook(() =>
        useTranscription({
          fetcher: async () => mockResult,
          onResult,
        }),
      )

      await result.generate({ audio: 'base64audio' })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
      expect(result.isLoading()).toBe(false)
      expect(onResult).toHaveBeenCalledWith(mockResult)
    })

    it('should handle fetcher errors', async () => {
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

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Transcription failed')
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('connection mode', () => {
    it('should transcribe audio using connection', async () => {
      const mockResult = { text: 'Hello world', model: 'whisper-1' }
      const chunks = createGenerationChunks(mockResult)
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() =>
        useTranscription({ connection: adapter }),
      )

      await result.generate({ audio: 'base64audio' })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
    })
  })

  describe('stop and reset', () => {
    it('should reset state after transcription', async () => {
      const mockResult = {
        text: 'Hello world',
        model: 'whisper-1',
      }

      const { result } = renderHook(() =>
        useTranscription({
          fetcher: async () => mockResult,
        }),
      )

      await result.generate({ audio: 'base64audio' })
      expect(result.result()).not.toBeNull()

      result.reset()

      expect(result.result()).toBeNull()
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })
})

describe('useSummarize', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() => useSummarize({ connection: adapter }))

      expect(result.result()).toBeNull()
      expect(result.isLoading()).toBe(false)
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })

  describe('fetcher mode', () => {
    it('should summarize text using fetcher', async () => {
      const mockResult = {
        summary: 'A brief summary',
        model: 'gpt-4',
      }
      const onResult = vi.fn()

      const { result } = renderHook(() =>
        useSummarize({
          fetcher: async () => mockResult,
          onResult,
        }),
      )

      await result.generate({ text: 'Long text to summarize...' })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
      expect(result.isLoading()).toBe(false)
      expect(onResult).toHaveBeenCalledWith(mockResult)
    })

    it('should handle fetcher errors', async () => {
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useSummarize({
          fetcher: async () => {
            throw new Error('Summarization failed')
          },
          onError,
        }),
      )

      await result.generate({ text: 'Some text' })

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Summarization failed')
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('connection mode', () => {
    it('should summarize text using connection', async () => {
      const mockResult = { summary: 'A brief summary', model: 'gpt-4' }
      const chunks = createGenerationChunks(mockResult)
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() => useSummarize({ connection: adapter }))

      await result.generate({ text: 'Long text to summarize...' })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
    })
  })

  describe('stop and reset', () => {
    it('should reset state after summarization', async () => {
      const mockResult = {
        summary: 'A brief summary',
        model: 'gpt-4',
      }

      const { result } = renderHook(() =>
        useSummarize({
          fetcher: async () => mockResult,
        }),
      )

      await result.generate({ text: 'Long text to summarize...' })
      expect(result.result()).not.toBeNull()

      result.reset()

      expect(result.result()).toBeNull()
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })
})

describe('useGenerateVideo', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGenerateVideo({ connection: adapter }),
      )

      expect(result.result()).toBeNull()
      expect(result.jobId()).toBeNull()
      expect(result.videoStatus()).toBeNull()
      expect(result.isLoading()).toBe(false)
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })

  describe('fetcher mode', () => {
    it('should generate video using fetcher', async () => {
      const mockResult = {
        jobId: 'job-1',
        status: 'completed' as const,
        url: 'https://example.com/video.mp4',
      }
      const onResult = vi.fn()

      const { result } = renderHook(() =>
        useGenerateVideo({
          fetcher: async () => mockResult,
          onResult,
        }),
      )

      await result.generate({ prompt: 'A flying car' })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
      expect(result.isLoading()).toBe(false)
      expect(onResult).toHaveBeenCalledWith(mockResult)
    })

    it('should handle fetcher errors', async () => {
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useGenerateVideo({
          fetcher: async () => {
            throw new Error('Video generation failed')
          },
          onError,
        }),
      )

      await result.generate({ prompt: 'test' })

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Video generation failed')
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('connection mode', () => {
    it('should track video job lifecycle via connection', async () => {
      const chunks = createVideoChunks(
        'job-123',
        'https://example.com/video.mp4',
      )
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

      expect(result.result()).toEqual(
        expect.objectContaining({
          jobId: 'job-123',
          url: 'https://example.com/video.mp4',
        }),
      )
      expect(result.jobId()).toBe('job-123')
      expect(result.status()).toBe('success')
      expect(onJobCreated).toHaveBeenCalledWith('job-123')
      expect(onStatusUpdate).toHaveBeenCalled()
    })

    it('should handle video generation errors via connection', async () => {
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

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Video generation failed')
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('stop and reset', () => {
    it('should stop and reset all state', async () => {
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

      await result.generate({ prompt: 'test' })

      expect(result.result()).not.toBeNull()

      result.reset()

      expect(result.result()).toBeNull()
      expect(result.jobId()).toBeNull()
      expect(result.videoStatus()).toBeNull()
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })

    it('should stop in-flight generation', async () => {
      let resolvePromise: (value: any) => void

      const { result } = renderHook(() =>
        useGenerateVideo({
          fetcher: async () =>
            new Promise((resolve) => {
              resolvePromise = resolve
            }),
        }),
      )

      const generatePromise = result.generate({ prompt: 'test' })

      expect(result.isLoading()).toBe(true)

      result.stop()

      expect(result.isLoading()).toBe(false)
      expect(result.status()).toBe('idle')

      resolvePromise!({
        jobId: 'job-1',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      })
      await generatePromise
    })

    it('should be safe to call stop multiple times', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGenerateVideo({ connection: adapter }),
      )

      // Should not throw
      result.stop()
      result.stop()
      result.stop()

      expect(result.isLoading()).toBe(false)
      expect(result.status()).toBe('idle')
    })
  })

  describe('error handling', () => {
    it('should require either connection or fetcher', () => {
      expect(() => {
        renderHook(() => useGenerateVideo({} as any))
      }).toThrow(
        'useGenerateVideo requires either a connection or fetcher option',
      )
    })
  })
})
