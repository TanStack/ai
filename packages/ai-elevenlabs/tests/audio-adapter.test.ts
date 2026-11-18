import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'

const composeMock = vi.fn()
const sfxConvertMock = vi.fn()

// The adapters build their client with `createElevenLabsClient`.
vi.mock('../src/client', () => ({
  createElevenLabsClient: () => ({
    music: { compose: composeMock },
    textToSoundEffects: { convert: sfxConvertMock },
  }),
}))

import { elevenlabsAudio } from '../src/adapters/audio'

/**
 * Build a real `InternalLogger` so tests run against the actual logging API
 * surface (`request`, `provider`, `errors`, etc.) rather than a hand-crafted
 * stub. Tests that need to observe a category call should `vi.spyOn` it.
 */
function makeLogger() {
  return resolveDebugOption(false)
}

function makeStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

describe('elevenlabsAudio adapter — music', () => {
  beforeEach(() => {
    composeMock.mockReset()
    sfxConvertMock.mockReset()
  })

  // The music family is matched by prefix, so every version routes to compose
  // without the dispatcher needing a new branch per release.
  it.each(['music_v2_5', 'music_v2', 'music_v1'] as const)(
    'routes %s to the music endpoint',
    async (model) => {
      composeMock.mockResolvedValue(makeStream(new Uint8Array()))
      const adapter = elevenlabsAudio(model, { apiKey: 'k' })

      await adapter.generateAudio({
        model,
        prompt: 'jazz trio',
        logger: makeLogger(),
      })

      expect(sfxConvertMock).not.toHaveBeenCalled()
      expect(composeMock.mock.calls[0]![0]).toMatchObject({ model_id: model })
    },
  )

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
      model_id: 'music_v1',
      prompt: 'jazz trio',
      music_length_ms: 15000,
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
    expect(body.music_length_ms).toBeUndefined()
    expect(body.composition_plan).toMatchObject({
      positive_global_styles: ['jazz'],
      sections: [
        expect.objectContaining({
          section_name: 'verse',
          duration_ms: 8000,
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
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: 3,
      prompt_influence: 0.7,
      loop: true,
    })
    expect(result.audio.b64Json).toBe(Buffer.from([9]).toString('base64'))
    expect(result.audio.duration).toBe(3)
  })

  it('keeps SFX and music on separate endpoints', async () => {
    sfxConvertMock.mockResolvedValue(makeStream(new Uint8Array()))
    const adapter = elevenlabsAudio('eleven_text_to_sound_v2', {
      apiKey: 'k',
    })
    await adapter.generateAudio({
      model: 'eleven_text_to_sound_v2',
      prompt: 'rain',
      logger: makeLogger(),
    })
    expect(sfxConvertMock).toHaveBeenCalled()
    expect(composeMock).not.toHaveBeenCalled()
  })
})

describe('elevenlabsAudio adapter — unknown model', () => {
  beforeEach(() => {
    composeMock.mockReset()
    sfxConvertMock.mockReset()
  })

  it('throws a helpful error for unrecognized models', async () => {
    // @ts-expect-error - testing runtime rejection of unknown model;
    // the public signature constrains model to ElevenLabsAudioModel.
    const adapter = elevenlabsAudio('not-a-real-model', { apiKey: 'k' })
    const logger = makeLogger()
    const errorsSpy = vi.spyOn(logger, 'errors')
    await expect(
      adapter.generateAudio({
        model: 'not-a-real-model',
        prompt: 'x',
        logger,
      }),
    ).rejects.toThrow(/Unsupported ElevenLabs audio model/i)
    expect(errorsSpy).toHaveBeenCalled()
  })
})
