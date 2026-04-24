import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSpeech, generateTranscription } from '@tanstack/ai'
import { GrokSpeechAdapter } from '../src/adapters/tts'
import { GrokTranscriptionAdapter } from '../src/adapters/transcription'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('GrokSpeechAdapter', () => {
  const audioBytes = new Uint8Array([1, 2, 3, 4, 5])

  function mockTTSResponse() {
    return {
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
      text: () => Promise.resolve(''),
    } as Partial<Response> as Response
  }

  it('posts to {baseURL}/tts with defaults and returns base64 audio', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter(
      { apiKey: 'xai-test', baseURL: 'https://example.test/v1' },
      'grok-tts',
    )

    const result = await generateSpeech({
      adapter,
      text: 'hello world',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://example.test/v1/tts')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer xai-test',
    )
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )

    const body = JSON.parse(init!.body as string)
    expect(body.text).toBe('hello world')
    expect(body.voice_id).toBe('eve')
    expect(body.language).toBe('en')
    expect(body.output_format).toEqual({ codec: 'mp3' })

    expect(result.model).toBe('grok-tts')
    expect(result.format).toBe('mp3')
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.audio).toBe(Buffer.from(audioBytes).toString('base64'))
    expect(result.id).toMatch(/^grok-/)
  })

  it('maps unsupported TTSOptions formats (opus, aac, flac) to mp3', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    await generateSpeech({
      adapter,
      text: 'x',
      format: 'opus',
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.output_format.codec).toBe('mp3')
  })

  it('honours modelOptions.codec over options.format and passes sample_rate/bit_rate', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    await generateSpeech({
      adapter,
      text: 'x',
      format: 'wav',
      voice: 'rex',
      modelOptions: {
        codec: 'mp3',
        sample_rate: 48000,
        bit_rate: 192000,
        language: 'pt-BR',
        text_normalization: true,
        optimize_streaming_latency: 1,
      },
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.voice_id).toBe('rex')
    expect(body.language).toBe('pt-BR')
    expect(body.output_format).toEqual({
      codec: 'mp3',
      sample_rate: 48000,
      bit_rate: 192000,
    })
    expect(body.text_normalization).toBe(true)
    expect(body.optimize_streaming_latency).toBe(1)
  })

  it('omits bit_rate for non-mp3 codecs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    await generateSpeech({
      adapter,
      text: 'x',
      modelOptions: {
        codec: 'wav',
        sample_rate: 24000,
        bit_rate: 128000,
      },
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.output_format.bit_rate).toBeUndefined()
  })

  it('throws a descriptive error when the request fails', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('upstream boom'),
    } as Partial<Response> as Response) as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    await expect(generateSpeech({ adapter, text: 'x' })).rejects.toThrow(
      'Grok TTS request failed: 500 upstream boom',
    )
  })
})

describe('GrokTranscriptionAdapter', () => {
  function mockSTTResponse(body: unknown) {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(''),
    } as Partial<Response> as Response
  }

  it('posts multipart/form-data to {baseURL}/stt and maps the response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockSTTResponse({
        text: 'hello world',
        language: 'en',
        duration: 1.23,
        words: [
          { text: 'hello', start: 0, end: 0.5, confidence: 0.9 },
          { text: 'world', start: 0.5, end: 1.0, confidence: 0.85 },
        ],
      }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokTranscriptionAdapter(
      { apiKey: 'xai-test', baseURL: 'https://example.test/v1' },
      'grok-stt',
    )

    const audioBlob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'audio/mpeg',
    })
    const result = await generateTranscription({
      adapter,
      audio: audioBlob,
      language: 'en',
      modelOptions: { diarize: true, multichannel: false },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://example.test/v1/stt')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer xai-test',
    )
    // FormData sets Content-Type automatically; ensure we didn't hardcode it
    expect(
      (init?.headers as Record<string, string>)['Content-Type'],
    ).toBeUndefined()

    const form = init!.body as FormData
    expect(form.get('language')).toBe('en')
    expect(form.get('diarize')).toBe('true')
    expect(form.get('multichannel')).toBe('false')
    expect(form.get('file')).toBeInstanceOf(File)

    expect(result.model).toBe('grok-stt')
    expect(result.text).toBe('hello world')
    expect(result.language).toBe('en')
    expect(result.duration).toBe(1.23)
    expect(result.words).toEqual([
      { word: 'hello', start: 0, end: 0.5 },
      { word: 'world', start: 0.5, end: 1.0 },
    ])
  })

  it('handles responses with no words array', async () => {
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        mockSTTResponse({ text: 'ok', language: 'en' }),
      ) as unknown as typeof fetch

    const adapter = new GrokTranscriptionAdapter(
      { apiKey: 'xai-test' },
      'grok-stt',
    )

    const result = await generateTranscription({
      adapter,
      audio: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
    })

    expect(result.text).toBe('ok')
    expect(result.words).toBeUndefined()
  })

  it('throws when the transcription request fails', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad audio'),
    } as Partial<Response> as Response) as unknown as typeof fetch

    const adapter = new GrokTranscriptionAdapter(
      { apiKey: 'xai-test' },
      'grok-stt',
    )

    await expect(
      generateTranscription({
        adapter,
        audio: new Blob([new Uint8Array([1])]),
      }),
    ).rejects.toThrow('Grok transcription request failed: 400 bad audio')
  })
})
