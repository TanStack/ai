/**
 * Smoke tests for the OpenAI-compatible media adapters (image, summarize,
 * transcription, TTS, video). Each test verifies the adapter instantiates,
 * forwards arguments to the OpenAI SDK shape we expect, and surfaces errors
 * via `logger.errors` / `RUN_ERROR` rather than swallowing them. The mocks
 * stand in for the OpenAI SDK; the real SDK is exercised in the e2e suite.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAICompatibleImageAdapter } from '../src/adapters/image'
import { OpenAICompatibleSummarizeAdapter } from '../src/adapters/summarize'
import { OpenAICompatibleTranscriptionAdapter } from '../src/adapters/transcription'
import { OpenAICompatibleTTSAdapter } from '../src/adapters/tts'
import { OpenAICompatibleVideoAdapter } from '../src/adapters/video'
import type { ChatStreamCapable } from '../src/adapters/summarize'
import type { StreamChunk } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

let mockImagesGenerate: ReturnType<typeof vi.fn>
let mockTranscriptionsCreate: ReturnType<typeof vi.fn>
let mockSpeechCreate: ReturnType<typeof vi.fn>
let mockVideosCreate: ReturnType<typeof vi.fn>
let mockVideosRetrieve: ReturnType<typeof vi.fn>

vi.mock('openai', () => {
  return {
    default: class {
      images = {
        generate: (...args: Array<unknown>) => mockImagesGenerate(...args),
      }
      audio = {
        transcriptions: {
          create: (...args: Array<unknown>) =>
            mockTranscriptionsCreate(...args),
        },
        speech: {
          create: (...args: Array<unknown>) => mockSpeechCreate(...args),
        },
      }
      videos = {
        create: (...args: Array<unknown>) => mockVideosCreate(...args),
        retrieve: (...args: Array<unknown>) => mockVideosRetrieve(...args),
      }
    },
  }
})

const config = {
  apiKey: 'test-key',
  baseURL: 'https://api.test-provider.com/v1',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockImagesGenerate = vi.fn()
  mockTranscriptionsCreate = vi.fn()
  mockSpeechCreate = vi.fn()
  mockVideosCreate = vi.fn()
  mockVideosRetrieve = vi.fn()
})

describe('OpenAICompatibleImageAdapter', () => {
  it('forwards model, prompt, n, and size to images.generate', async () => {
    mockImagesGenerate.mockResolvedValue({
      data: [{ url: 'https://example.com/img.png' }],
    })

    const adapter = new OpenAICompatibleImageAdapter(config, 'test-model')
    const result = await adapter.generateImages({
      logger: testLogger,
      model: 'test-model',
      prompt: 'a cat',
      numberOfImages: 2,
      size: '1024x1024',
    })

    expect(mockImagesGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        prompt: 'a cat',
        n: 2,
        size: '1024x1024',
        stream: false,
      }),
    )
    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toMatchObject({
      url: 'https://example.com/img.png',
    })
  })

  it('rejects invalid number of images via base validator', async () => {
    const adapter = new OpenAICompatibleImageAdapter(config, 'test-model')
    await expect(
      adapter.generateImages({
        logger: testLogger,
        model: 'test-model',
        prompt: 'a cat',
        numberOfImages: 0,
      }),
    ).rejects.toThrow('at least 1')
  })

  it('logs to errors and rethrows on SDK failure', async () => {
    const errors = vi.fn()
    // testLogger is a class instance — spreading drops prototype methods, so
    // wrap with a Proxy that overrides `errors` and forwards everything else.
    const logger = new Proxy(testLogger, {
      get(target, key) {
        if (key === 'errors') return errors
        return Reflect.get(target, key)
      },
    })
    mockImagesGenerate.mockRejectedValue(new Error('boom'))

    const adapter = new OpenAICompatibleImageAdapter(config, 'test-model')
    await expect(
      adapter.generateImages({
        logger,
        model: 'test-model',
        prompt: 'a cat',
      }),
    ).rejects.toThrow('boom')
    expect(errors).toHaveBeenCalled()
  })
})

describe('OpenAICompatibleSummarizeAdapter', () => {
  function fakeTextAdapter(
    chunks: Array<StreamChunk>,
  ): ChatStreamCapable<Record<string, any>> {
    return {
      async *chatStream() {
        for (const c of chunks) {
          yield c
        }
      },
    }
  }

  it('accumulates content from TEXT_MESSAGE_CONTENT chunks', async () => {
    const adapter = new OpenAICompatibleSummarizeAdapter(
      fakeTextAdapter([
        {
          type: 'TEXT_MESSAGE_CONTENT',
          delta: 'Hello ',
          messageId: 'm1',
          model: 'test-model',
          timestamp: 1,
        } as unknown as StreamChunk,
        {
          type: 'TEXT_MESSAGE_CONTENT',
          delta: 'world',
          messageId: 'm1',
          model: 'test-model',
          timestamp: 2,
        } as unknown as StreamChunk,
        {
          type: 'RUN_FINISHED',
          runId: 'r1',
          model: 'test-model',
          timestamp: 3,
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          finishReason: 'stop',
        } as unknown as StreamChunk,
      ]),
      'test-model',
      'test-provider',
    )

    const result = await adapter.summarize({
      logger: testLogger,
      model: 'test-model',
      text: 'Long text to summarise.',
    })

    expect(result.summary).toBe('Hello world')
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    })
  })

  it('throws and logs when the underlying chatStream emits RUN_ERROR', async () => {
    const errors = vi.fn()
    // testLogger is a class instance — spreading drops prototype methods, so
    // wrap with a Proxy that overrides `errors` and forwards everything else.
    const logger = new Proxy(testLogger, {
      get(target, key) {
        if (key === 'errors') return errors
        return Reflect.get(target, key)
      },
    })

    const adapter = new OpenAICompatibleSummarizeAdapter(
      {
        async *chatStream() {
          yield {
            type: 'RUN_ERROR',
            runId: 'r1',
            model: 'test-model',
            timestamp: 1,
            error: { message: 'upstream rate limit', code: 'rate_limited' },
          } as unknown as StreamChunk
        },
      },
      'test-model',
      'test-provider',
    )

    await expect(
      adapter.summarize({
        logger,
        model: 'test-model',
        text: 'irrelevant',
      }),
    ).rejects.toThrow('upstream rate limit')
    expect(errors).toHaveBeenCalled()
  })
})

describe('OpenAICompatibleTranscriptionAdapter', () => {
  it('forwards model and language and returns text-only result for non-verbose formats', async () => {
    mockTranscriptionsCreate.mockResolvedValue({ text: 'hello world' })

    const adapter = new OpenAICompatibleTranscriptionAdapter(
      config,
      'whisper-1',
    )
    const result = await adapter.transcribe({
      logger: testLogger,
      model: 'whisper-1',
      audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
      language: 'en',
      responseFormat: 'json',
    })

    expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'whisper-1',
        language: 'en',
      }),
    )
    expect(result.text).toBe('hello world')
    expect(result.segments).toBeUndefined()
  })

  it('decodes a base64 audio string to a File on the request path', async () => {
    mockTranscriptionsCreate.mockResolvedValue({ text: 'decoded' })

    const adapter = new OpenAICompatibleTranscriptionAdapter(
      config,
      'whisper-1',
    )
    // 3 raw bytes encoded as base64
    const base64 = 'AQID'
    await adapter.transcribe({
      logger: testLogger,
      model: 'whisper-1',
      audio: base64,
      responseFormat: 'json',
    })

    const callArgs = mockTranscriptionsCreate.mock.calls[0]?.[0]
    expect(callArgs?.file).toBeDefined()
    expect(callArgs?.file).toBeInstanceOf(File)
  })
})

describe('OpenAICompatibleTTSAdapter', () => {
  it('forwards model/voice/format/speed and returns base64 audio', async () => {
    const fakeBuffer = new Uint8Array([1, 2, 3, 4]).buffer
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(fakeBuffer),
    })

    const adapter = new OpenAICompatibleTTSAdapter(config, 'tts-1')
    const result = await adapter.generateSpeech({
      logger: testLogger,
      model: 'tts-1',
      text: 'Hello',
      voice: 'alloy',
      format: 'mp3',
      speed: 1.0,
    })

    expect(mockSpeechCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'tts-1',
        input: 'Hello',
        voice: 'alloy',
        response_format: 'mp3',
        speed: 1.0,
      }),
    )
    expect(result.audio).toBeTruthy()
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.format).toBe('mp3')
  })

  it('rejects out-of-range speed via base validator', async () => {
    const adapter = new OpenAICompatibleTTSAdapter(config, 'tts-1')
    await expect(
      adapter.generateSpeech({
        logger: testLogger,
        model: 'tts-1',
        text: 'Hello',
        speed: 5.0,
      }),
    ).rejects.toThrow('Speed')
  })
})

describe('OpenAICompatibleVideoAdapter', () => {
  it('createVideoJob forwards model/prompt/size/duration and returns jobId', async () => {
    mockVideosCreate.mockResolvedValue({ id: 'job-123' })

    const adapter = new OpenAICompatibleVideoAdapter(config, 'sora-2')
    const result = await adapter.createVideoJob({
      logger: testLogger,
      model: 'sora-2',
      prompt: 'a sunset',
      size: '1080x1920',
      duration: 4,
    })

    expect(mockVideosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'sora-2',
        prompt: 'a sunset',
        size: '1080x1920',
        seconds: '4',
      }),
    )
    expect(result.jobId).toBe('job-123')
  })

  it('getVideoStatus maps SDK status strings to the AG-UI vocabulary', async () => {
    mockVideosRetrieve.mockResolvedValue({
      id: 'job-123',
      status: 'queued',
      progress: 5,
    })

    const adapter = new OpenAICompatibleVideoAdapter(config, 'sora-2')
    const status = await adapter.getVideoStatus('job-123')

    expect(status.status).toBe('pending')
    expect(status.progress).toBe(5)
  })

  it('getVideoUrl returns the URL directly when retrieve() exposes one', async () => {
    mockVideosRetrieve.mockResolvedValue({
      id: 'job-123',
      url: 'https://cdn.example.com/job-123.mp4',
      expires_at: 1700000000,
    })

    const adapter = new OpenAICompatibleVideoAdapter(config, 'sora-2')
    const result = await adapter.getVideoUrl('job-123')

    expect(result.url).toBe('https://cdn.example.com/job-123.mp4')
    expect(result.expiresAt).toBeInstanceOf(Date)
  })
})
