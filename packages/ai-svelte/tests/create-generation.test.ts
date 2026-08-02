import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createGeneration } from '../src/create-generation.svelte'
import { createGenerateImage } from '../src/create-generate-image.svelte'
import { createGenerateSpeech } from '../src/create-generate-speech.svelte'
import { createTranscription } from '../src/create-transcription.svelte'
import { createSummarize } from '../src/create-summarize.svelte'
import { createGenerateVideo } from '../src/create-generate-video.svelte'
import { createMockConnectionAdapter } from './test-utils'
import { EventType, type StreamChunk } from '@tanstack/ai'
import type {
  PersistedArtifactRef,
  TTSResult,
  TranscriptionResult,
} from '@tanstack/ai'
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
      finishReason: 'stop',
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
      finishReason: 'stop',
      timestamp: Date.now(),
    },
  ]
}

const videoResumeSnapshot = {
  schemaVersion: 1 as const,
  resumeState: { threadId: 'thread-resume', runId: 'run-resume' },
  status: 'running' as const,
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

// Snapshot hydration and removal both run through promise queues detached from
// the caller, so tests wait a macrotask for them to settle.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// Helper to create error stream chunks
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
      error: { message },
      timestamp: Date.now(),
    },
  ]
}

describe('createGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const gen = createGeneration({ connection: adapter })

      expect(gen.result).toBeNull()
      expect(gen.isLoading).toBe(false)
      expect(gen.error).toBeUndefined()
      expect(gen.status).toBe('idle')
    })

    it('should throw if neither connection nor fetcher is provided', () => {
      expect(() => createGeneration({})).toThrow(
        'createGeneration requires either a connection or fetcher option',
      )
    })

    it('should expose generate, stop, reset, and updateBody methods', () => {
      const adapter = createMockConnectionAdapter()
      const gen = createGeneration({ connection: adapter })

      expect(typeof gen.generate).toBe('function')
      expect(typeof gen.stop).toBe('function')
      expect(typeof gen.reset).toBe('function')
      expect(typeof gen.updateBody).toBe('function')
    })
  })

  describe('fetcher mode', () => {
    it('should generate a result using fetcher', async () => {
      const mockResult = { id: '1', data: 'test' }
      const onResult = vi.fn()

      const gen = createGeneration({
        fetcher: async () => mockResult,
        onResult,
      })

      await gen.generate({ prompt: 'test' })

      expect(gen.result).toEqual(mockResult)
      expect(gen.status).toBe('success')
      expect(gen.isLoading).toBe(false)
      expect(onResult).toHaveBeenCalledWith(mockResult)
    })

    it('should handle fetcher errors', async () => {
      const onError = vi.fn()

      const gen = createGeneration({
        fetcher: async () => {
          throw new Error('fetch failed')
        },
        onError,
      })

      await gen.generate({ prompt: 'test' })

      expect(gen.status).toBe('error')
      expect(gen.error?.message).toBe('fetch failed')
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

      const gen = createGeneration({ connection: adapter })

      await gen.generate({ prompt: 'test' })

      expect(gen.result).toEqual(mockResult)
      expect(gen.status).toBe('success')
    })

    it('should handle stream errors', async () => {
      const chunks = createErrorChunks('Generation failed')
      const adapter = createMockConnectionAdapter({ chunks })

      const gen = createGeneration({ connection: adapter })

      await gen.generate({ prompt: 'test' })

      expect(gen.status).toBe('error')
      expect(gen.error?.message).toBe('Generation failed')
    })
    it('repaints a hydrated running snapshot with no joinRun as an interrupted error on setup', async () => {
      const { adapter, connect } = createRunContextCaptureAdapter([])
      const hydrateGeneration = vi.fn(async () => ({
        resumeSnapshot: {
          schemaVersion: 1 as const,
          resumeState: { threadId: 'thread-resume', runId: 'run-resume' },
          status: 'running' as const,
        },
        activeRun: null,
      }))
      const gen = createGeneration({
        threadId: 'running-hydrate',
        // No `joinRun`, so the restored run cannot be tailed.
        connection: { ...adapter, hydrateGeneration },
        persistence: true,
      })

      await flushAsync()

      expect(hydrateGeneration).toHaveBeenCalledWith('running-hydrate')
      // Without a `joinRun` handler the restored run cannot be tailed, so it
      // surfaces as an interrupted error instead of a `generating` status that
      // would never settle.
      expect(gen.error?.message).toMatch(/interrupted/)
      expect(gen.status).toBe('error')
      expect(gen.isLoading).toBe(false)
      expect(gen.runId).toBeNull()
      // Hydration only surfaces state; it never restarts the run.
      expect(connect).not.toHaveBeenCalled()
    })
  })

  describe('stop and reset', () => {
    it('should stop generation and return to idle', async () => {
      let resolvePromise: (value: any) => void

      const gen = createGeneration({
        fetcher: async () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          }),
      })

      const promise = gen.generate({ prompt: 'test' })

      // Wait a tick for loading to be set
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(gen.isLoading).toBe(true)

      gen.stop()

      expect(gen.isLoading).toBe(false)
      expect(gen.status).toBe('idle')

      resolvePromise!({ id: '1' })
      await promise.catch(() => {})
    })

    it('should reset all state', async () => {
      const gen = createGeneration({
        fetcher: async () => ({ id: '1' }),
      })

      await gen.generate({ prompt: 'test' })

      expect(gen.result).toEqual({ id: '1' })

      gen.reset()

      expect(gen.result).toBeNull()
      expect(gen.error).toBeUndefined()
      expect(gen.status).toBe('idle')
    })
  })
})

