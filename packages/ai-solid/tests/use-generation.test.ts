import { renderHook } from '@solidjs/testing-library'
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

const videoResumeSnapshot = {
  schemaVersion: 1 as const,
  resumeState: { threadId: 'thread-resume', runId: 'run-resume' },
  status: 'running' as const,
}

function createReplayVideoChunks(): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-resume',
      threadId: 'thread-resume',
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: {
        jobId: 'job-replay',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      },
      timestamp: Date.now(),
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'run-resume',
      threadId: 'thread-resume',
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

// Hydration runs through an awaited promise chain kicked off at mount, so drain
// the microtask queue AND a macrotask before asserting on the repaint.
async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

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

const restoredSpeechArtifact: PersistedArtifactRef = {
  role: 'output',
  artifactId: 'artifact-speech-1',
  threadId: 'thread-tts',
  runId: 'run-tts',
  name: 'speech.mp3',
  mimeType: 'audio/mpeg',
  size: 4096,
  createdAt: '2026-07-06T00:00:00.000Z',
  url: '/api/artifacts/artifact-speech-1',
  source: {
    activity: 'tts',
    path: 'runs/run-tts/speech.mp3',
    provider: 'test',
    model: 'test-tts',
    mediaType: 'audio',
  },
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

  describe('persistence', () => {
    it('repaints status from a hydrated complete snapshot on mount without starting a run', async () => {
      const { adapter, connect } = createRunContextCaptureAdapter(
        createGenerationChunks({ id: '1' }),
      )
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: null,
          status: 'complete' as const,
          result: { id: 'result-1', model: 'image-model' },
        },
        activeRun: null,
      }))
      const { result } = renderHook(() =>
        useGeneration({
          threadId: 'hydrated',
          connection: { ...adapter, hydrateGeneration },
          persistence: true,
        }),
      )

      await flushPromises()

      // A completed snapshot repaints the normal `status` field to `success`.
      expect(result.status()).toBe('success')
      expect(hydrateGeneration).toHaveBeenCalledWith('hydrated')
      expect(connect).not.toHaveBeenCalled()
      // The base hook injects no reconstructResult, so `result` stays null.
      expect(result.result()).toBeNull()
      expect(result.runId()).toBeNull()
    })

    it('repaints a hydrated running snapshot with no joinRun as an interrupted error on mount', async () => {
      const { adapter, connect } = createRunContextCaptureAdapter(
        createGenerationChunks({ id: '1' }),
      )
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-resume', runId: 'run-resume' },
          status: 'running' as const,
        },
        activeRun: null,
      }))
      const { result } = renderHook(() =>
        useGeneration({
          threadId: 'running-hydrate',
          // No `joinRun`, so the restored run cannot be tailed.
          connection: { ...adapter, hydrateGeneration },
          persistence: true,
        }),
      )

      await flushPromises()

      // Without a `joinRun` handler the restored run cannot be tailed, so it
      // surfaces as an interrupted error instead of a `generating` status that
      // would never settle.
      expect(result.error()?.message).toMatch(/interrupted/)
      expect(result.runId()).toBeNull()
      expect(result.status()).toBe('error')
      expect(result.isLoading()).toBe(false)
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

      // The server snapshot repaints `status` to `success`.
      expect(result.status()).toBe('success')
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

      expect(result.status()).toBe('success')
      // Once the run ends the in-flight identity is gone.
      expect(result.runId()).toBeNull()
    })
  })

  describe('error handling', () => {
    it('should require either connection or fetcher', () => {
      // Empty options is structurally valid (both connection and fetcher are
      // optional) but a runtime guard inside useGeneration throws. Pinning the
      // generics explicitly avoids leaving the constraints to default to
      // `unknown`, which trips inference on the empty literal.
      expect(() => {
        renderHook(() => useGeneration<Record<string, unknown>, unknown>({}))
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
        id: 'img-1',
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
        id: 'img-1',
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
        id: 'img-1',
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

  describe('persistence', () => {
    it('restores a completed image result from a durable artifact url', async () => {
      // useGenerateImage injects `reconstructImageResult`, so a restored
      // complete snapshot repaints `result` with the durable serve url — as if
      // the run had just finished.
      const { adapter, connect } = createRunContextCaptureAdapter([])
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: null,
          status: 'complete' as const,
          activity: 'image' as const,
          result: {
            id: 'img-restored',
            model: 'test-image',
            artifacts: [restoredImageArtifact],
          },
        },
        activeRun: null,
      }))

      const { result } = renderHook(() =>
        useGenerateImage({
          threadId: 'img-hydrate',
          connection: { ...adapter, hydrateGeneration },
          persistence: true,
        }),
      )

      await flushPromises()

      expect(result.status()).toBe('success')
      expect(connect).not.toHaveBeenCalled()
      expect(result.result()).toEqual({
        id: 'img-restored',
        model: 'test-image',
        images: [{ url: '/api/artifacts/artifact-image-1' }],
        artifacts: [restoredImageArtifact],
      })
      expect(result.runId()).toBeNull()
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
        id: 'tts-1',
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

      await result.generate({ text: 'Hello world' })
      expect(result.result()).not.toBeNull()

      result.reset()

      expect(result.result()).toBeNull()
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })

  describe('persistence', () => {
    it('restores a completed TTS result from a durable artifact url', async () => {
      // useGenerateSpeech injects `reconstructSpeechResult`. `TTSResult.audio`
      // is a bare base64 string that persistence never stores, so the restored
      // clip is served from `artifacts[0].url` and `audio` stays empty.
      const { adapter, connect } = createRunContextCaptureAdapter([])
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: null,
          status: 'complete' as const,
          activity: 'tts' as const,
          result: {
            id: 'tts-restored',
            model: 'test-tts',
            artifacts: [restoredSpeechArtifact],
          },
        },
        activeRun: null,
      }))

      const { result } = renderHook(() =>
        useGenerateSpeech({
          threadId: 'tts-hydrate',
          connection: { ...adapter, hydrateGeneration },
          persistence: true,
        }),
      )

      await flushPromises()

      expect(result.status()).toBe('success')
      expect(connect).not.toHaveBeenCalled()
      expect(result.result()).toEqual({
        id: 'tts-restored',
        model: 'test-tts',
        audio: '',
        format: 'mpeg',
        contentType: 'audio/mpeg',
        artifacts: [restoredSpeechArtifact],
      })
      expect(result.runId()).toBeNull()
    })
  })
})

