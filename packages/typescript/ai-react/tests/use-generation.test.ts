import { renderHook, waitFor, act } from '@testing-library/react'
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
      summary: 'A brief summary',
      model: 'gpt-4',
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
    const mockResult = { summary: 'A brief summary', model: 'gpt-4' }
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
})

describe('onResult transform', () => {
  it('should transform result when onResult returns a value (fetcher)', async () => {
    const { result } = renderHook(() =>
      useGeneration({
        fetcher: async () => ({ id: '1', audio: 'base64data' }),
        onResult: (raw) => ({ playable: raw.audio.length > 0 }),
      }),
    )

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
    const mockResult = { id: '1', images: ['img1', 'img2'] }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useGeneration({
        connection: adapter,
        onResult: (raw: { id: string; images: Array<string> }) => ({
          count: raw.images.length,
        }),
      }),
    )

    await act(async () => {
      await result.current.generate({ prompt: 'test' })
    })

    expect(result.current.result).toEqual({ count: 2 })
  })

  it('should work with useGenerateSpeech transform', async () => {
    const mockTTSResult = {
      id: '1',
      model: 'tts-1',
      audio: 'base64audio',
      format: 'mp3',
      contentType: 'audio/mpeg',
    }

    const { result } = renderHook(() =>
      useGenerateSpeech({
        fetcher: async () => mockTTSResult,
        onResult: (raw) => ({
          audioUrl: `data:${raw.contentType};base64,${raw.audio}`,
        }),
      }),
    )

    await act(async () => {
      await result.current.generate({ text: 'Hello' })
    })

    expect(result.current.result).toEqual({
      audioUrl: 'data:audio/mpeg;base64,base64audio',
    })
  })
})
