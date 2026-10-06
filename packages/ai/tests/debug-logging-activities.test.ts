import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
  summarize,
} from '../src/index'
import type { Logger } from '../src/logger/types'

// ============================================================================
// Helpers
// ============================================================================

const makeSpyLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const logPrefixes = (
  calls: ReadonlyArray<ReadonlyArray<unknown>>,
): Array<string> =>
  calls.map((call) => {
    const m = call[0]
    return typeof m === 'string' ? m : String(m)
  })

// ============================================================================
// Tests
// ============================================================================

describe('debug logging — non-chat activities', () => {
  let logger: ReturnType<typeof makeSpyLogger>
  beforeEach(() => {
    logger = makeSpyLogger()
  })

  it('summarize emits request and output categories', async () => {
    const adapter = {
      kind: 'summarize' as const,
      name: 'mock',
      model: 'mock-model',
      summarize: vi.fn(async () => ({ summary: 'done' })),
    }

    await summarize({
      adapter: adapter as any,
      text: 'long text to summarize',
      debug: { logger: logger as unknown as Logger },
    })

    const msgs = logPrefixes(logger.debug.mock.calls)
    expect(msgs.some((m) => m.includes('[tanstack-ai:request]'))).toBe(true)
    expect(msgs.some((m) => m.includes('[tanstack-ai:output]'))).toBe(true)
  })

  it('generateImage emits request and output categories', async () => {
    const adapter = {
      kind: 'image' as const,
      name: 'mock',
      model: 'mock-image-model',
      generateImages: vi.fn(async () => ({
        images: [{ url: 'https://example.com/image.png' }],
      })),
    }

    await generateImage({
      adapter: adapter as any,
      prompt: 'a sunset over the ocean',
      debug: { logger: logger as unknown as Logger },
    })

    const msgs = logPrefixes(logger.debug.mock.calls)
    expect(msgs.some((m) => m.includes('[tanstack-ai:request]'))).toBe(true)
    expect(msgs.some((m) => m.includes('[tanstack-ai:output]'))).toBe(true)
  })

  it('generateSpeech emits request and output categories', async () => {
    const adapter = {
      kind: 'tts' as const,
      name: 'mock',
      model: 'mock-tts-model',
      generateSpeech: vi.fn(async () => ({
        audio: 'base64-audio',
        format: 'mp3',
        contentType: 'audio/mpeg',
      })),
    }

    await generateSpeech({
      adapter: adapter as any,
      text: 'hello world',
      debug: { logger: logger as unknown as Logger },
    })

    const msgs = logPrefixes(logger.debug.mock.calls)
    expect(msgs.some((m) => m.includes('[tanstack-ai:request]'))).toBe(true)
    expect(msgs.some((m) => m.includes('[tanstack-ai:output]'))).toBe(true)
  })

  it('generateTranscription emits request and output categories', async () => {
    const adapter = {
      kind: 'transcription' as const,
      name: 'mock',
      model: 'mock-transcription-model',
      transcribe: vi.fn(async () => ({
        text: 'transcribed text',
        language: 'en',
      })),
    }

    await generateTranscription({
      adapter: adapter as any,
      audio: 'base64-audio-data',
      debug: { logger: logger as unknown as Logger },
    })

    const msgs = logPrefixes(logger.debug.mock.calls)
    expect(msgs.some((m) => m.includes('[tanstack-ai:request]'))).toBe(true)
    expect(msgs.some((m) => m.includes('[tanstack-ai:output]'))).toBe(true)
  })

  it('generateVideo emits request and output categories', async () => {
    const adapter = {
      kind: 'video' as const,
      name: 'mock',
      model: 'mock-video-model',
      createVideoJob: vi.fn(async () => ({
        jobId: 'job-123',
        model: 'mock-video-model',
      })),
      getVideoStatus: vi.fn(async () => ({ status: 'completed' as const })),
      getVideoUrl: vi.fn(async () => ({ url: 'https://example.com/v.mp4' })),
    }

    await generateVideo({
      adapter: adapter as any,
      prompt: 'a cat walking across a table',
      debug: { logger: logger as unknown as Logger },
    })

    const msgs = logPrefixes(logger.debug.mock.calls)
    expect(msgs.some((m) => m.includes('[tanstack-ai:request]'))).toBe(true)
    expect(msgs.some((m) => m.includes('[tanstack-ai:output]'))).toBe(true)
  })

  it('chat-only categories never fire for non-chat activities', async () => {
    const adapter = {
      kind: 'summarize' as const,
      name: 'mock',
      model: 'mock-model',
      summarize: vi.fn(async () => ({ summary: 'x' })),
    }

    await summarize({
      adapter: adapter as any,
      text: 'x',
      debug: { logger: logger as unknown as Logger },
    })

    const msgs = logPrefixes(logger.debug.mock.calls)
    for (const cat of ['middleware', 'tools', 'agentLoop', 'config']) {
      expect(msgs.some((m) => m.includes(`[tanstack-ai:${cat}]`))).toBe(false)
    }
  })

  it('adapter errors reach the errors category even when debug is unspecified', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter = {
      kind: 'summarize' as const,
      name: 'mock',
      model: 'mock-model',
      summarize: vi.fn(async () => {
        throw new Error('boom')
      }),
    }

    await expect(
      summarize({ adapter: adapter as any, text: 'x' }),
    ).rejects.toThrow('boom')

    const msgs = logPrefixes(errSpy.mock.calls)
    expect(msgs.some((m) => m.includes('[tanstack-ai:errors]'))).toBe(true)
    errSpy.mockRestore()
  })

  it('adapter errors in generateImage route to errors category via custom logger', async () => {
    const adapter = {
      kind: 'image' as const,
      name: 'mock',
      model: 'mock-image-model',
      generateImages: vi.fn(async () => {
        throw new Error('image boom')
      }),
    }

    await expect(
      generateImage({
        adapter: adapter as any,
        prompt: 'x',
        debug: { logger: logger as unknown as Logger },
      }),
    ).rejects.toThrow('image boom')

    expect(logger.error).toHaveBeenCalled()
    const msgs = logPrefixes(logger.error.mock.calls)
    expect(msgs.some((m) => m.includes('[tanstack-ai:errors]'))).toBe(true)
  })

  it('debug: false on non-chat activity silences errors too', async () => {
    const adapter = {
      kind: 'summarize' as const,
      name: 'mock',
      model: 'mock-model',
      summarize: vi.fn(async () => {
        throw new Error('silent boom')
      }),
    }

    await expect(
      summarize({
        adapter: adapter as any,
        text: 'x',
        debug: {
          logger: logger as unknown as Logger,
          errors: false,
          provider: false,
          output: false,
          request: false,
        },
      }),
    ).rejects.toThrow('silent boom')

    expect(logger.debug).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})
