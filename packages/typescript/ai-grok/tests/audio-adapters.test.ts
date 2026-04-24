import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSpeech, generateTranscription } from '@tanstack/ai'
import { GrokSpeechAdapter } from '../src/adapters/tts'
import { GrokTranscriptionAdapter } from '../src/adapters/transcription'
import { toAudioFile } from '../src/utils/audio'

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
    const ttsHeaders = new Headers(init?.headers)
    expect(ttsHeaders.get('authorization')).toBe('Bearer xai-test')
    expect(ttsHeaders.get('content-type')).toBe('application/json')

    const body = JSON.parse(init!.body as string)
    expect(body.text).toBe('hello world')
    expect(body.voice_id).toBe('eve')
    expect(body.language).toBe('en')
    // For non-pcm codecs we do NOT force a sample_rate — when the caller
    // doesn't pick one we let xAI apply its server default rather than
    // pinning mp3/wav/opus/aac/flac to our guess. `sample_rate` is only
    // forwarded unconditionally for pcm (where it's encoded in the
    // `audio/L16;rate=…` contentType) or when the caller sets it explicitly.
    expect(body.output_format).toEqual({ codec: 'mp3' })

    expect(result.model).toBe('grok-tts')
    expect(result.format).toBe('mp3')
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.audio).toBe(Buffer.from(audioBytes).toString('base64'))
    expect(result.id).toMatch(/^grok-/)
  })

  it.each(['opus', 'aac', 'flac'] as const)(
    'maps unsupported TTSOptions format %s to mp3',
    async (fmt) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(mockTTSResponse())
      globalThis.fetch = fetchMock as unknown as typeof fetch

      const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

      await generateSpeech({
        adapter,
        text: 'x',
        format: fmt,
      })

      const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
      expect(body.output_format.codec).toBe('mp3')
    },
  )

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

  it('forwards sample_rate for mp3 only when the caller set it explicitly', async () => {
    // Regression: we used to always send `sample_rate: 24000` for mp3,
    // which over-constrained the request and masked xAI's server default.
    // For non-pcm codecs the rate is NOT part of the Content-Type, so unless
    // the caller pins one we leave it out entirely.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    await generateSpeech({
      adapter,
      text: 'x',
      modelOptions: { sample_rate: 44100 },
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.output_format).toEqual({ codec: 'mp3', sample_rate: 44100 })
  })

  it('omits sample_rate for wav when the caller does not set it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    await generateSpeech({
      adapter,
      text: 'x',
      format: 'wav',
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.output_format).toEqual({ codec: 'wav' })
  })

  it('forwards sample_rate for pcm even when the caller does not set it', async () => {
    // pcm is the exception: `audio/L16;rate=…` embeds the rate in the
    // Content-Type, so we MUST send one or the server response label would
    // disagree with the bytes. Default is 24000.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    await generateSpeech({
      adapter,
      text: 'x',
      format: 'pcm',
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.output_format).toEqual({ codec: 'pcm', sample_rate: 24000 })
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

  it('reports pcm audio with the registered `audio/L16` MIME type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    const result = await generateSpeech({
      adapter,
      text: 'x',
      format: 'pcm',
    })

    expect(result.format).toBe('pcm')
    // `audio/L16` requires a `rate` parameter per RFC 3551/3555. The default
    // sample rate documented in GrokTTSProviderOptions is 24000 Hz.
    expect(result.contentType).toBe('audio/L16;rate=24000')
  })

  it('reports pcm audio with the explicit sample_rate when provided', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockTTSResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokSpeechAdapter({ apiKey: 'xai-test' }, 'grok-tts')

    const result = await generateSpeech({
      adapter,
      text: 'x',
      format: 'pcm',
      modelOptions: { sample_rate: 48000 },
    })

    expect(result.format).toBe('pcm')
    expect(result.contentType).toBe('audio/L16;rate=48000')
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
    const sttHeaders = new Headers(init?.headers)
    expect(sttHeaders.get('authorization')).toBe('Bearer xai-test')
    // FormData sets Content-Type automatically; ensure we didn't hardcode it
    expect(sttHeaders.get('content-type')).toBeNull()

    const form = init!.body as FormData
    expect(form.get('language')).toBe('en')
    expect(form.get('diarize')).toBe('true')
    expect(form.get('multichannel')).toBe('false')
    expect(form.get('file')).toBeInstanceOf(File)

    expect(result.model).toBe('grok-stt')
    expect(result.text).toBe('hello world')
    expect(result.language).toBe('en')
    expect(result.duration).toBe(1.23)
    // Grok returns `confidence` per word when the model provides one; we
    // surface it under `GrokTranscriptionWord` so callers that know they're
    // using Grok can narrow the result via `as Array<GrokTranscriptionWord>`.
    expect(result.words).toEqual([
      { word: 'hello', start: 0, end: 0.5, confidence: 0.9 },
      { word: 'world', start: 0.5, end: 1.0, confidence: 0.85 },
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
        audio: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
      }),
    ).rejects.toThrow('Grok transcription request failed: 400 bad audio')
  })

  it('surfaces modelOptions.inverse_text_normalization as the wire-level `format` field', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockSTTResponse({ text: 'hi', language: 'en' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokTranscriptionAdapter(
      { apiKey: 'xai-test' },
      'grok-stt',
    )

    await generateTranscription({
      adapter,
      audio: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
      language: 'en',
      modelOptions: { inverse_text_normalization: true },
    })

    const init = fetchMock.mock.calls[0]![1]!
    const form = init.body as FormData
    expect(form.get('format')).toBe('true')
  })

  it('threads modelOptions.audio_format through to toAudioFile for bare base64', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockSTTResponse({ text: 'hi', language: 'en' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const adapter = new GrokTranscriptionAdapter(
      { apiKey: 'xai-test' },
      'grok-stt',
    )

    // Bare base64 payload — without audio_format, toAudioFile would throw.
    const base64 = Buffer.from([1, 2, 3]).toString('base64')

    await generateTranscription({
      adapter,
      audio: base64,
      modelOptions: { audio_format: 'wav' },
    })

    const init = fetchMock.mock.calls[0]![1]!
    const form = init.body as FormData
    expect(form.get('audio_format')).toBe('wav')
    const file = form.get('file') as File
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('audio/wav')
  })
})

