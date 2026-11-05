import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createCartesiaSpeech, createCartesiaTranscription } from '../src/index'

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
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Cartesia-Version': '2026-08-14',
    })
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
