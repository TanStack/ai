import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSpeech } from '@tanstack/ai'

import { falSpeech } from '../src/adapters/speech'

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

// Mock fetch for URL→base64 conversion
const mockFetchResponse = {
  ok: true,
  status: 200,
  statusText: 'OK',
  arrayBuffer: () =>
    Promise.resolve(new Uint8Array([72, 101, 108, 108, 111]).buffer),
}
const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse)
vi.stubGlobal('fetch', mockFetch)

// index-tts-2 requires audio_url (reference audio for voice cloning)
const REFERENCE_AUDIO = 'https://example.com/reference-voice.wav'

const createAdapter = () =>
  falSpeech('fal-ai/index-tts-2/text-to-speech', { apiKey: 'test-key' })

function createMockSpeechResponse(audioUrl: string, contentType?: string) {
  return {
    data: {
      audio: {
        url: audioUrl,
        ...(contentType ? { content_type: contentType } : {}),
      },
    },
    requestId: 'req-speech-123',
  }
}

describe('Fal Speech Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe = vi.fn()
    mockConfig = vi.fn()
    mockFetch.mockResolvedValue(mockFetchResponse)
  })

  it('generates speech with correct API call', async () => {
    mockSubscribe.mockResolvedValueOnce(
      createMockSpeechResponse(
        'https://fal.media/files/speech.wav',
        'audio/wav',
      ),
    )

    const adapter = createAdapter()

    const result = await generateSpeech({
      adapter,
      text: 'Hello, world!',
      modelOptions: {
        audio_url: REFERENCE_AUDIO,
      },
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)

    const [model, options] = mockSubscribe.mock.calls[0]!
    expect(model).toBe('fal-ai/index-tts-2/text-to-speech')
    expect(options.input).toMatchObject({
      prompt: 'Hello, world!',
      text: 'Hello, world!',
      audio_url: REFERENCE_AUDIO,
    })

    expect(result.model).toBe('fal-ai/index-tts-2/text-to-speech')
    expect(result.audio).toBeDefined()
    expect(result.format).toBe('wav')
    expect(result.contentType).toBe('audio/wav')
  })

  it('passes voice and speed options', async () => {
    mockSubscribe.mockResolvedValueOnce(
      createMockSpeechResponse('https://fal.media/files/speech.wav'),
    )

    const adapter = createAdapter()

    await generateSpeech({
      adapter,
      text: 'Test speech',
      voice: 'af_heart',
      speed: 1.5,
      modelOptions: {
        audio_url: REFERENCE_AUDIO,
      },
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      voice: 'af_heart',
      speed: 1.5,
    })
  })

  it('passes model options', async () => {
    mockSubscribe.mockResolvedValueOnce(
      createMockSpeechResponse('https://fal.media/files/speech.wav'),
    )

    const adapter = createAdapter()

    await generateSpeech({
      adapter,
      text: 'Test speech',
      modelOptions: {
        audio_url: REFERENCE_AUDIO,
        strength: 0.8,
      },
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      audio_url: REFERENCE_AUDIO,
      strength: 0.8,
    })
  })

  it('throws when audio URL not found', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {},
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    await expect(
      generateSpeech({
        adapter,
        text: 'Test',
        modelOptions: {
          audio_url: REFERENCE_AUDIO,
        },
      }),
    ).rejects.toThrow('Audio URL not found in fal TTS response')
  })

  it('handles audio_url response format', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio_url: 'https://fal.media/files/speech.mp3',
      },
      requestId: 'req-456',
    })

    const adapter = createAdapter()

    const result = await generateSpeech({
      adapter,
      text: 'Test',
      modelOptions: {
        audio_url: REFERENCE_AUDIO,
      },
    })

    expect(result.format).toBe('mp3')
    expect(mockFetch).toHaveBeenCalledWith('https://fal.media/files/speech.mp3')
  })

  it('handles large audio payloads without blowing the stack', async () => {
    // Regression: previously the adapter used
    // `btoa(String.fromCharCode(...new Uint8Array(buf)))`, which spreads each
    // byte as a function argument and throws RangeError for realistic clips.
    const largeBytes = new Uint8Array(200_000)
    for (let i = 0; i < largeBytes.length; i += 1) {
      largeBytes[i] = i % 256
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(largeBytes.buffer),
    })
    mockSubscribe.mockResolvedValueOnce(
      createMockSpeechResponse(
        'https://fal.media/files/large.wav',
        'audio/wav',
      ),
    )

    const adapter = createAdapter()

    const result = await generateSpeech({
      adapter,
      text: 'Long speech',
      modelOptions: { audio_url: REFERENCE_AUDIO },
    })

    expect(typeof result.audio).toBe('string')
    // Base64 of 200k bytes is ~266k chars; just assert it's in the right
    // ballpark rather than recomputing the exact encoding here.
    expect((result.audio as string).length).toBeGreaterThan(260_000)
  })

  it('configures client with API key', () => {
    falSpeech('fal-ai/index-tts-2/text-to-speech', { apiKey: 'my-api-key' })

    expect(mockConfig).toHaveBeenCalledWith({
      credentials: 'my-api-key',
    })
  })

  it('configures client with proxy URL and credentials when both provided', () => {
    falSpeech('fal-ai/index-tts-2/text-to-speech', {
      apiKey: 'my-api-key',
      proxyUrl: '/api/fal/proxy',
    })

    expect(mockConfig).toHaveBeenCalledWith({
      credentials: 'my-api-key',
      proxyUrl: '/api/fal/proxy',
    })
  })

  it('throws when the fetched audio response is not ok', async () => {
    mockSubscribe.mockResolvedValueOnce(
      createMockSpeechResponse('https://fal.media/files/missing.wav'),
    )
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })

    const adapter = createAdapter()

    await expect(
      generateSpeech({
        adapter,
        text: 'Test',
        modelOptions: { audio_url: REFERENCE_AUDIO },
      }),
    ).rejects.toThrow(/403 Forbidden/)
  })

  it('strips parameters from content type when deriving format', async () => {
    mockFetch.mockResolvedValueOnce({
      ...mockFetchResponse,
      ok: true,
    })
    mockSubscribe.mockResolvedValueOnce(
      createMockSpeechResponse(
        'https://fal.media/files/speech.mp3',
        'audio/mpeg; codecs=mp3',
      ),
    )

    const adapter = createAdapter()

    const result = await generateSpeech({
      adapter,
      text: 'Test',
      modelOptions: { audio_url: REFERENCE_AUDIO },
    })

    // URL-derived extension wins when available; the mpeg subtype is
    // separately normalized to mp3 so format is always a usable extension.
    expect(result.format).toBe('mp3')
    // contentType retains the (stripped) source mime — no normalization there.
    expect(result.contentType).toBe('audio/mpeg')
  })

  it('ignores non-extension URL path fragments when deriving format', async () => {
    mockFetch.mockResolvedValueOnce({
      ...mockFetchResponse,
      ok: true,
    })
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio_url: 'https://fal.media/files/no-ext-path',
      },
      requestId: 'req-no-ext',
    })

    const adapter = createAdapter()

    const result = await generateSpeech({
      adapter,
      text: 'Test',
      modelOptions: { audio_url: REFERENCE_AUDIO },
    })

    // URL has no extension and no content-type — default to wav.
    expect(result.format).toBe('wav')
  })
})