describe('toAudioFile', () => {
  it('throws when given a bare base64 string without an audioFormat', () => {
    const base64 = Buffer.from([1, 2, 3]).toString('base64')
    expect(() => toAudioFile(base64)).toThrow(/data: URI|audioFormat/)
  })

  it('throws when given an ArrayBuffer without an audioFormat', () => {
    const buf = new Uint8Array([1, 2, 3]).buffer
    expect(() => toAudioFile(buf)).toThrow(/cannot infer type|audioFormat/)
  })

  it('honours explicit audioFormat for bare base64 input', () => {
    const base64 = Buffer.from([1, 2, 3]).toString('base64')
    const file = toAudioFile(base64, 'wav')
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('audio/wav')
    expect(file.name).toBe('audio.wav')
  })

  it('honours explicit audioFormat for ArrayBuffer input', () => {
    const buf = new Uint8Array([1, 2, 3]).buffer
    const file = toAudioFile(buf, 'flac')
    expect(file.type).toBe('audio/flac')
    expect(file.name).toBe('audio.flac')
  })

  it('parses mime type from data: URI', () => {
    const base64 = Buffer.from([1, 2, 3]).toString('base64')
    const file = toAudioFile(`data:audio/ogg;base64,${base64}`)
    expect(file.type).toBe('audio/ogg')
    expect(file.name).toBe('audio.ogg')
  })

  it('wraps atob errors with a descriptive message', () => {
    expect(() => toAudioFile('!!!not-base64!!!', 'mp3')).toThrow(
      /Invalid base64 input to toAudioFile/,
    )
  })

  it('throws on a malformed data: URI with unparseable MIME type', () => {
    expect(() => toAudioFile('data:,ABCD')).toThrow(
      /Malformed data: URI in toAudioFile: cannot parse MIME type/,
    )
  })

  it('throws on a data: URI with a missing base64 payload', () => {
    expect(() => toAudioFile('data:audio/mpeg;base64,')).toThrow(
      /Malformed data: URI in toAudioFile: missing base64 payload/,
    )
    expect(() => toAudioFile('data:audio/mpeg;base64')).toThrow(
      /Malformed data: URI in toAudioFile: missing base64 payload/,
    )
  })

  it('prefers explicit audioFormat over the data: URI MIME type', () => {
    const base64 = Buffer.from([1, 2, 3]).toString('base64')
    // URI says octet-stream; caller says wav. Caller wins.
    const file = toAudioFile(
      `data:application/octet-stream;base64,${base64}`,
      'wav',
    )
    expect(file.type).toBe('audio/wav')
    expect(file.name).toBe('audio.wav')
  })

  it('prefers explicit audioFormat over an empty Blob .type', () => {
    // Blob with no `.type` + explicit `audioFormat: 'wav'` should produce a
    // wav-labelled File rather than falling back to
    // `application/octet-stream`, which would mislabel audio for the server.
    const blob = new Blob([new Uint8Array([1, 2, 3])])
    const file = toAudioFile(blob, 'wav')
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('audio/wav')
    expect(file.name).toBe('audio.wav')
  })

  it('prefers explicit audioFormat over the Blob .type when both are present', () => {
    // Caller has more context than the browser's auto-detected type: if they
    // pass `audioFormat` explicitly it wins over `Blob.type`.
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/octet-stream',
    })
    const file = toAudioFile(blob, 'flac')
    expect(file.type).toBe('audio/flac')
    expect(file.name).toBe('audio.flac')
  })

  it('throws for a Blob with empty .type and no audioFormat', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])])
    expect(() => toAudioFile(blob)).toThrow(
      /cannot infer type for Blob input with empty \.type/,
    )
  })

  it('prefers explicit audioFormat over an empty File .type', () => {
    // File with no `.type` + explicit `audioFormat`: caller wins.
    const f = new File([new Uint8Array([1, 2, 3])], 'clip', { type: '' })
    const result = toAudioFile(f, 'wav')
    expect(result).toBeInstanceOf(File)
    expect(result.type).toBe('audio/wav')
    expect(result.name).toBe('audio.wav')
  })

  it('throws for a File with empty .type and no audioFormat', () => {
    const f = new File([new Uint8Array([1, 2, 3])], 'clip', { type: '' })
    expect(() => toAudioFile(f)).toThrow(
      /cannot infer type for File input with empty \.type/,
    )
  })

  it('returns the File as-is when .type is non-empty and no audioFormat is passed', () => {
    const f = new File([new Uint8Array([1, 2, 3])], 'clip.mp3', {
      type: 'audio/mpeg',
    })
    const result = toAudioFile(f)
    // Same identity — we don't wrap when the File already carries a type.
    expect(result).toBe(f)
  })

  it('produces sensible filename extensions for mulaw and alaw', () => {
    // The MIME types audio/basic (mulaw) and audio/x-alaw-basic (alaw) have no
    // obvious extension; without an explicit mapping the default `slice(slash+1)`
    // would produce `audio.basic` / `audio.x-alaw-basic`, which servers treating
    // the filename as a format hint won't recognize. Pin the explicit mapping.
    const mulawFile = toAudioFile(new ArrayBuffer(3), 'mulaw')
    expect(mulawFile.type).toBe('audio/basic')
    expect(mulawFile.name).toBe('audio.mulaw')

    const alawFile = toAudioFile(new ArrayBuffer(3), 'alaw')
    expect(alawFile.type).toBe('audio/x-alaw-basic')
    expect(alawFile.name).toBe('audio.alaw')
  })
})
