import { describe, expect, it, vi } from 'vitest'
import { generateTranscription } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  BytePlusTranscriptionAdapter,
  createBytePlusTranscription,
  mapRecognizeResponse,
  normalizeAudioInput,
} from '../src/adapters/transcription'
import type { Logger } from '@tanstack/ai'
import type { BytePlusTranscriptionWord } from '../src/adapters/transcription'

const BASE_URL = 'https://voice.test'

/** Captures what the adapter routes through `logger.warn`. */
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

const RECOGNIZE_RESPONSE = {
  audio_info: { duration: 2499 },
  result: {
    text: 'a guitar being played in a store',
    utterances: [
      {
        text: 'a guitar being played',
        start_time: 450,
        end_time: 1530,
        words: [
          { text: 'a', start_time: 450, end_time: 600 },
          { text: 'guitar', start_time: 600, end_time: 1100 },
        ],
      },
      {
        text: 'in a store',
        start_time: 1530,
        end_time: 2400,
        additions: { speaker: '2' },
      },
    ],
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// A fresh `Response` per call — a `Response` body can only be read once, so a
// shared instance breaks any test that fetches twice.
function asrFetch(body: unknown = RECOGNIZE_RESPONSE, status = 200) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(() => Promise.resolve(jsonResponse(body, status)))
}

function adapterWith(
  fetchImpl: typeof fetch,
  defaultHeaders?: Record<string, string>,
) {
  return new BytePlusTranscriptionAdapter('seed-asr', {
    apiKey: 'voice-key',
    baseURL: BASE_URL,
    fetch: fetchImpl,
    ...(defaultHeaders && { defaultHeaders }),
  })
}

function lastRequest(fetchMock: ReturnType<typeof asrFetch>) {
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

describe('BytePlusTranscriptionAdapter', () => {
  it('posts to the flash endpoint with the ASR resource header', async () => {
    const fetchMock = asrFetch()
    await generateTranscription({
      adapter: adapterWith(fetchMock),
      audio: 'https://example.com/guitar.mp3',
    })

    const { url, init, headers, body } = lastRequest(fetchMock)
    expect(url).toBe(`${BASE_URL}/api/v3/auc/bigmodel/recognize/flash`)
    expect(init.method).toBe('POST')
    expect(headers.get('x-api-key')).toBe('voice-key')
    expect(headers.get('x-api-resource-id')).toBe('volc.seedasr.auc_turbo')

    expect(body).toEqual({
      user: { uid: 'tanstack-ai' },
      audio: { url: 'https://example.com/guitar.mp3', format: 'mp3' },
      request: { model_name: 'bigmodel', show_utterances: true },
    })
  })

  it('maps transcript, segments, words and duration into seconds', async () => {
    const result = await generateTranscription({
      adapter: adapterWith(asrFetch()),
      audio: 'https://example.com/guitar.mp3',
      language: 'en-US',
    })

    expect(result.text).toBe('a guitar being played in a store')
    expect(result.language).toBe('en-US')
    expect(result.duration).toBe(2.499)
    expect(result.segments).toEqual([
      { id: 0, start: 0.45, end: 1.53, text: 'a guitar being played' },
      { id: 1, start: 1.53, end: 2.4, text: 'in a store', speaker: '2' },
    ])
    expect(result.words).toEqual([
      { word: 'a', start: 0.45, end: 0.6 },
      { word: 'guitar', start: 0.6, end: 1.1 },
    ])
    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationSeconds: 2.499,
    })
    expect(result.id).toMatch(/^byteplus-/)
  })

  it('reads the flat transcript spelling when result is absent', async () => {
    const result = await generateTranscription({
      adapter: adapterWith(
        asrFetch({
          transcript: 'flat shape',
          utterances: [{ text: 'flat shape', start_time: 0, end_time: 1000 }],
        }),
      ),
      audio: 'https://example.com/a.wav',
    })
    expect(result.text).toBe('flat shape')
    expect(result.segments).toEqual([
      { id: 0, start: 0, end: 1, text: 'flat shape' },
    ])
  })

  it('forwards recognition options and the language hint', async () => {
    const fetchMock = asrFetch()
    await generateTranscription({
      adapter: adapterWith(fetchMock),
      audio: 'https://example.com/a.mp3',
      language: 'en-US',
      modelOptions: {
        enable_itn: true,
        enable_punc: true,
        enable_ddc: false,
        enable_speaker_info: true,
        show_utterances: false,
        model_name: 'bigmodel',
        uid: 'tenant-42',
      },
    })

    const { body } = lastRequest(fetchMock)
    expect(body.user).toEqual({ uid: 'tenant-42' })
    expect(body.request).toEqual({
      model_name: 'bigmodel',
      show_utterances: false,
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      enable_speaker_info: true,
      language: 'en-US',
    })
  })

  it('lets modelOptions.language override the generic language', async () => {
    const fetchMock = asrFetch()
    const result = await generateTranscription({
      adapter: adapterWith(fetchMock),
      audio: 'https://example.com/a.mp3',
      language: 'en',
      modelOptions: { language: 'zh-CN' },
    })
    expect(lastRequest(fetchMock).body.request.language).toBe('zh-CN')
    // The result reports the language actually sent, not the overridden hint.
    expect(result.language).toBe('zh-CN')
  })

  describe('audio input normalisation', () => {
    it('passes http(s) urls through and infers the container', async () => {
      await expect(
        normalizeAudioInput('https://example.com/a.wav?token=1', undefined),
      ).resolves.toEqual({
        url: 'https://example.com/a.wav?token=1',
        format: 'wav',
      })
    })

    it('splits data urls into base64 data plus a format', async () => {
      await expect(
        normalizeAudioInput('data:audio/mpeg;base64,QUJD', undefined),
      ).resolves.toEqual({ data: 'QUJD', format: 'mp3' })
    })

    it('treats a bare string as base64 data', async () => {
      await expect(normalizeAudioInput('QUJD', undefined)).resolves.toEqual({
        data: 'QUJD',
      })
    })

    it('base64-encodes binary inputs', async () => {
      const bytes = new Uint8Array([1, 2, 3])
      const expected = Buffer.from(bytes).toString('base64')

      await expect(
        normalizeAudioInput(bytes.buffer as ArrayBuffer, undefined),
      ).resolves.toEqual({ data: expected })

      await expect(
        normalizeAudioInput(
          new File([bytes], 'clip.flac', { type: 'audio/flac' }),
          undefined,
        ),
      ).resolves.toEqual({ data: expected, format: 'flac' })

      await expect(
        normalizeAudioInput(
          new Blob([bytes], { type: 'audio/ogg' }),
          undefined,
        ),
      ).resolves.toEqual({ data: expected, format: 'ogg' })
    })

    it('lets modelOptions.audio_format win over the inferred container', async () => {
      await expect(
        normalizeAudioInput('https://example.com/a.wav', 'pcm'),
      ).resolves.toEqual({ url: 'https://example.com/a.wav', format: 'pcm' })
    })

    it('sends encoded bytes as audio.data on a real request', async () => {
      const fetchMock = asrFetch()
      await generateTranscription({
        adapter: adapterWith(fetchMock),
        audio: new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
        modelOptions: { audio_format: 'wav' },
      })
      expect(lastRequest(fetchMock).body.audio).toEqual({
        data: Buffer.from([1, 2, 3]).toString('base64'),
        format: 'wav',
      })
    })
  })

  describe('errors', () => {
    it('surfaces the numeric Seed Speech error envelope on a 401', async () => {
      const fetchMock = asrFetch(
        { code: 45000010, message: 'Invalid X-Api-Key' },
        401,
      )
      await expect(
        generateTranscription({
          adapter: adapterWith(fetchMock),
          audio: 'https://example.com/a.mp3',
          debug: false,
        }),
      ).rejects.toThrow(
        'BytePlus Seed Speech transcription failed (401 45000010): Invalid X-Api-Key',
      )
    })

    it('fails when a 200 response carries no transcript', async () => {
      const fetchMock = asrFetch({ code: 45000151, message: 'Audio too long' })
      await expect(
        generateTranscription({
          adapter: adapterWith(fetchMock),
          audio: 'https://example.com/a.mp3',
          debug: false,
        }),
      ).rejects.toThrow(
        'BytePlus Seed Speech transcription failed (200 45000151): Audio too long',
      )
    })
  })

  describe('headers', () => {
    it('merges configured default headers into the request', async () => {
      const fetchMock = asrFetch()
      await generateTranscription({
        adapter: adapterWith(fetchMock, { 'X-Test-Id': 'abc' }),
        audio: 'https://example.com/a.mp3',
      })
      expect(lastRequest(fetchMock).headers.get('x-test-id')).toBe('abc')
    })

    it('does not let default headers clobber the auth or resource headers', async () => {
      const fetchMock = asrFetch()
      await generateTranscription({
        adapter: adapterWith(fetchMock, {
          'X-Api-Key': 'attacker-key',
          'X-Api-Resource-Id': 'volc.wrong.model',
          'Content-Type': 'text/plain',
        }),
        audio: 'https://example.com/a.mp3',
      })
      const { headers } = lastRequest(fetchMock)
      expect(headers.get('x-api-key')).toBe('voice-key')
      expect(headers.get('x-api-resource-id')).toBe('volc.seedasr.auc_turbo')
      expect(headers.get('content-type')).toBe('application/json')
    })
  })

  describe('warnings for options the endpoint cannot honour', () => {
    it('warns that prompt is ignored', async () => {
      const logger = captureLogger()
      await generateTranscription({
        adapter: adapterWith(asrFetch()),
        audio: 'https://example.com/a.mp3',
        prompt: 'guitar shop vocabulary',
        debug: { logger },
      })
      expect(
        logger.warnings.some((w) => w.includes('`prompt` option is ignored')),
      ).toBe(true)
    })

    it('warns that a non-json responseFormat is ignored', async () => {
      const logger = captureLogger()
      await generateTranscription({
        adapter: adapterWith(asrFetch()),
        audio: 'https://example.com/a.mp3',
        responseFormat: 'srt',
        debug: { logger },
      })
      expect(
        logger.warnings.some(
          (w) => w.includes('always returns JSON') && w.includes('"srt"'),
        ),
      ).toBe(true)
    })

    it('stays quiet for responseFormat json', async () => {
      const logger = captureLogger()
      await generateTranscription({
        adapter: adapterWith(asrFetch()),
        audio: 'https://example.com/a.mp3',
        responseFormat: 'json',
        debug: { logger },
      })
      expect(logger.warnings).toHaveLength(0)
    })
  })

  describe('response mapping edges', () => {
    it('skips utterances with no timings', async () => {
      const mapped = mapRecognizeResponse(
        {
          result: {
            text: 'partial',
            utterances: [
              { text: 'no timings' },
              { text: 'timed', start_time: 0, end_time: 500 },
            ],
          },
        },
        'partial',
      )
      expect(mapped.segments).toEqual([
        { id: 0, start: 0, end: 0.5, text: 'timed' },
      ])
    })

    it('omits segments, words and usage entirely when nothing is timed', async () => {
      const mapped = mapRecognizeResponse(
        { result: { text: 'bare', utterances: [{ text: 'bare' }] } },
        'bare',
      )
      expect(mapped.segments).toBeUndefined()
      expect(mapped.words).toBeUndefined()
      expect(mapped.usage).toBeUndefined()
      expect(mapped.duration).toBeUndefined()
    })

    // The word-level drop filter had no coverage: every fixture in this file
    // and in the e2e mount is fully timed, so a field rename upstream
    // (`word.text` → `word.word`) would have emptied `words` — or shipped
    // `{ word: undefined, start: NaN }` — with nothing failing.
    it('drops words with missing or non-numeric timings', async () => {
      const mapped = mapRecognizeResponse(
        {
          result: {
            text: 'a b c',
            utterances: [
              {
                text: 'a b c',
                start_time: 0,
                end_time: 900,
                words: [
                  { text: 'a', start_time: 0, end_time: 300 },
                  { text: 'b', start_time: 300 },
                  { start_time: 600, end_time: 900 },
                ],
              },
            ],
          },
        },
        'a b c',
      )

      expect(mapped.words).toEqual([{ word: 'a', start: 0, end: 0.3 }])
    })

    it('warns when words are dropped rather than dropping them silently', async () => {
      const logger = captureLogger()
      mapRecognizeResponse(
        {
          result: {
            text: 'a b',
            utterances: [
              {
                text: 'a b',
                start_time: 0,
                end_time: 600,
                words: [
                  { text: 'a', start_time: 0, end_time: 300 },
                  { text: 'b', start_time: 300 },
                ],
              },
            ],
          },
        },
        'a b',
        resolveDebugOption({ logger }),
      )

      expect(
        logger.warnings.some((w) => w.includes('dropped 1 of 2 word(s)')),
      ).toBe(true)
    })

    it('warns when utterances are dropped rather than dropping them silently', async () => {
      const logger = captureLogger()
      mapRecognizeResponse(
        {
          result: {
            text: 'partial',
            utterances: [
              { text: 'no timings' },
              { text: 'timed', start_time: 0, end_time: 500 },
            ],
          },
        },
        'partial',
        resolveDebugOption({ logger }),
      )

      expect(
        logger.warnings.some((w) => w.includes('dropped 1 of 2 utterance(s)')),
      ).toBe(true)
    })

    // An empty transcript is legitimate for silent audio, so it isn't an
    // error — but it is also what a 200-wrapped failure looks like, and it
    // used to be returned as a plain success with no signal at all.
    it('warns on an empty transcript with no utterances', async () => {
      const logger = captureLogger()
      await generateTranscription({
        adapter: adapterWith(asrFetch({ result: { text: '' } })),
        audio: 'https://example.com/guitar.mp3',
        debug: { logger },
      })

      expect(logger.warnings.some((w) => w.includes('empty transcript'))).toBe(
        true,
      )
    })

    it('surfaces per-word confidence for callers that narrow the type', async () => {
      const result = await generateTranscription({
        adapter: adapterWith(
          asrFetch({
            result: {
              text: 'hi',
              utterances: [
                {
                  text: 'hi',
                  start_time: 0,
                  end_time: 500,
                  words: [
                    {
                      text: 'hi',
                      start_time: 0,
                      end_time: 500,
                      confidence: 0.98,
                    },
                  ],
                },
              ],
            },
          }),
        ),
        audio: 'https://example.com/a.mp3',
      })
      const words = result.words as Array<BytePlusTranscriptionWord> | undefined
      expect(words?.[0]?.confidence).toBe(0.98)
    })
  })

  it('keeps non-JSON error bodies diagnosable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response('<html>502</html>', { status: 502 })),
      )
    await expect(
      generateTranscription({
        adapter: adapterWith(fetchMock),
        audio: 'https://example.com/a.mp3',
        debug: false,
      }),
    ).rejects.toThrow('<html>502</html>')
  })

  it('createBytePlusTranscription wires the explicit key through', async () => {
    const fetchMock = asrFetch()
    const adapter = createBytePlusTranscription('seed-asr', 'explicit-key', {
      baseURL: BASE_URL,
      fetch: fetchMock,
    })
    await generateTranscription({
      adapter,
      audio: 'https://example.com/a.mp3',
    })
    expect(lastRequest(fetchMock).headers.get('x-api-key')).toBe('explicit-key')
  })
})