describe('useGenerateAudio', () => {
  const mockResult = {
    id: 'audio-1',
    model: 'fal-ai/diffrhythm',
    audio: {
      url: 'https://example.com/a.mp3',
      contentType: 'audio/mpeg',
      duration: 10,
    },
  }

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderHook(() =>
        useGenerateAudio({ connection: adapter }),
      )

      expect(result.result()).toBeNull()
      expect(result.isLoading()).toBe(false)
      expect(result.error()).toBeUndefined()
      expect(result.status()).toBe('idle')
    })
  })

  describe('fetcher mode', () => {
    it('should generate audio using fetcher', async () => {
      const onResult = vi.fn()

      const { result } = renderHook(() =>
        useGenerateAudio({
          fetcher: async () => mockResult,
          onResult,
        }),
      )

      await result.generate({ prompt: 'Upbeat synths', duration: 10 })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
      expect(result.isLoading()).toBe(false)
      expect(onResult).toHaveBeenCalledWith(mockResult)
    })

    it('should handle fetcher errors', async () => {
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useGenerateAudio({
          fetcher: async () => {
            throw new Error('Audio generation failed')
          },
          onError,
        }),
      )

      await result.generate({ prompt: 'Upbeat synths' })

      expect(result.status()).toBe('error')
      expect(result.error()?.message).toBe('Audio generation failed')
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('connection mode', () => {
    it('should generate audio using connection', async () => {
      const chunks = createGenerationChunks(mockResult)
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderHook(() =>
        useGenerateAudio({ connection: adapter }),
      )

      await result.generate({ prompt: 'Upbeat synths', duration: 10 })

      expect(result.result()).toEqual(mockResult)
      expect(result.status()).toBe('success')
    })
  })

  describe('stop and reset', () => {
    it('should reset state after generation', async () => {
      const { result } = renderHook(() =>
        useGenerateAudio({
          fetcher: async () => mockResult,
        }),
      )

      await result.generate({ prompt: 'Upbeat synths' })
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
        id: 'trans-1',
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
        id: 'trans-1',
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
        id: 'sum-1',
        summary: 'A brief summary',
        model: 'gpt-5.5',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
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
      const mockResult = { summary: 'A brief summary', model: 'gpt-5.5' }
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

    it('does not auto-fire a video generation on mount from a hydrated running snapshot', async () => {
      const { adapter, connect } = createRunContextCaptureAdapter(
        createReplayVideoChunks(),
      )
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: videoResumeSnapshot,
        activeRun: null,
      }))
      const { result } = renderHook(() =>
        useGenerateVideo({
          threadId: 'video-no-auto-fire',
          // No `joinRun`, so the restored run cannot be tailed.
          connection: { ...adapter, hydrateGeneration },
          persistence: true,
        }),
      )

      await flushPromises()

      // Hydration only surfaces state; it never restarts the run.
      expect(connect).not.toHaveBeenCalled()
      expect(result.error()?.message).toMatch(/interrupted/)
      expect(result.status()).toBe('error')
      expect(result.isLoading()).toBe(false)
      expect(result.runId()).toBeNull()
    })
  })

  describe('error handling', () => {
    it('should require either connection or fetcher', () => {
      // Empty options is structurally valid (both connection and fetcher are
      // optional on UseGenerateVideoOptions) but a runtime guard inside
      // useGenerateVideo throws.
      expect(() => {
        renderHook(() => useGenerateVideo({}))
      }).toThrow(
        'useGenerateVideo requires either a connection or fetcher option',
      )
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
    expectTypeOf(result.result()).toEqualTypeOf<{
      playable: boolean
    } | null>()

    await result.generate({ prompt: 'test' })

    expect(result.result()).toEqual({ playable: true })
    expect(result.status()).toBe('success')
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

    expect(onResult).toHaveBeenCalledWith({ id: '1', data: 'test' })
    expect(result.result()).toEqual({ id: '1', data: 'test' })
  })

  it('should keep previous result when onResult returns null', async () => {
    const { result } = renderHook(() =>
      useGeneration({
        fetcher: async () => ({ id: '1' }),
        onResult: () => null,
      }),
    )

    await result.generate({ prompt: 'test' })

    // null return → keep previous (which was null initially)
    expect(result.result()).toBeNull()
    expect(result.status()).toBe('success')
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
    expectTypeOf(result.result()).toEqualTypeOf<{
      count: number
    } | null>()

    await result.generate({ prompt: 'test' })

    expect(result.result()).toEqual({ count: 2 })
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
    expectTypeOf(result.result()).toEqualTypeOf<{
      audioUrl: string
    } | null>()

    await result.generate({ text: 'Hello' })

    expect(result.result()).toEqual({
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
    expectTypeOf(result.result()).toEqualTypeOf<TranscriptionResult | null>()
  })

  it('narrows the wrapper result type to the transform return', () => {
    const { result } = renderHook(() =>
      useTranscription({
        fetcher: async () => ({ id: '1', text: 'hi', model: 'whisper-1' }),
        onResult: (res) => res.text,
      }),
    )
    expectTypeOf(result.result()).toEqualTypeOf<string | null>()
  })
})