describe('createGenerateImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const gen = createGenerateImage({ connection: adapter })

    expect(gen.result).toBeNull()
    expect(gen.isLoading).toBe(false)
    expect(gen.status).toBe('idle')
  })

  it('should generate images using fetcher', async () => {
    const mockResult = {
      id: 'img-1',
      images: [{ url: 'http://example.com/img.png' }],
      model: 'dall-e-3',
    }

    const gen = createGenerateImage({
      fetcher: async () => mockResult,
    })

    await gen.generate({ prompt: 'A sunset' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should generate images using connection', async () => {
    const mockResult = {
      images: [{ url: 'http://example.com/img.png' }],
      model: 'dall-e-3',
    }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const gen = createGenerateImage({ connection: adapter })

    await gen.generate({ prompt: 'A sunset' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should handle errors', async () => {
    const onError = vi.fn()

    const gen = createGenerateImage({
      fetcher: async () => {
        throw new Error('Image generation failed')
      },
      onError,
    })

    await gen.generate({ prompt: 'test' })

    expect(gen.status).toBe('error')
    expect(gen.error?.message).toBe('Image generation failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should expose stop and reset', () => {
    const adapter = createMockConnectionAdapter()
    const gen = createGenerateImage({ connection: adapter })

    expect(typeof gen.stop).toBe('function')
    expect(typeof gen.reset).toBe('function')
  })

  it('restores a completed image result from a durable artifact url', async () => {
    // createGenerateImage injects `reconstructImageResult`, so a restored
    // complete snapshot repaints `result` with the durable serve url — as if the
    // run had just finished.
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
    const hydrateGeneration = vi.fn(async () => ({
      resumeSnapshot: {
        schemaVersion: 1 as const,
        resumeState: null,
        status: 'complete' as const,
        activity: 'image' as const,
        result: {
          id: 'img-restored',
          model: 'test-image',
          artifacts: [artifact],
        },
      },
      activeRun: null,
    }))

    const gen = createGenerateImage({
      threadId: 'img-hydrate',
      connection: { ...createMockConnectionAdapter(), hydrateGeneration },
      persistence: true,
    })

    await flushAsync()

    // The completed snapshot repaints `status` and rebuilds `result` from the
    // durable serve url.
    expect(gen.status).toBe('success')
    expect(gen.result).toEqual({
      id: 'img-restored',
      model: 'test-image',
      images: [{ url: '/api/artifacts/artifact-image-1' }],
      artifacts: [artifact],
    })
    expect(gen.runId).toBeNull()
  })
})

describe('createGenerateSpeech', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const gen = createGenerateSpeech({ connection: adapter })

    expect(gen.result).toBeNull()
    expect(gen.isLoading).toBe(false)
    expect(gen.status).toBe('idle')
  })

  it('should generate speech using fetcher', async () => {
    const mockResult = {
      id: 'tts-1',
      audio: 'base64data',
      format: 'mp3' as const,
      model: 'tts-1',
    }

    const gen = createGenerateSpeech({
      fetcher: async () => mockResult,
    })

    await gen.generate({ text: 'Hello world' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should generate speech using connection', async () => {
    const mockResult = { audio: 'base64data', format: 'mp3', model: 'tts-1' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const gen = createGenerateSpeech({ connection: adapter })

    await gen.generate({ text: 'Hello world' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should handle errors', async () => {
    const onError = vi.fn()

    const gen = createGenerateSpeech({
      fetcher: async () => {
        throw new Error('Speech generation failed')
      },
      onError,
    })

    await gen.generate({ text: 'test' })

    expect(gen.status).toBe('error')
    expect(gen.error?.message).toBe('Speech generation failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should stop and reset', async () => {
    const gen = createGenerateSpeech({
      fetcher: async () => ({
        id: 'tts-1',
        audio: 'base64data',
        format: 'mp3' as const,
        model: 'tts-1',
      }),
    })

    await gen.generate({ text: 'Hello' })

    expect(gen.result).not.toBeNull()

    gen.reset()

    expect(gen.result).toBeNull()
    expect(gen.error).toBeUndefined()
    expect(gen.status).toBe('idle')
  })

  it('restores a completed TTS result from a durable artifact url', async () => {
    // createGenerateSpeech injects `reconstructSpeechResult`. `TTSResult.audio`
    // is a bare base64 string that persistence never stores, so the restored
    // clip is served from `artifacts[0].url` and `audio` stays empty.
    const artifact: PersistedArtifactRef = {
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
    const hydrateGeneration = vi.fn(async () => ({
      resumeSnapshot: {
        schemaVersion: 1 as const,
        resumeState: null,
        status: 'complete' as const,
        activity: 'tts' as const,
        result: {
          id: 'tts-restored',
          model: 'test-tts',
          artifacts: [artifact],
        },
      },
      activeRun: null,
    }))

    const gen = createGenerateSpeech({
      threadId: 'tts-hydrate',
      connection: { ...createMockConnectionAdapter(), hydrateGeneration },
      persistence: true,
    })

    await flushAsync()

    expect(gen.status).toBe('success')
    expect(gen.result).toEqual({
      id: 'tts-restored',
      model: 'test-tts',
      audio: '',
      format: 'mpeg',
      contentType: 'audio/mpeg',
      artifacts: [artifact],
    })
    expect(gen.runId).toBeNull()
  })
})

describe('createTranscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const gen = createTranscription({ connection: adapter })

    expect(gen.result).toBeNull()
    expect(gen.isLoading).toBe(false)
    expect(gen.status).toBe('idle')
  })

  it('should transcribe audio using fetcher', async () => {
    const mockResult = {
      id: 'tr-1',
      text: 'Hello world',
      model: 'whisper-1',
    }

    const gen = createTranscription({
      fetcher: async () => mockResult,
    })

    await gen.generate({ audio: 'base64audio' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should transcribe audio using connection', async () => {
    const mockResult = { text: 'Hello world', model: 'whisper-1' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const gen = createTranscription({ connection: adapter })

    await gen.generate({ audio: 'base64audio' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should handle errors', async () => {
    const onError = vi.fn()

    const gen = createTranscription({
      fetcher: async () => {
        throw new Error('Transcription failed')
      },
      onError,
    })

    await gen.generate({ audio: 'base64audio' })

    expect(gen.status).toBe('error')
    expect(gen.error?.message).toBe('Transcription failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should stop and reset', async () => {
    const gen = createTranscription({
      fetcher: async () => ({
        id: 'tr-1',
        text: 'Hello world',
        model: 'whisper-1',
      }),
    })

    await gen.generate({ audio: 'base64audio' })

    expect(gen.result).not.toBeNull()

    gen.reset()

    expect(gen.result).toBeNull()
    expect(gen.error).toBeUndefined()
    expect(gen.status).toBe('idle')
  })
})

describe('createSummarize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const gen = createSummarize({ connection: adapter })

    expect(gen.result).toBeNull()
    expect(gen.isLoading).toBe(false)
    expect(gen.status).toBe('idle')
  })

  it('should summarize text using fetcher', async () => {
    const mockResult = {
      id: 'sum-1',
      summary: 'A brief summary',
      model: 'gpt-5.5',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }

    const gen = createSummarize({
      fetcher: async () => mockResult,
    })

    await gen.generate({ text: 'Long text to summarize...' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should summarize text using connection', async () => {
    const mockResult = { summary: 'A brief summary', model: 'gpt-5.5' }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    const gen = createSummarize({ connection: adapter })

    await gen.generate({ text: 'Long text to summarize...' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should handle errors', async () => {
    const onError = vi.fn()

    const gen = createSummarize({
      fetcher: async () => {
        throw new Error('Summarization failed')
      },
      onError,
    })

    await gen.generate({ text: 'test' })

    expect(gen.status).toBe('error')
    expect(gen.error?.message).toBe('Summarization failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should stop and reset', async () => {
    const gen = createSummarize({
      fetcher: async () => ({
        id: 'sum-1',
        summary: 'A brief summary',
        model: 'gpt-5.5',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
    })

    await gen.generate({ text: 'Long text...' })

    expect(gen.result).not.toBeNull()

    gen.reset()

    expect(gen.result).toBeNull()
    expect(gen.error).toBeUndefined()
    expect(gen.status).toBe('idle')
  })
})

describe('createGenerateVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default state', () => {
    const adapter = createMockConnectionAdapter()
    const gen = createGenerateVideo({ connection: adapter })

    expect(gen.result).toBeNull()
    expect(gen.jobId).toBeNull()
    expect(gen.videoStatus).toBeNull()
    expect(gen.isLoading).toBe(false)
    expect(gen.status).toBe('idle')
  })

  it('should throw if neither connection nor fetcher is provided', () => {
    expect(() => createGenerateVideo({} as any)).toThrow(
      'createGenerateVideo requires either a connection or fetcher option',
    )
  })

  it('should generate video using fetcher', async () => {
    const mockResult = {
      jobId: 'job-1',
      status: 'completed' as const,
      url: 'https://example.com/video.mp4',
    }

    const gen = createGenerateVideo({
      fetcher: async () => mockResult,
    })

    await gen.generate({ prompt: 'A flying car' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should track video job lifecycle via connection', async () => {
    const chunks = createVideoChunks('job-123', 'https://example.com/video.mp4')
    const adapter = createMockConnectionAdapter({ chunks })
    const onJobCreated = vi.fn()
    const onStatusUpdate = vi.fn()

    const gen = createGenerateVideo({
      connection: adapter,
      onJobCreated,
      onStatusUpdate,
    })

    await gen.generate({ prompt: 'A flying car' })

    expect(gen.result).toEqual(
      expect.objectContaining({
        jobId: 'job-123',
        url: 'https://example.com/video.mp4',
      }),
    )
    expect(gen.jobId).toBe('job-123')
    expect(gen.status).toBe('success')
    expect(onJobCreated).toHaveBeenCalledWith('job-123')
    expect(onStatusUpdate).toHaveBeenCalled()
  })

  it('should handle video generation errors', async () => {
    const chunks = createErrorChunks('Video generation failed')
    const adapter = createMockConnectionAdapter({ chunks })
    const onError = vi.fn()

    const gen = createGenerateVideo({
      connection: adapter,
      onError,
    })

    await gen.generate({ prompt: 'test' })

    expect(gen.status).toBe('error')
    expect(gen.error?.message).toBe('Video generation failed')
    expect(onError).toHaveBeenCalled()
  })

  it('should stop and reset', async () => {
    const gen = createGenerateVideo({
      fetcher: async () => ({
        jobId: 'job-1',
        status: 'completed' as const,
        url: 'https://example.com/video.mp4',
      }),
    })

    await gen.generate({ prompt: 'test' })

    expect(gen.result).not.toBeNull()

    gen.reset()

    expect(gen.result).toBeNull()
    expect(gen.jobId).toBeNull()
    expect(gen.videoStatus).toBeNull()
    expect(gen.status).toBe('idle')
  })

  it('does not auto-fire a video generation on setup from a hydrated running snapshot', async () => {
    const { adapter, connect } = createRunContextCaptureAdapter([])
    const hydrateGeneration = vi.fn(async () => ({
      resumeSnapshot: videoResumeSnapshot,
      activeRun: null,
    }))
    const gen = createGenerateVideo({
      threadId: 'video-no-auto-fire',
      // No `joinRun`, so the restored run cannot be tailed.
      connection: { ...adapter, hydrateGeneration },
      persistence: true,
    })

    await flushAsync()

    // Hydration only surfaces state; it never restarts the run.
    expect(connect).not.toHaveBeenCalled()
    expect(gen.error?.message).toMatch(/interrupted/)
    expect(gen.status).toBe('error')
    expect(gen.isLoading).toBe(false)
    expect(gen.runId).toBeNull()
  })

  it('should expose generate, stop, reset, and updateBody methods', () => {
    const adapter = createMockConnectionAdapter()
    const gen = createGenerateVideo({ connection: adapter })

    expect(typeof gen.generate).toBe('function')
    expect(typeof gen.stop).toBe('function')
    expect(typeof gen.reset).toBe('function')
    expect(typeof gen.updateBody).toBe('function')
  })
})

describe('onResult transform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should transform result when onResult returns a value (fetcher)', async () => {
    // Inference (issue #848): `onResult`'s parameter is contextually typed from
    // the fetcher's return, and `result` narrows to the transform's return —
    // no explicit type arguments needed.
    const gen = createGeneration({
      fetcher: async () => ({ id: '1', audio: 'base64data' }),
      onResult: (raw) => ({ playable: raw.audio.length > 0 }),
    })
    expectTypeOf(gen.result).toEqualTypeOf<{ playable: boolean } | null>()

    await gen.generate({ prompt: 'test' })

    expect(gen.result).toEqual({ playable: true })
    expect(gen.status).toBe('success')
  })

  it('should use raw result when onResult returns void', async () => {
    const onResult = vi.fn()

    const gen = createGeneration({
      fetcher: async () => ({ id: '1', data: 'test' }),
      onResult,
    })

    await gen.generate({ prompt: 'test' })

    expect(onResult).toHaveBeenCalledWith({ id: '1', data: 'test' })
    expect(gen.result).toEqual({ id: '1', data: 'test' })
  })

  it('should keep previous result when onResult returns null', async () => {
    const gen = createGeneration({
      fetcher: async () => ({ id: '1' }),
      onResult: () => null,
    })

    await gen.generate({ prompt: 'test' })

    // null return → keep previous (which was null initially)
    expect(gen.result).toBeNull()
    expect(gen.status).toBe('success')
  })

  it('should transform result from connection stream', async () => {
    type StreamResult = { id: string; images: Array<string> }
    const mockResult: StreamResult = { id: '1', images: ['img1', 'img2'] }
    const chunks = createGenerationChunks(mockResult)
    const adapter = createMockConnectionAdapter({ chunks })

    // In connection mode there's no fetcher to infer `TResult` from, so annotate
    // the `onResult` parameter — `TResult` infers from the annotation and
    // `result` narrows to the transform's return. No explicit type args needed.
    const gen = createGeneration({
      connection: adapter,
      onResult: (raw: StreamResult) => ({ count: raw.images.length }),
    })
    expectTypeOf(gen.result).toEqualTypeOf<{ count: number } | null>()

    await gen.generate({ prompt: 'test' })

    expect(gen.result).toEqual({ count: 2 })
  })

  it('should work with createGenerateSpeech transform', async () => {
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
    const gen = createGenerateSpeech({
      fetcher: async () => mockTTSResult,
      onResult: (raw) => ({
        audioUrl: `data:${raw.contentType};base64,${raw.audio}`,
      }),
    })
    expectTypeOf(gen.result).toEqualTypeOf<{ audioUrl: string } | null>()

    await gen.generate({ text: 'Hello' })

    expect(gen.result).toEqual({
      audioUrl: 'data:audio/mpeg;base64,base64audio',
    })
  })

  it('infers the raw result type when no onResult is provided', () => {
    const gen = createTranscription({
      fetcher: async () => ({ id: '1', text: 'hi', model: 'whisper-1' }),
    })
    // Without a transform, `result` stays the raw TranscriptionResult.
    expectTypeOf(gen.result).toEqualTypeOf<TranscriptionResult | null>()
  })

  it('narrows the wrapper result type to the transform return', () => {
    const gen = createTranscription({
      fetcher: async () => ({ id: '1', text: 'hi', model: 'whisper-1' }),
      onResult: (res) => res.text,
    })
    expectTypeOf(gen.result).toEqualTypeOf<string | null>()
  })
})
