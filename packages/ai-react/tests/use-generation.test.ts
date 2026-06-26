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
  StreamChunk,
  TTSResult,
  TranscriptionResult,
} from '@tanstack/ai'
import { EventType } from '@tanstack/ai'

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
      model: 'gpt-4',
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
    expectTypeOf(result.current.result).toEqualTypeOf<TranscriptionResult | null>()
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
