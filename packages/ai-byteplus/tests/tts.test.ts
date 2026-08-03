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

    // `text_prompt` (not `text`) and the voice inside `references` are both
    // load-bearing: a top-level `speaker` is silently ignored by the server,
    // and `text` belongs to the /tts/unidirectional endpoint.
    expect(body).toEqual({
      model: 'seed-audio-1.0',
      text_prompt: 'welcome to the guitar store',
      references: [{ speaker: 'en_female_stokie_uranus_bigtts' }],
      audio_config: { format: 'mp3', sample_rate: 24000 },
    })
    expect(body.speaker).toBeUndefined()

    expect(result.model).toBe('seed-audio-1.0')
    expect(result.audio).toBe('QUJD')
    expect(result.format).toBe('mp3')
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.duration).toBe(1.5)
    expect(result.id).toMatch(/^byteplus-/)
  })

  it('sends a per-request X-Api-Request-Id', async () => {
    const fetchMock = ttsFetch()
    await generateSpeech({ adapter: adapterWith(fetchMock), text: 'hi' })
    const first = lastRequest(fetchMock).headers.get('x-api-request-id')
    expect(first).toBeTruthy()

    await generateSpeech({ adapter: adapterWith(fetchMock), text: 'hi' })
    expect(lastRequest(fetchMock).headers.get('x-api-request-id')).not.toBe(
      first,
    )
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
    expect(lastRequest(fetchMock).body.references).toEqual([
      { speaker: 'test-voice-from-options' },
    ])

    await generateSpeech({
      adapter: adapterWith(fetchMock),
      text: 'hi',
      voice: 'test-voice-from-options',
      modelOptions: { speaker: 'test-voice-from-model-options' },
    })
    expect(lastRequest(fetchMock).body.references).toEqual([
      { speaker: 'test-voice-from-model-options' },
    ])
  })

  it('lets an explicit references array replace the speaker entry', async () => {
    const fetchMock = ttsFetch()
    await generateSpeech({
      adapter: adapterWith(fetchMock),
      text: 'say it like @Audio1',
      voice: 'test-voice-from-options',
      modelOptions: {
        references: [{ audio_url: 'https://example.com/clip.wav' }],
      },
    })
    expect(lastRequest(fetchMock).body.references).toEqual([
      { audio_url: 'https://example.com/clip.wav' },
    ])
  })

  it('forwards watermark when set', async () => {
    const fetchMock = ttsFetch()
    await generateSpeech({
      adapter: adapterWith(fetchMock),
      text: 'hi',
      modelOptions: { watermark: true },
    })
    expect(lastRequest(fetchMock).body.watermark).toBe(true)
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

    it('always sends an explicit sample_rate rather than trusting the server default', async () => {
      // The documented default (40000) is not a value the endpoint accepts,
      // so omitting the field is never safe.
      const fetchMock = ttsFetch()
      await generateSpeech({ adapter: adapterWith(fetchMock), text: 'hi' })
      expect(lastRequest(fetchMock).body.audio_config.sample_rate).toBe(24000)
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

  it('forwards pitch, loudness and subtitle options inside audio_config', async () => {
    const subtitle = {
      sentences: [{ text: 'hi', start_time: 0, end_time: 200 }],
      words: [{ text: 'hi', start_time: 0, end_time: 200 }],
    }
    const fetchMock = ttsFetch({
      audio: 'QUJD',
      duration: 2,
      original_duration: 2,
      url: 'https://voice.test/out.mp3',
      subtitle,
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
    // enable_subtitle is the sixth member of audio_config, not a top-level
    // field — at the top level the server ignores it.
    expect(body.audio_config.enable_subtitle).toBe(true)
    expect(body.enable_subtitle).toBeUndefined()

    // Subtitle timings stay in milliseconds while the durations are seconds.
    expect(result.subtitle).toEqual(subtitle)
    expect(result.url).toBe('https://voice.test/out.mp3')
  })

  describe('durations', () => {
    it('reports duration and original_duration as seconds', async () => {
      const fetchMock = ttsFetch({
        audio: 'QUJD',
        duration: 12.5,
        original_duration: 10,
      })
      const result: BytePlusTTSResult = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
      })
      expect(result.duration).toBe(12.5)
      expect(result.originalDuration).toBe(10)
    })

    it('passes a slowed clip longer than the 120s cap straight through', async () => {
      // A 120s (billed) clip at speech_rate -50 plays for 240s. Rescaling it
      // as if it were milliseconds — which an earlier heuristic did — would
      // corrupt it to 0.24s.
      const fetchMock = ttsFetch({
        audio: 'QUJD',
        duration: BYTEPLUS_TTS_MAX_OUTPUT_SECONDS * 2,
        original_duration: BYTEPLUS_TTS_MAX_OUTPUT_SECONDS,
      })
      const result: BytePlusTTSResult = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
        speed: 0.5,
      })
      expect(result.duration).toBe(240)
      expect(result.originalDuration).toBe(BYTEPLUS_TTS_MAX_OUTPUT_SECONDS)
    })

    it.each([
      [12.5, 12.5],
      [BYTEPLUS_TTS_MAX_OUTPUT_SECONDS + 1, 121],
      [0, undefined],
      [-5, undefined],
      [Number.NaN, undefined],
      [undefined, undefined],
    ])('toDurationSeconds(%s) is %s', (raw, expected) => {
      expect(toDurationSeconds(raw)).toBe(expected)
    })

    it('coerces string durations and drops unusable ones', async () => {
      const stringDuration = ttsFetch({ audio: 'QUJD', duration: '3.2' })
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

    it('rejects a 200 carrying a non-zero code even when audio is present', async () => {
      const fetchMock = ttsFetch({
        code: 45000010,
        message: 'Invalid X-Api-Key',
        audio: 'QUJD',
        duration: 1.5,
      })
      await expect(
        generateSpeech({
          adapter: adapterWith(fetchMock),
          text: 'hi',
          debug: false,
        }),
      ).rejects.toThrow(
        'BytePlus Seed Speech text-to-speech failed (200 45000010): Invalid X-Api-Key',
      )
    })

    it('accepts a 200 that reports code 0', async () => {
      const fetchMock = ttsFetch({ code: 0, audio: 'QUJD', duration: 1.5 })
      const result = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
      })
      expect(result.audio).toBe('QUJD')
    })

    // Only the *error* envelope was verified live; the success envelope is
    // docs-derived. A string-typed code must not slip through as success —
    // `readStringField` already renders both forms in the error message, so
    // requiring a number here would have returned a failed 200 as valid audio.
    it('rejects a 200 whose non-zero code arrives as a string', async () => {
      const fetchMock = ttsFetch({
        code: '45000010',
        message: 'Invalid X-Api-Key',
        audio: 'QUJD',
        duration: 1.5,
      })
      await expect(
        generateSpeech({
          adapter: adapterWith(fetchMock),
          text: 'hi',
          debug: false,
        }),
      ).rejects.toThrow(/45000010/)
    })

    it('accepts a 200 whose success code arrives as the string "0"', async () => {
      const fetchMock = ttsFetch({ code: '0', audio: 'QUJD', duration: 1.5 })
      const result = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
      })
      expect(result.audio).toBe('QUJD')
    })

    it('accepts a 200 that omits code entirely', async () => {
      const fetchMock = ttsFetch({ audio: 'QUJD', duration: 1.5 })
      const result = await generateSpeech({
        adapter: adapterWith(fetchMock),
        text: 'hi',
      })
      expect(result.audio).toBe('QUJD')
    })

    // An empty string is a *well-formed* success envelope carrying nothing to
    // play, so it needs its own message — reusing the envelope-error phrasing
    // ("failed (200)") gives no hint that the adapter is the one rejecting it.
    it('rejects a success envelope whose audio is an empty string', async () => {
      const fetchMock = ttsFetch({ code: 0, audio: '', duration: 1.5 })
      await expect(
        generateSpeech({
          adapter: adapterWith(fetchMock),
          text: 'hi',
          debug: false,
        }),
      ).rejects.toThrow(/success response with no audio/)
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
