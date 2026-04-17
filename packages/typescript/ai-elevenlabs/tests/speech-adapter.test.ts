import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSpeech } from '@tanstack/ai'

import { elevenlabsSpeech } from '../src/adapters/speech'

const ORIGINAL_FETCH = globalThis.fetch

describe('ElevenLabs Speech Adapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'test-key'
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    delete process.env.ELEVENLABS_API_KEY
  })

  it('posts to the text-to-speech endpoint with the given voice', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )

    const adapter = elevenlabsSpeech('eleven_v3')
    const result = await generateSpeech({
      adapter,
      text: 'Hello world',
      voice: 'my-voice',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('/v1/text-to-speech/my-voice')
    expect(url).toContain('output_format=mp3_44100_128')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ text: 'Hello world', model_id: 'eleven_v3' })
    expect(result.format).toBe('mp3')
    expect(result.audio).toBe(Buffer.from([1, 2, 3]).toString('base64'))
  })

  it('throws when no voice id is provided', async () => {
    const adapter = elevenlabsSpeech('eleven_v3')
    await expect(
      generateSpeech({ adapter, text: 'hi' }),
    ).rejects.toThrow(/requires a voice id/)
  })

  it('forwards voice settings and format options', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0]), {
        headers: { 'content-type': 'audio/wav' },
      }),
    )

    const adapter = elevenlabsSpeech('eleven_v3')
    await generateSpeech({
      adapter,
      text: 'hi',
      voice: 'v',
      speed: 1.2,
      modelOptions: {
        outputFormat: 'pcm_44100',
        voiceSettings: { stability: 0.3 },
        languageCode: 'en',
      },
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('output_format=pcm_44100')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.voice_settings).toEqual({ stability: 0.3, speed: 1.2 })
    expect(body.language_code).toBe('en')
  })

  it('surfaces ElevenLabs errors', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"detail":"bad voice"}', {
        status: 422,
        statusText: 'Unprocessable Entity',
      }),
    )

    const adapter = elevenlabsSpeech('eleven_v3')
    await expect(
      generateSpeech({ adapter, text: 'hi', voice: 'v' }),
    ).rejects.toThrow(/422/)
  })
})
