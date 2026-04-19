import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAudio } from '@tanstack/ai'

import { elevenlabsMusic } from '../src/adapters/music'

const ORIGINAL_FETCH = globalThis.fetch

describe('ElevenLabs Music Adapter', () => {
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

  it('posts to /v1/music with prompt and duration', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([9]), {
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )

    const adapter = elevenlabsMusic('music_v1')
    const result = await generateAudio({
      adapter,
      prompt: 'Upbeat synthwave',
      duration: 10,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('/v1/music')
    expect(url).toContain('output_format=mp3_44100_128')

    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      prompt: 'Upbeat synthwave',
      model_id: 'music_v1',
      music_length_ms: 10000,
    })
    expect(result.audio.b64Json).toBe(Buffer.from([9]).toString('base64'))
    expect(result.audio.contentType).toBe('audio/mpeg')
  })

  it('uses compositionPlan instead of prompt when provided', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1]), {
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )

    const adapter = elevenlabsMusic('music_v1')
    await generateAudio({
      adapter,
      prompt: 'ignored',
      duration: 5,
      modelOptions: {
        compositionPlan: {
          globalStyles: ['jazz'],
          sections: [{ sectionName: 'intro', durationMs: 5000 }],
        },
        forceInstrumental: true,
      },
    })

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.composition_plan).toMatchObject({ globalStyles: ['jazz'] })
    expect(body.prompt).toBeUndefined()
    expect(body.music_length_ms).toBeUndefined()
    expect(body.force_instrumental).toBe(true)
  })
})
