import { describe, expect, it, vi } from 'vitest'
import { generateSpeech } from '@tanstack/ai'
import {
  BYTEPLUS_TTS_MAX_OUTPUT_SECONDS,
  BytePlusTTSAdapter,
  createBytePlusSpeech,
  toDurationSeconds,
  toSpeechRate,
} from '../src/adapters/tts'
import type { Logger } from '@tanstack/ai'
import type { BytePlusTTSResult } from '../src/audio/tts-provider-options'

const BASE_URL = 'https://voice.test'

/**
 * Captures what the adapter routes through `logger.warn`. Passed as
 * `debug: { logger }`, which turns every category on — including the `errors`
 * category that gates `warn`.
 */
function captureLogger(): Logger & { warnings: Array<string> } {
  const warnings: Array<string> = []
  return {
    warnings,
    debug: () => {},
    info: () => {},
    warn: (message: string) => {
      warnings.push(message)
    },
    error: () => {},
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// A fresh `Response` per call — a `Response` body can only be read once, so a
// shared instance breaks any test that fetches twice.
function ttsFetch(
  body: unknown = { audio: 'QUJD', duration: 1.5 },
  status = 200,
) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(() => Promise.resolve(jsonResponse(body, status)))
}

function adapterWith(
  fetchImpl: typeof fetch,
  defaultHeaders?: Record<string, string>,
) {
  return new BytePlusTTSAdapter('seed-audio-1.0', {
    apiKey: 'voice-key',
    baseURL: BASE_URL,
    fetch: fetchImpl,
    ...(defaultHeaders && { defaultHeaders }),
  })
}

function lastRequest(fetchMock: ReturnType<typeof ttsFetch>) {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  const [url, init] = call
  return {
    url: String(url),
    init: init as RequestInit,
    headers: new Headers(init?.headers),
    body: JSON.parse(String(init?.body)),
  }
}

describe('BytePlusTTSAdapter', () => {
  it('posts to /api/v3/tts/create with the Seed Speech key and default speaker', async () => {
    const fetchMock = ttsFetch()
    const result: BytePlusTTSResult = await generateSpeech({
      adapter: adapterWith(fetchMock),
      text: 'welcome to the guitar store',
    })

    const { url, init, headers, body } = lastRequest(fetchMock)
    expect(url).toBe(`${BASE_URL}/api/v3/tts/create`)
    expect(init.method).toBe('POST')
    expect(headers.get('x-api-key')).toBe('voice-key')
    expect(headers.get('content-type')).toBe('application/json')
    // Seed Speech uses X-Api-Key, never an Ark-style bearer token.
    expect(headers.get('authorization')).toBeNull()

    expect(body).toEqual({
      model: 'seed-audio-1.0',
      text_prompt: 'welcome to the guitar store',
      speaker: 'en_female_stokie_uranus_bigtts',
      audio_config: { format: 'mp3' },
    })

    expect(result.model).toBe('seed-audio-1.0')
    expect(result.audio).toBe('QUJD')
    expect(result.format).toBe('mp3')
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.duration).toBe(1.5)
    expect(result.id).toMatch(/^byteplus-/)
  })

  it('sends TTSOptions.voice as speaker and lets modelOptions.speaker win', async () => {
    // Deliberately synthetic ids — the adapter passes `speaker` through
    // verbatim, and inventing plausible-looking BytePlus voice ids in a test
    // is how they end up copied into docs as if they were real.
    const fetchMock = ttsFetch()
    await generateSpeech({
      adapter: adapterWith(fetchMock),
      text: 'hi',
      voice: 'test-voice-from-options',
    })
    expect(lastRequest(fetchMock).body.speaker).toBe('test-voice-from-options')

    await generateSpeech({
      adapter: adapterWith(fetchMock),
      text: 'hi',
      voice: 'test-voice-from-options',
      modelOptions: { speaker: 'test-voice-from-model-options' },
    })
    expect(lastRequest(fetchMock).body.speaker).toBe(
      'test-voice-from-model-options',
    )
  })

  describe('format mapping', () => {
    it.each([
      ['mp3', 'mp3', 'audio/mpeg'],
      ['wav', 'wav', 'audio/wav'],
      ['pcm', 'pcm', 'audio/L16;rate=24000'],
      ['opus', 'ogg_opus', 'audio/ogg;codecs=opus'],
    ] as const)('maps %s to %s', async (requested, wireFormat, contentType) => {
      const fetchMock = ttsFetch()
      const result = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
        format: requested,
      })
      expect(lastRequest(fetchMock).body.audio_config.format).toBe(wireFormat)
      expect(result.format).toBe(wireFormat)
      expect(result.contentType).toBe(contentType)
    })

    it.each(['aac', 'flac'] as const)(
      'falls back to mp3 for unsupported format %s and warns',
      async (requested) => {
        const fetchMock = ttsFetch()
        const logger = captureLogger()
        const result = await generateSpeech({
          adapter: adapterWith(fetchMock),
          text: 'hi',
          format: requested,
          debug: { logger },
        })
        expect(lastRequest(fetchMock).body.audio_config.format).toBe('mp3')
        expect(result.format).toBe('mp3')
        expect(
          logger.warnings.some(
            (w) => w.includes(requested) && w.includes('falling back to mp3'),
          ),
        ).toBe(true)
      },
    )

    it('lets modelOptions.format override the generic format', async () => {
      const fetchMock = ttsFetch()
      await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
        format: 'mp3',
        modelOptions: { format: 'ogg_opus' },
      })
      expect(lastRequest(fetchMock).body.audio_config.format).toBe('ogg_opus')
    })

    it('reports the caller sample rate in the pcm content type', async () => {
      const fetchMock = ttsFetch()
      const result = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
        format: 'pcm',
        modelOptions: { sample_rate: 48000 },
      })
      expect(lastRequest(fetchMock).body.audio_config.sample_rate).toBe(48000)
      expect(result.contentType).toBe('audio/L16;rate=48000')
    })
  })

  describe('speed → speech_rate', () => {
    it.each([
      [0.25, -50],
      [0.5, -50],
      [0.75, -25],
      [1, 0],
      [1.5, 50],
      [2, 100],
      [4, 100],
    ])('maps speed %s to speech_rate %s', (speed, expected) => {
      expect(toSpeechRate(speed)).toBe(expected)
    })

    it('forwards the derived speech_rate on the request', async () => {
      const fetchMock = ttsFetch()
      await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
        speed: 1.25,
      })
      expect(lastRequest(fetchMock).body.audio_config.speech_rate).toBe(25)
    })

    it('omits speech_rate when no speed is given', async () => {
      const fetchMock = ttsFetch()
      await generateSpeech({ adapter: adapterWith(fetchMock), text: 'hi' })
      expect(
        lastRequest(fetchMock).body.audio_config.speech_rate,
      ).toBeUndefined()
    })

    it('warns when the speed clamps outside the documented 0.5×–2× range', async () => {
      const logger = captureLogger()
      await generateSpeech({
        adapter: adapterWith(ttsFetch()),
        text: 'hi',
        speed: 4,
        debug: { logger },
      })
      expect(
        logger.warnings.some(
          (w) => w.includes('4×') && w.includes('clamping speech_rate'),
        ),
      ).toBe(true)
    })

    it('does not warn for a speed inside the documented range', async () => {
      const logger = captureLogger()
      await generateSpeech({
        adapter: adapterWith(ttsFetch()),
        text: 'hi',
        speed: 1.5,
        debug: { logger },
      })
      expect(logger.warnings).toHaveLength(0)
    })

    it('lets an explicit modelOptions.speech_rate win over speed', async () => {
      const fetchMock = ttsFetch()
      await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
        speed: 2,
        modelOptions: { speech_rate: -10 },
      })
      expect(lastRequest(fetchMock).body.audio_config.speech_rate).toBe(-10)
    })
  })

  it('forwards pitch, loudness and subtitle options', async () => {
    const fetchMock = ttsFetch({
      audio: 'QUJD',
      duration: 2,
      url: 'https://voice.test/out.mp3',
      subtitle: [{ text: 'hi', start_time: 0, end_time: 200 }],
    })
    const result: BytePlusTTSResult = await generateSpeech({
      adapter: adapterWith(fetchMock),
      text: 'hi',
      modelOptions: {
        pitch_rate: -3,
        loudness_rate: 20,
        enable_subtitle: true,
      },
    })

    const { body } = lastRequest(fetchMock)
    expect(body.audio_config.pitch_rate).toBe(-3)
    expect(body.audio_config.loudness_rate).toBe(20)
    expect(body.enable_subtitle).toBe(true)

    expect(result.subtitle).toEqual([
      { text: 'hi', start_time: 0, end_time: 200 },
    ])
    expect(result.url).toBe('https://voice.test/out.mp3')
  })

  describe('duration normalisation', () => {
    it('passes through values within the 120s output cap as seconds', async () => {
      const fetchMock = ttsFetch({ audio: 'QUJD', duration: 12 })
      const result = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
      })
      expect(result.duration).toBe(12)
    })

    it('treats values above the cap as milliseconds', async () => {
      const fetchMock = ttsFetch({
        audio: 'QUJD',
        duration: BYTEPLUS_TTS_MAX_OUTPUT_SECONDS * 1000,
      })
      const result = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
      })
      expect(result.duration).toBe(BYTEPLUS_TTS_MAX_OUTPUT_SECONDS)
    })

    it.each([
      [BYTEPLUS_TTS_MAX_OUTPUT_SECONDS, BYTEPLUS_TTS_MAX_OUTPUT_SECONDS],
      // Just over the cap flips to the millisecond reading, by design.
      [BYTEPLUS_TTS_MAX_OUTPUT_SECONDS + 1, 0.121],
      [0, undefined],
      [-5, undefined],
      [Number.NaN, undefined],
      [undefined, undefined],
    ])('toDurationSeconds(%s) is %s', (raw, expected) => {
      expect(toDurationSeconds(raw)).toBe(expected)
    })

    it('warns when the millisecond branch fires', async () => {
      const logger = captureLogger()
      await generateSpeech({
        adapter: adapterWith(ttsFetch({ audio: 'QUJD', duration: 3200 })),
        text: 'hi',
        debug: { logger },
      })
      expect(
        logger.warnings.some(
          (w) =>
            w.includes('duration=3200') &&
            w.includes('reading it as milliseconds'),
        ),
      ).toBe(true)
    })

    it('coerces string durations and drops unusable ones', async () => {
      const stringDuration = ttsFetch({ audio: 'QUJD', duration: '3200' })
      expect(
        (
          await generateSpeech({
            adapter: adapterWith(stringDuration),
            text: 'hi',
          })
        ).duration,
      ).toBe(3.2)

      const missing = ttsFetch({ audio: 'QUJD' })
      expect(
        (await generateSpeech({ adapter: adapterWith(missing), text: 'hi' }))
          .duration,
      ).toBeUndefined()
    })
  })

  describe('errors', () => {
    it('surfaces the numeric Seed Speech error envelope on a 401', async () => {
      const fetchMock = ttsFetch(
        { code: 45000010, message: 'Invalid X-Api-Key' },
        401,
      )
      await expect(
        generateSpeech({
          adapter: adapterWith(fetchMock),
          text: 'hi',
          debug: false,
        }),
      ).rejects.toThrow(
        'BytePlus Seed Speech text-to-speech failed (401 45000010): Invalid X-Api-Key',
      )
    })

    it('fails when a 200 response carries no audio', async () => {
      const fetchMock = ttsFetch({ code: 45000151, message: 'Quota exceeded' })
      await expect(
        generateSpeech({
          adapter: adapterWith(fetchMock),
          text: 'hi',
          debug: false,
        }),
      ).rejects.toThrow(
        'BytePlus Seed Speech text-to-speech failed (200 45000151): Quota exceeded',
      )
    })

    it('keeps non-JSON error bodies diagnosable', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('<html>502</html>', { status: 502 }))
      await expect(
        generateSpeech({
          adapter: adapterWith(fetchMock),
          text: 'hi',
          debug: false,
        }),
      ).rejects.toThrow('<html>502</html>')
    })
  })

  it('merges configured default headers into the request', async () => {
    const fetchMock = ttsFetch()
    await generateSpeech({
      adapter: adapterWith(fetchMock, { 'X-Test-Id': 'abc' }),
      text: 'hi',
    })
    expect(lastRequest(fetchMock).headers.get('x-test-id')).toBe('abc')
  })

  it('createBytePlusSpeech wires the explicit key through', async () => {
    const fetchMock = ttsFetch()
    const adapter = createBytePlusSpeech('seed-audio-1.0', 'explicit-key', {
      baseURL: BASE_URL,
      fetch: fetchMock,
    })
    await generateSpeech({ adapter, text: 'hi' })
    expect(lastRequest(fetchMock).headers.get('x-api-key')).toBe('explicit-key')
  })
})
