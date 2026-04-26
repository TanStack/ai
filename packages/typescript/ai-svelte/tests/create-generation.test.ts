import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGeneration } from '../src/create-generation.svelte'
import { createGenerateImage } from '../src/create-generate-image.svelte'
import { createGenerateSpeech } from '../src/create-generate-speech.svelte'
import { createTranscription } from '../src/create-transcription.svelte'
import { createSummarize } from '../src/create-summarize.svelte'
import { createGenerateVideo } from '../src/create-generate-video.svelte'
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
      summary: 'A brief summary',
      model: 'gpt-4',
    }

    const gen = createSummarize({
      fetcher: async () => mockResult,
    })

    await gen.generate({ text: 'Long text to summarize...' })

    expect(gen.result).toEqual(mockResult)
    expect(gen.status).toBe('success')
  })

  it('should summarize text using connection', async () => {
    const mockResult = { summary: 'A brief summary', model: 'gpt-4' }
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
        summary: 'A brief summary',
        model: 'gpt-4',
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

  it('should expose generate, stop, reset, and updateBody methods', () => {
    const adapter = createMockConnectionAdapter()
    const gen = createGenerateVideo({ connection: adapter })

    expect(typeof gen.generate).toBe('function')
    expect(typeof gen.stop).toBe('function')
    expect(typeof gen.reset).toBe('function')
    expect(typeof gen.updateBody).toBe('function')
  })
})
