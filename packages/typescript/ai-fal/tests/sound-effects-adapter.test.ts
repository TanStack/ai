import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSoundEffects } from '@tanstack/ai'

import { falSoundEffects } from '../src/adapters/sound-effects'

let mockSubscribe: any
let mockConfig: any

vi.mock('@fal-ai/client', () => {
  return {
    fal: {
      subscribe: (...args: Array<unknown>) => mockSubscribe(...args),
      config: (...args: Array<unknown>) => mockConfig(...args),
    },
  }
})

const createAdapter = () =>
  falSoundEffects('fal-ai/elevenlabs/sound-effects/v2', { apiKey: 'test-key' })

describe('Fal Sound Effects Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe = vi.fn()
    mockConfig = vi.fn()
  })

  it('generates sound effects with correct API call', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio: {
          url: 'https://fal.media/files/sfx.wav',
          content_type: 'audio/wav',
        },
      },
      requestId: 'req-sfx-123',
    })

    const adapter = createAdapter()

    const result = await generateSoundEffects({
      adapter,
      prompt: 'Thunderclap followed by heavy rain',
      duration: 5,
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)

    const [model, options] = mockSubscribe.mock.calls[0]!
    expect(model).toBe('fal-ai/elevenlabs/sound-effects/v2')
    expect(options.input).toMatchObject({
      prompt: 'Thunderclap followed by heavy rain',
      duration: 5,
    })

    expect(result.model).toBe('fal-ai/elevenlabs/sound-effects/v2')
    expect(result.audio.url).toBe('https://fal.media/files/sfx.wav')
    expect(result.audio.contentType).toBe('audio/wav')
  })

  it('handles audio_url response format', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        audio_url: 'https://fal.media/files/explosion.wav',
      },
      requestId: 'req-456',
    })

    const adapter = createAdapter()

    const result = await generateSoundEffects({
      adapter,
      prompt: 'Explosion sound effect',
    })

    expect(result.audio.url).toBe('https://fal.media/files/explosion.wav')
  })

  it('throws when audio URL not found', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {},
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    await expect(
      generateSoundEffects({ adapter, prompt: 'Test' }),
    ).rejects.toThrow('Audio URL not found in fal audio generation response')
  })

  it('configures client with API key', () => {
    falSoundEffects('fal-ai/elevenlabs/sound-effects/v2', {
      apiKey: 'my-api-key',
    })

    expect(mockConfig).toHaveBeenCalledWith({
      credentials: 'my-api-key',
    })
  })
})
