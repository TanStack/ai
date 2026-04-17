import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAudio } from '@tanstack/ai'

import { elevenlabsSoundEffects } from '../src/adapters/sound-effects'

const ORIGINAL_FETCH = globalThis.fetch

describe('ElevenLabs Sound Effects Adapter', () => {
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

  it('posts to /v1/sound-generation with text and duration', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([7]), {
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )

    const adapter = elevenlabsSoundEffects('eleven_text_to_sound_v2')
    const result = await generateAudio({
      adapter,
      prompt: 'Thunderclap',
      duration: 2.5,
      modelOptions: { promptInfluence: 0.7, loop: true },
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('/v1/sound-generation')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      text: 'Thunderclap',
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: 2.5,
      prompt_influence: 0.7,
      loop: true,
    })
    expect(result.audio.contentType).toBe('audio/mpeg')
    expect(result.audio.duration).toBe(2.5)
  })
})
