import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createCartesiaSpeech, createCartesiaTranscription } from '../src/index'
import {
  CartesiaClient,
  getCartesiaApiKeyFromEnv,
  toAudioFile,
} from '../src/client'

const logger = resolveDebugOption(false)

afterEach(() => vi.unstubAllGlobals())

describe('Cartesia adapters', () => {
  it('sends Sonic speech options and returns audio', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'x-request-id': 'speech-1' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await createCartesiaSpeech(
      'sonic-3.6',
      'test-key',
    ).generateSpeech({
      model: 'sonic-3.6',
      text: 'hello',
      voice: 'voice-1',
      speed: 1.2,
      modelOptions: { language: 'en', volume: 0.8 },
      logger,
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.cartesia.ai/tts/bytes')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer test-key')
    expect(headers.get('cartesia-version')).toBe('2026-08-14')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model_id: 'sonic-3.6',
      transcript: 'hello',
      voice: 'voice-1',
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
      language: 'en',
      generation_config: { speed: 1.2, volume: 0.8 },
    })
    expect(result).toMatchObject({
      id: 'speech-1',
      audio: 'AQID',
      format: 'mp3',
    })
  })

  it.each([
    ['wav', 'wav'],
    ['pcm', 'raw'],
  ] as const)('sends %s output options', async (format, container) => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Uint8Array([1, 2, 3])),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await createCartesiaSpeech(
      'sonic-3.6',
      'test-key',
    ).generateSpeech({
      model: 'sonic-3.6',
      text: 'hello',
      voice: 'voice-1',
      format,
      logger,
    })
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).output_format,
    ).toEqual({
      container,
      encoding: 'pcm_s16le',
      sample_rate: 44100,
    })
    expect(result).toMatchObject({
      format,
      audio: 'AQID',
      contentType: `audio/${format}`,
    })
  })

  it('uses the required headers for JSON and multipart requests', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new CartesiaClient({
      apiKey: 'key',
      defaultHeaders: {
        authorization: 'wrong',
        'content-type': 'wrong',
        'cartesia-version': 'wrong',
        'x-test-id': 'test',
      },
    })
    await client.post('/tts/bytes', '{}')
    await client.post('/stt', new FormData())
    const jsonHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    const formHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
    expect(jsonHeaders.get('authorization')).toBe('Bearer key')
    expect(jsonHeaders.get('content-type')).toBe('application/json')
    expect(jsonHeaders.get('cartesia-version')).toBe('2026-08-14')
    expect(formHeaders.get('authorization')).toBe('Bearer key')
    expect(formHeaders.has('content-type')).toBe(false)
    expect(formHeaders.get('x-test-id')).toBe('test')
  })

  it('reports a missing key when process is unavailable', () => {
    vi.stubGlobal('process', undefined)
    expect(() => getCartesiaApiKeyFromEnv()).toThrow(
      'CARTESIA_API_KEY is required',
    )
  })

  it('decodes data URLs with MIME parameters and plain base64', async () => {
    const file = toAudioFile('data:audio/wav;codec=pcm;rate=24000;base64,AQID')
    expect(file.type).toBe('audio/wav')
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3])
    const fallback = toAudioFile('AQID')
    expect(fallback.type).toBe('audio/mpeg')
    expect([...new Uint8Array(await fallback.arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('sends Ink Whisper audio and maps word timings', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          text: 'hello',
          request_id: 'stt-1',
          language: 'en',
          duration: 1.5,
          words: [{ word: 'hello', start: 0, end: 1.5 }],
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await createCartesiaTranscription(
      'ink-whisper',
      'test-key',
    ).transcribe({
      model: 'ink-whisper',
      audio: new File([new Uint8Array([1, 2])], 'voice.wav', {
        type: 'audio/wav',
      }),
      responseFormat: 'verbose_json',
      language: 'en',
      logger,
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.cartesia.ai/stt')
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('model')).toBe('ink-whisper')
    expect(form.get('language')).toBe('en')
    expect(form.get('timestamp_granularities[]')).toBe('word')
    expect(result).toMatchObject({ id: 'stt-1', text: 'hello', duration: 1.5 })
    expect(result.words).toEqual([{ word: 'hello', start: 0, end: 1.5 }])
  })
})
