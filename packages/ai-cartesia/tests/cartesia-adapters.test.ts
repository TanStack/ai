import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createCartesiaSpeech, createCartesiaTranscription } from '../src/index'
import { getCartesiaApiKeyFromEnv, toAudioFile } from '../src/client'

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

    const result = await createCartesiaSpeech('sonic-3.6', 'test-key', {
      fetch: fetchMock,
    }).generateSpeech({
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
    const result = await createCartesiaSpeech('sonic-3.6', 'test-key', {
      fetch: fetchMock,
    }).generateSpeech({
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

  it('reports a missing key when process is unavailable', () => {
    vi.stubGlobal('process', undefined)
    expect(() => getCartesiaApiKeyFromEnv()).toThrow(
      'CARTESIA_API_KEY is required',
    )
  })

  it('decodes data URLs with MIME parameters and plain base64', async () => {
    const file = toAudioFile('data:audio/wav;codec=pcm;rate=24000;base64,AQID')
    expect(file.type).toBe('audio/wav')
    expect(file.name).toBe('audio.wav')
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3])
    const fallback = toAudioFile('AQID')
    expect(fallback.type).toBe('audio/mpeg')
    expect(fallback.name).toBe('audio.mp3')
    expect(
      toAudioFile(new Blob(['a'], { type: 'audio/webm;codecs=opus' })).name,
    ).toBe('audio.webm')
    expect(toAudioFile(new Blob(['a'], { type: 'audio/x-wav' })).name).toBe(
      'audio.wav',
    )
    expect([...new Uint8Array(await fallback.arrayBuffer())]).toEqual([1, 2, 3])
    expect(() => toAudioFile('data:audio/wav,abc')).toThrow(
      'Cartesia transcription needs a base64 data URL',
    )
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

    const result = await createCartesiaTranscription(
      'ink-whisper',
      'test-key',
      {
        fetch: fetchMock,
      },
    ).transcribe({
      model: 'ink-whisper',
      audio: new File([new Uint8Array([1, 2])], 'voice.wav', {
        type: 'audio/wav',
      }),
      responseFormat: 'verbose_json',
      language: 'en',
      logger,
    })

    // The SDK first calls a custom fetch with 'data:,' to find its Response
    // class. The upload is the last call.
    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(url).toBe('https://api.cartesia.ai/stt')
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('model')).toBe('ink-whisper')
    expect(form.get('language')).toBe('en')
    expect(form.get('timestamp_granularities[]')).toBe('word')
    expect(result).toMatchObject({ id: 'stt-1', text: 'hello', duration: 1.5 })
    expect(result.words).toEqual([{ word: 'hello', start: 0, end: 1.5 }])
  })

  it('throws the Cartesia status and body on a non-OK response', async () => {
    await expect(
      createCartesiaSpeech('sonic-3.6', 'test-key', {
        fetch: async () => new Response('nope', { status: 400 }),
      }).generateSpeech({
        model: 'sonic-3.6',
        text: 'hello',
        voice: 'voice-1',
        logger,
      }),
    ).rejects.toThrow('400 nope')
  })

  it('rejects speed and volume outside the Cartesia range before fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1])))
    const speech = createCartesiaSpeech('sonic-3.6', 'test-key', {
      fetch: fetchMock,
    })
    await expect(
      speech.generateSpeech({
        model: 'sonic-3.6',
        text: 'hello',
        voice: 'voice-1',
        speed: 0.5,
        logger,
      }),
    ).rejects.toThrow('Cartesia speech speed must be from 0.6 to 1.5')
    await expect(
      speech.generateSpeech({
        model: 'sonic-3.6',
        text: 'hello',
        voice: 'voice-1',
        modelOptions: { volume: 3 },
        logger,
      }),
    ).rejects.toThrow('Cartesia speech volume must be from 0.5 to 2')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects empty speech audio', async () => {
    await expect(
      createCartesiaSpeech('sonic-3.6', 'test-key', {
        fetch: async () => new Response(new Uint8Array()),
      }).generateSpeech({
        model: 'sonic-3.6',
        text: 'hello',
        voice: 'voice-1',
        logger,
      }),
    ).rejects.toThrow('Cartesia speech returned empty audio')
  })

  it('rejects a transcript response with no text', async () => {
    await expect(
      createCartesiaTranscription('ink-whisper', 'test-key', {
        fetch: async () => Response.json({ type: 'transcript' }),
      }).transcribe({
        model: 'ink-whisper',
        audio: new File([new Uint8Array([1])], 'a.mp3', { type: 'audio/mpeg' }),
        logger,
      }),
    ).rejects.toThrow('Cartesia transcription response has no text')
  })
})
