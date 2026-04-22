import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateMusic } from '@tanstack/ai'

import { falMusic } from '../src/adapters/music'

// Declare mocks at module level
let mockSubscribe: any
let mockConfig: any

// Mock the fal.ai client
vi.mock('@fal-ai/client', () => {
  return {
    fal: {
      subscribe: (...args: Array<unknown>) => mockSubscribe(...args),
      config: (...args: Array<unknown>) => mockConfig(...args),
    },
  }
})

// minimax-music/v2 requires lyrics_prompt
const DEFAULT_LYRICS = '[instrumental]'

const createAdapter = () =>
  falMusic('fal-ai/minimax-music/v2', { apiKey: 'test-key' })

describe('Fal Music Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe = vi.fn()
    mockConfig = vi.fn()
  })

  it('generates music with correct API call', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio: {
          url: 'https://fal.media/files/audio.wav',
          content_type: 'audio/wav',
        },
      },
      requestId: 'req-audio-123',
    })

    const adapter = createAdapter()

    const result = await generateMusic({
      adapter,
      prompt: 'An upbeat electronic track with synths',
      modelOptions: {
        lyrics_prompt: DEFAULT_LYRICS,
      },
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)

    const [model, options] = mockSubscribe.mock.calls[0]!
    expect(model).toBe('fal-ai/minimax-music/v2')
    expect(options.input).toMatchObject({
      prompt: 'An upbeat electronic track with synths',
      lyrics_prompt: DEFAULT_LYRICS,
    })

    expect(result.model).toBe('fal-ai/minimax-music/v2')
    expect(result.audio.url).toBe('https://fal.media/files/audio.wav')
    expect(result.audio.contentType).toBe('audio/wav')
  })

  it('returns audio URL from response', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio: {
          url: 'https://fal.media/files/music.mp3',
        },
      },
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    const result = await generateMusic({
      adapter,
      prompt: 'A calm piano piece',
      modelOptions: {
        lyrics_prompt: DEFAULT_LYRICS,
      },
    })

    expect(result.audio.url).toBe('https://fal.media/files/music.mp3')
  })

  it('passes duration and model options', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio: {
          url: 'https://fal.media/files/audio.wav',
        },
      },
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    await generateMusic({
      adapter,
      prompt: 'Test audio',
      duration: 30,
      modelOptions: {
        lyrics_prompt: '[verse]\nTest lyrics\n[chorus]\nLa la la',
      },
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      prompt: 'Test audio',
      duration: 30,
      lyrics_prompt: '[verse]\nTest lyrics\n[chorus]\nLa la la',
    })
  })

  it('works with diffrhythm model and required lyrics field', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio: {
          url: 'https://fal.media/files/diffrhythm.wav',
          content_type: 'audio/wav',
        },
      },
      requestId: 'req-789',
    })

    const adapter = falMusic('fal-ai/diffrhythm', { apiKey: 'test-key' })

    const result = await generateMusic({
      adapter,
      prompt: 'An upbeat pop song',
      modelOptions: {
        lyrics: '[verse]\nHello world\n[chorus]\nLa la la',
      },
    })

    const [model, options] = mockSubscribe.mock.calls[0]!
    expect(model).toBe('fal-ai/diffrhythm')
    expect(options.input).toMatchObject({
      prompt: 'An upbeat pop song',
      lyrics: '[verse]\nHello world\n[chorus]\nLa la la',
    })

    expect(result.audio.url).toBe('https://fal.media/files/diffrhythm.wav')
  })

  it('throws when audio URL not found', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {},
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    await expect(
      generateMusic({
        adapter,
        prompt: 'Test',
        modelOptions: {
          lyrics_prompt: DEFAULT_LYRICS,
        },
      }),
    ).rejects.toThrow('Audio URL not found in fal audio generation response')
  })

  it('configures client with API key', () => {
    falMusic('fal-ai/minimax-music/v2', { apiKey: 'my-api-key' })

    expect(mockConfig).toHaveBeenCalledWith({
      credentials: 'my-api-key',
    })
  })

  it('configures client with proxy URL when provided', () => {
    falMusic('fal-ai/minimax-music/v2', {
      apiKey: 'my-api-key',
      proxyUrl: '/api/fal/proxy',
    })

    expect(mockConfig).toHaveBeenCalledWith({
      proxyUrl: '/api/fal/proxy',
    })
  })
})
