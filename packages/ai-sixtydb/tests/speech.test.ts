import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSpeech } from '@tanstack/ai'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { sixtydbSpeech, createSixtyDBSpeech } from '../src'
import { asWav } from '../src/audio'

const samples = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const json = (body: unknown) => Response.json(body)
const audioRecord = (bytes = samples) => ({
  audio_base64: base64(bytes),
  encoding: 'LINEAR16',
  sample_rate: 24000,
})

afterEach(() => vi.unstubAllEnvs())

function setup(response = json(audioRecord())) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response)
  const adapter = createSixtyDBSpeech('tts', 'test-api-key', { fetch })
  const run = (
    options: Partial<
      Extract<
        Parameters<typeof generateSpeech<typeof adapter>>[0],
        { text: string }
      >
    > = {},
  ) =>
    generateSpeech({
      adapter,
      text: 'Hello',
      voice: 'workspace-voice',
      ...options,
    })
  return { run, fetch }
}

describe('60db speech', () => {
  it('sends the documented request and returns playable WAV', async () => {
    const { run, fetch } = setup()
    const result = await run({
      speed: 1.5,
      modelOptions: {
        wpm: 150,
        stability: 45,
        similarity: 80,
        targetLanguage: 'hi',
      },
    })
    const [url, request] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.60db.ai/tts-synthesize')
    expect(request?.redirect).toBe('error')
    expect(new Headers(request?.headers).get('authorization')).toBe(
      'Bearer test-api-key',
    )
    expect(JSON.parse(String(request?.body))).toEqual({
      text: 'Hello',
      voice_id: 'workspace-voice',
      speed: 1.5,
      audio_config: { audio_encoding: 'LINEAR16', sample_rate_hertz: 24000 },
      timestamp_type: 'NONE',
      wpm: 150,
      stability: 45,
      similarity: 80,
      target_language: 'hi',
    })
    const wav = Buffer.from(result.audio, 'base64')
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(24000)
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.subarray(44)).toEqual(Buffer.from(samples))
    expect(result).toMatchObject({
      model: 'tts',
      format: 'wav',
      contentType: 'audio/wav',
      duration: 4 / 24000,
    })
  })

  it('reads environment credentials and an explicit configured voice', async () => {
    vi.stubEnv('SIXTYDB_API_KEY', ' env-key ')
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => json(audioRecord()))
    const adapter = sixtydbSpeech('tts', {
      voiceId: 'configured-voice',
      fetch,
      baseURL: 'https://gateway.example.test/sixtydb/',
      defaultHeaders: { 'X-Gateway': 'value', Authorization: 'wrong' },
    })
    await generateSpeech({
      adapter,
      text: 'Hello',
      voice: 'request-voice',
      format: 'pcm',
    })
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://gateway.example.test/sixtydb/tts-synthesize',
    )
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer env-key')
    expect(headers.get('x-gateway')).toBe('value')
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).voice_id).toBe(
      'request-voice',
    )
    await generateSpeech({ adapter, text: 'Hello' })
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body)).voice_id).toBe(
      'configured-voice',
    )
  })

  it('rejects missing credentials and insecure or ambiguous endpoints', () => {
    vi.stubEnv('SIXTYDB_API_KEY', '')
    expect(() => sixtydbSpeech()).toThrow('SIXTYDB_API_KEY')
    for (const baseURL of [
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com?token=x',
      'https://example.com#fragment',
    ]) {
      expect(() => createSixtyDBSpeech('tts', 'test-key', { baseURL })).toThrow(
        'baseURL',
      )
    }
  })

  it.each(['mp3', 'opus', 'aac', 'flac'] as const)(
    'rejects unsupported %s without a request',
    async (format) => {
      const { run, fetch } = setup()
      await expect(run({ format })).rejects.toThrow('supports wav and pcm')
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('rejects invalid text, voice, speed and provider options before sending', async () => {
    const { run, fetch } = setup()
    for (const options of [
      { text: '' },
      { text: 'x'.repeat(5001) },
      { voice: '' },
      { speed: 0.4 },
      { speed: 2.1 },
      { speed: NaN },
      { modelOptions: { wpm: 59 } },
      { modelOptions: { wpm: Infinity } },
      { modelOptions: { stability: 1.5 } },
      { modelOptions: { similarity: 101 } },
      { modelOptions: { targetLanguage: '' } },
    ])
      await expect(run(options)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lets the core reject unsupported dialogue and timestamps', async () => {
    const { run, fetch } = setup()
    await expect(
      generateSpeech({
        adapter: createSixtyDBSpeech('tts', 'test-key', { fetch }),
        turns: [{ text: 'Hello', voice: 'a' }],
      }),
    ).rejects.toThrow()
    await expect(run({ timestamps: true })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['application/x-ndjson', 'text/event-stream'])(
    'assembles arbitrarily split %s records',
    async (contentType) => {
      const records = [
        {
          result: { audioContent: base64(samples.subarray(0, 3)) },
          audio_config: {
            audio_encoding: 'LINEAR16',
            sample_rate_hertz: 24000,
          },
        },
        { backendResponse: { audioContent: base64(samples.subarray(3)) } },
        { success: true },
      ]
      const text =
        contentType === 'text/event-stream'
          ? records
              .map((record) => `data: ${JSON.stringify(record)}\r\n\r\n`)
              .join('') + 'data: [DONE]\r\n\r\n'
          : records.map((record) => JSON.stringify(record)).join('\n')
      const encoded = new TextEncoder().encode(text)
      const response = new Response(
        new ReadableStream({
          start(controller) {
            for (let i = 0; i < encoded.length; i += 7)
              controller.enqueue(encoded.slice(i, i + 7))
            controller.close()
          },
        }),
        { headers: { 'Content-Type': contentType } },
      )
      const { run } = setup(response)
      expect((await run({ format: 'pcm' })).audio).toBe(base64(samples))
    },
  )

  it('unwraps base64 JSON audio envelopes', async () => {
    const encoded = new TextEncoder().encode(JSON.stringify(audioRecord()))
    const { run } = setup(json({ result: { audioContent: base64(encoded) } }))
    expect((await run({ format: 'pcm' })).audio).toBe(base64(samples))
  })

  it.each(['audio/wav', 'audio/x-wav', 'application/octet-stream'])(
    'decodes %s WAV containers',
    async (contentType) => {
      const { run } = setup(
        new Response(asWav(samples), {
          headers: { 'Content-Type': contentType },
        }),
      )
      expect((await run({ format: 'pcm' })).audio).toBe(base64(samples))
    },
  )

  it('decodes consecutive declared WAV records with LINEAR16 sample encoding', async () => {
    const record = {
      output_format: 'wav',
      audio_config: { audio_encoding: 'LINEAR16' },
      audio_base64: base64(asWav(samples)),
    }
    const { run } = setup(
      new Response(
        [record, record].map((value) => JSON.stringify(value)).join('\n'),
        { headers: { 'Content-Type': 'application/x-ndjson' } },
      ),
    )
    expect((await run({ format: 'pcm' })).audio).toBe(
      base64(new Uint8Array([...samples, ...samples])),
    )
  })

  it.each([
    'RIFF0000WAVE',
    'ID3_',
    'OggS',
    'fLaC',
    '{}',
    '{"audio_base64":"AAAA"} ',
  ])('preserves declared PCM starting with %s', async (signature) => {
    const bytes = new TextEncoder().encode(signature)
    const { run } = setup(json(audioRecord(bytes)))
    expect((await run({ format: 'pcm' })).audio).toBe(base64(bytes))
  })

  it.each([
    { success: false, audio_base64: base64(samples) },
    { type: 'error', audio_base64: base64(samples) },
    { audio_base64: 'invalid' },
    { audio_base64: '' },
    { audio_base64: base64(new Uint8Array([1])) },
    { ...audioRecord(), sample_rate: 48000 },
    { ...audioRecord(), channels: 2 },
    { ...audioRecord(), bit_depth: 24 },
    { ...audioRecord(), encoding: 'mp3' },
    { result: { ...audioRecord(), success: false } },
  ])('rejects invalid audio or error envelopes', async (payload) => {
    const { run } = setup(json(payload))
    await expect(run()).rejects.toThrow()
  })

  it('rejects an error record after partial audio', async () => {
    const { run } = setup(
      new Response(
        `${JSON.stringify(audioRecord())}\n${JSON.stringify({ error: 'failed' })}`,
        { headers: { 'Content-Type': 'application/x-ndjson' } },
      ),
    )
    await expect(run()).rejects.toThrow('synthesis error')
  })

  it('rejects truncated WAV and incompatible descriptors', async () => {
    for (const offset of [20, 22, 24, 32, 34]) {
      const bytes = asWav(samples)
      bytes[offset] = 7
      const { run } = setup(
        new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } }),
      )
      await expect(run()).rejects.toThrow('mono PCM16')
    }
    const { run } = setup(
      new Response(asWav(samples).slice(0, 46), {
        headers: { 'Content-Type': 'audio/wav' },
      }),
    )
    await expect(run()).rejects.toThrow('truncated')
  })

  it('caps response size and cancels the reader', async () => {
    const cancel = vi.fn()
    const { run } = setup(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(33 * 1024 * 1024))
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'audio/pcm' } },
      ),
    )
    await expect(run()).rejects.toThrow('32 MiB')
    expect(cancel).toHaveBeenCalled()
  })

  it('reports HTTP status without exposing the response body', async () => {
    const { run } = setup(
      new Response('test-api-key private details', { status: 401 }),
    )
    await expect(run()).rejects.toThrow('HTTP 401')
  })

  it('redacts credentials from custom transport errors', async () => {
    const { run, fetch } = setup()
    fetch.mockRejectedValue(new Error('request failed: test-api-key'))
    await expect(run()).rejects.toThrow('request failed: [redacted]')
  })

  it('normalizes padded credentials before sending and redacting them', async () => {
    let authorization: string | null = null
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (_url, request) => {
        authorization = new Headers(request?.headers).get('authorization')
        throw new Error(`request failed: ${authorization}`)
      })
    const adapter = createSixtyDBSpeech('tts', ' test-api-key ', { fetch })
    await expect(
      generateSpeech({ adapter, text: 'Hello', voice: 'workspace-voice' }),
    ).rejects.toThrow('request failed: Bearer [redacted]')
    expect(authorization).toBe('Bearer test-api-key')
  })

  it('cancels a request before sending it', async () => {
    const { run, fetch } = setup()
    const controller = new AbortController()
    controller.abort()
    await expect(run({ abortSignal: controller.signal })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('runs the real generateSpeech HTTP path and forwards cancellation', async () => {
    const requests: Array<{ url: string | undefined; body: unknown }> = []
    const server = createServer(async (request, response) => {
      let text = ''
      for await (const chunk of request) text += chunk
      requests.push({ url: request.url, body: JSON.parse(text) })
      response.setHeader('Content-Type', 'application/x-ndjson')
      response.end(`${JSON.stringify(audioRecord())}\n`)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing server port')
    try {
      const adapter = createSixtyDBSpeech('tts', 'test-key', {
        baseURL: `http://127.0.0.1:${address.port}`,
      })
      const result = await generateSpeech({
        adapter,
        text: 'Hello',
        voice: 'workspace-voice',
      })
      expect(Buffer.from(result.audio, 'base64').subarray(44)).toEqual(
        Buffer.from(samples),
      )
      expect(requests[0]).toMatchObject({
        url: '/tts-synthesize',
        body: { text: 'Hello', voice_id: 'workspace-voice' },
      })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
    const { run, fetch } = setup()
    fetch.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    const controller = new AbortController()
    const pending = run({ abortSignal: controller.signal })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    controller.abort()
    await expect(pending).rejects.toThrow()
  })
})
