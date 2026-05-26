import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAudio } from '@tanstack/ai'

import { falAudio } from '../src/adapters/audio'

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
  falAudio('fal-ai/minimax-music/v2', { apiKey: 'test-key' })

describe('Fal Audio Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe = vi.fn()
    mockConfig = vi.fn()
  })

  it('generates audio with correct API call', async () => {
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

    const result = await generateAudio({
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

    const result = await generateAudio({
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

    await generateAudio({
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

  it('passes modelOptions through for models that require extra fields', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio: {
          url: 'https://fal.media/files/mm.mp3',
          content_type: 'audio/mpeg',
        },
      },
      requestId: 'req-mm-1',
    })

    const adapter = falAudio('fal-ai/minimax-music/v2', { apiKey: 'test-key' })

    await generateAudio({
      adapter,
      prompt: 'Upbeat synth pop',
      modelOptions: {
        lyrics_prompt: '[verse]\nLyrics here\n[chorus]\nLa la la',
      },
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      prompt: 'Upbeat synth pop',
      lyrics_prompt: '[verse]\nLyrics here\n[chorus]\nLa la la',
    })
  })

  it('handles audio_url response format', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio_url: 'https://fal.media/files/sfx.wav',
      },
      requestId: 'req-456',
    })

    const adapter = createAdapter()

    const result = await generateAudio({
      adapter,
      prompt: 'Explosion sound effect',
      modelOptions: {
        lyrics_prompt: DEFAULT_LYRICS,
      },
    })

    expect(result.audio.url).toBe('https://fal.media/files/sfx.wav')
  })

  it('throws when audio URL not found', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {},
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    await expect(
      generateAudio({
        adapter,
        prompt: 'Test',
        modelOptions: {
          lyrics_prompt: DEFAULT_LYRICS,
        },
      }),
    ).rejects.toThrow('Audio URL not found in fal audio generation response')
  })

  it('converts duration to music_length_ms for fal-ai/elevenlabs/music', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { audio: { url: 'https://fal.media/files/el.mp3' } },
      requestId: 'req-el-1',
    })

    const adapter = falAudio('fal-ai/elevenlabs/music', { apiKey: 'test-key' })

    await generateAudio({
      adapter,
      prompt: 'Lo-fi hip-hop',
      duration: 30,
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      prompt: 'Lo-fi hip-hop',
      music_length_ms: 30_000,
    })
    expect(options.input).not.toHaveProperty('duration')
  })

  it('converts duration to seconds_total for fal-ai/stable-audio-25/text-to-audio', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { audio: { url: 'https://fal.media/files/sa.mp3' } },
      requestId: 'req-sa-1',
    })

    const adapter = falAudio('fal-ai/stable-audio-25/text-to-audio', {
      apiKey: 'test-key',
    })

    await generateAudio({
      adapter,
      prompt: 'Ambient drone',
      duration: 12,
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      prompt: 'Ambient drone',
      seconds_total: 12,
    })
    expect(options.input).not.toHaveProperty('duration')
  })

  it('lets modelOptions override a translated duration field', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { audio: { url: 'https://fal.media/files/el.mp3' } },
      requestId: 'req-el-2',
    })

    const adapter = falAudio('fal-ai/elevenlabs/music', { apiKey: 'test-key' })

    await generateAudio({
      adapter,
      prompt: 'Piano loop',
      duration: 30,
      modelOptions: { music_length_ms: 60_000 },
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input.music_length_ms).toBe(60_000)
  })

  it('configures client with API key', () => {
    falAudio('fal-ai/minimax-music/v2', { apiKey: 'my-api-key' })

    expect(mockConfig).toHaveBeenCalledWith({
      credentials: 'my-api-key',
    })
  })

  it('configures client with proxy URL and credentials when both provided', () => {
    falAudio('fal-ai/minimax-music/v2', {
      apiKey: 'my-api-key',
      proxyUrl: '/api/fal/proxy',
    })

    expect(mockConfig).toHaveBeenCalledWith({
      credentials: 'my-api-key',
      proxyUrl: '/api/fal/proxy',
    })
  })

  it('derives content type from mp3 URL when not provided by response', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio_url: 'https://fal.media/files/derived.mp3?signed=1',
      },
      requestId: 'req-derived-1',
    })

    const adapter = createAdapter()

    const result = await generateAudio({
      adapter,
      prompt: 'No content type on response',
      modelOptions: { lyrics_prompt: DEFAULT_LYRICS },
    })

    expect(result.audio.contentType).toBe('audio/mpeg')
  })

  it('falls back to audio/mpeg when extension cannot be derived', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio_url: 'https://fal.media/files/no-ext',
      },
      requestId: 'req-derived-2',
    })

    const adapter = createAdapter()

    const result = await generateAudio({
      adapter,
      prompt: 'URL without extension',
      modelOptions: { lyrics_prompt: DEFAULT_LYRICS },
    })

    expect(result.audio.contentType).toBe('audio/mpeg')
  })

  it('strips parameters from explicit content types', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio: {
          url: 'https://fal.media/files/audio.wav',
          content_type: 'audio/wav; codecs=pcm',
        },
      },
      requestId: 'req-strip-1',
    })

    const adapter = createAdapter()

    const result = await generateAudio({
      adapter,
      prompt: 'Stripped content type',
      modelOptions: { lyrics_prompt: DEFAULT_LYRICS },
    })

    expect(result.audio.contentType).toBe('audio/wav')
  })
})
