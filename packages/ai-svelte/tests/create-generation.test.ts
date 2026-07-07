import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createGeneration } from '../src/create-generation.svelte'
import { createGenerateImage } from '../src/create-generate-image.svelte'
import { createGenerateSpeech } from '../src/create-generate-speech.svelte'
import { createTranscription } from '../src/create-transcription.svelte'
import { createSummarize } from '../src/create-summarize.svelte'
import { createGenerateVideo } from '../src/create-generate-video.svelte'
import { createMockConnectionAdapter } from './test-utils'
import { EventType, type StreamChunk } from '@tanstack/ai'
import type { TTSResult, TranscriptionResult } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationResumeSnapshot,
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

    it('should ignore auto-resume rejection after dispose', async () => {
      const deferred = createDeferred<GenerationResumeSnapshot | null>()
      const getItem = vi.fn(() => deferred.promise)
      const onError = vi.fn()
      const gen = createGeneration({
        fetcher: async () => ({ id: '1' }),
        persistence: {
          server: {
            getItem,
            setItem: vi.fn(),
            removeItem: vi.fn(),
          },
        },
        onError,
      })

      await vi.waitFor(() => expect(getItem).toHaveBeenCalled())
      gen.dispose()
      deferred.reject(new Error('resume failed'))
      await deferred.promise.catch(() => {})
      await Promise.resolve()

      expect(onError).not.toHaveBeenCalled()
      expect(gen.error).toBeUndefined()
      expect(gen.status).toBe('idle')
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

  it('should explicitly resume from the current snapshot', async () => {
    const { adapter, connect, runContexts } = createRunContextCaptureAdapter(
      createReplayVideoChunks(),
    )

    const gen = createGenerateVideo({
      connection: adapter,
      initialResumeSnapshot: videoResumeSnapshot,
      autoResume: false,
    })

    const didResume = await gen.resume()

    expect(didResume).toBe(true)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(runContexts[0]).toEqual(videoResumeSnapshot.resumeState)
    expect(gen.resumeSnapshot).toEqual(
      expect.objectContaining({
        status: 'complete',
        resumeState: null,
      }),
    )
    expect(gen.result).toEqual(
      expect.objectContaining({
        jobId: 'job-replay',
      }),
    )
  })

  it('should ignore video auto-resume rejection after dispose', async () => {
    const deferred = createDeferred<GenerationResumeSnapshot | null>()
    const getItem = vi.fn(() => deferred.promise)
    const onError = vi.fn()
    const gen = createGenerateVideo({
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
    })

    await vi.waitFor(() => expect(getItem).toHaveBeenCalled())
    gen.dispose()
    deferred.reject(new Error('video resume failed'))
    await deferred.promise.catch(() => {})
    await Promise.resolve()

    expect(onError).not.toHaveBeenCalled()
    expect(gen.error).toBeUndefined()
    expect(gen.status).toBe('idle')
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
