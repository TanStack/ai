import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioGenerationOptions } from '@tanstack/ai'

const composeMock = vi.fn()
const sfxConvertMock = vi.fn()

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    music = { compose: composeMock }
    textToSoundEffects = { convert: sfxConvertMock }
  },
}))

import { elevenlabsAudio } from '../src/adapters/audio'

function makeLogger() {
  return {
    request: vi.fn(),
    response: vi.fn(),
    provider: vi.fn(),
    errors: vi.fn(),
  } as unknown as AudioGenerationOptions['logger']
}

function makeStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

describe('elevenlabsAudio adapter — music_v1', () => {
  beforeEach(() => {
    composeMock.mockReset()
    sfxConvertMock.mockReset()
  })

  it('calls client.music.compose with prompt + duration in ms', async () => {
    composeMock.mockResolvedValue(makeStream(new Uint8Array([1, 2])))
    const adapter = elevenlabsAudio('music_v1', { apiKey: 'k' })

    const result = await adapter.generateAudio({
      model: 'music_v1',
      prompt: 'jazz trio',
      duration: 15,
      logger: makeLogger(),
    })

    expect(sfxConvertMock).not.toHaveBeenCalled()
    expect(composeMock).toHaveBeenCalledTimes(1)
    expect(composeMock.mock.calls[0]![0]).toMatchObject({
      modelId: 'music_v1',
      prompt: 'jazz trio',
      musicLengthMs: 15000,
    })
    expect(result.audio.b64Json).toBe(Buffer.from([1, 2]).toString('base64'))
  })

  it('drops prompt + duration when compositionPlan is supplied', async () => {
    composeMock.mockResolvedValue(makeStream(new Uint8Array()))
    const adapter = elevenlabsAudio('music_v1', { apiKey: 'k' })

    await adapter.generateAudio({
      model: 'music_v1',
      prompt: 'ignored',
      duration: 20,
      modelOptions: {
        compositionPlan: {
          positiveGlobalStyles: ['jazz'],
          sections: [
            {
              sectionName: 'verse',
              durationMs: 8000,
              lines: ['hello'],
            },
          ],
        },
      },
      logger: makeLogger(),
    })

    const body = composeMock.mock.calls[0]![0]
    expect(body.prompt).toBeUndefined()
    expect(body.musicLengthMs).toBeUndefined()
    expect(body.compositionPlan).toMatchObject({
      positiveGlobalStyles: ['jazz'],
      sections: [
        expect.objectContaining({
          sectionName: 'verse',
          durationMs: 8000,
          lines: ['hello'],
        }),
      ],
    })
  })
})

describe('elevenlabsAudio adapter — sound effects', () => {
  beforeEach(() => {
    composeMock.mockReset()
    sfxConvertMock.mockReset()
  })

  it('calls client.textToSoundEffects.convert with text + duration', async () => {
    sfxConvertMock.mockResolvedValue(makeStream(new Uint8Array([9])))
    const adapter = elevenlabsAudio('eleven_text_to_sound_v2', {
      apiKey: 'k',
    })

    const result = await adapter.generateAudio({
      model: 'eleven_text_to_sound_v2',
      prompt: 'glass breaking',
      duration: 3,
      modelOptions: { promptInfluence: 0.7, loop: true },
      logger: makeLogger(),
    })

    expect(composeMock).not.toHaveBeenCalled()
    expect(sfxConvertMock).toHaveBeenCalledTimes(1)
    expect(sfxConvertMock.mock.calls[0]![0]).toMatchObject({
      text: 'glass breaking',
      modelId: 'eleven_text_to_sound_v2',
      durationSeconds: 3,
      promptInfluence: 0.7,
      loop: true,
    })
    expect(result.audio.b64Json).toBe(Buffer.from([9]).toString('base64'))
    expect(result.audio.duration).toBe(3)
  })

  it('routes eleven_text_to_sound_v1 to the SFX endpoint too', async () => {
    sfxConvertMock.mockResolvedValue(makeStream(new Uint8Array()))
    const adapter = elevenlabsAudio('eleven_text_to_sound_v1', {
      apiKey: 'k',
    })
    await adapter.generateAudio({
      model: 'eleven_text_to_sound_v1',
      prompt: 'rain',
      logger: makeLogger(),
    })
    expect(sfxConvertMock).toHaveBeenCalled()
  })
})

describe('elevenlabsAudio adapter — unknown model', () => {
  beforeEach(() => {
    composeMock.mockReset()
    sfxConvertMock.mockReset()
  })

  it('throws a helpful error for unrecognized models', async () => {
    const adapter = elevenlabsAudio('not-a-real-model', { apiKey: 'k' })
    const logger = makeLogger()
    await expect(
      adapter.generateAudio({
        model: 'not-a-real-model',
        prompt: 'x',
        logger,
      }),
    ).rejects.toThrow(/Unsupported ElevenLabs audio model/i)
    expect(logger.errors).toHaveBeenCalled()
  })
})
