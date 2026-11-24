import { beforeEach, describe, expect, it, vi } from 'vitest'
import { falAudio } from '../src/adapters/audio'
import { falImage } from '../src/adapters/image'
import { createFalLiveVideo } from '../src/adapters/live'
import { fal3dModel } from '../src/adapters/model3d'
import { fal3dMotion } from '../src/adapters/motion'
import { falSpeech } from '../src/adapters/speech'
import { falTranscription } from '../src/adapters/transcription'
import { falVideo } from '../src/adapters/video'
import type { FalClientOptions } from '../src/client'

const clientOptions = vi.fn((_options: FalClientOptions) => ({}))

// The SDK client boundary: record the options each adapter passes to it.
vi.mock('../src/client', () => ({
  createFalClient: (options: FalClientOptions) => clientOptions(options),
}))

const config = { apiKey: 'test-key' }

const factories = [
  {
    kind: 'audio',
    create: () =>
      falAudio('fal-ai/minimax-music/v2', {
        ...config,
        defaultModelOptions: { lyrics_prompt: 'la la la' },
      }),
    defaults: { lyrics_prompt: 'la la la' },
  },
  {
    kind: 'image',
    create: () =>
      falImage('fal-ai/flux/dev', {
        ...config,
        defaultModelOptions: { seed: 7 },
      }),
    defaults: { seed: 7 },
  },
  {
    kind: '3d model',
    create: () =>
      fal3dModel('fal-ai/hunyuan3d-v3/text-to-3d', {
        ...config,
        defaultModelOptions: { enable_pbr: true },
      }),
    defaults: { enable_pbr: true },
  },
  {
    kind: '3d motion',
    create: () =>
      fal3dMotion('fal-ai/hy-motion', {
        ...config,
        defaultModelOptions: { seed: 7 },
      }),
    defaults: { seed: 7 },
  },
  {
    kind: 'speech',
    create: () =>
      falSpeech('fal-ai/kokoro/american-english', {
        ...config,
        defaultModelOptions: { speed: 1.5 },
      }),
    defaults: { speed: 1.5 },
  },
  {
    kind: 'transcription',
    create: () =>
      falTranscription('fal-ai/whisper', {
        ...config,
        defaultModelOptions: { task: 'translate' },
      }),
    defaults: { task: 'translate' },
  },
  {
    kind: 'video',
    create: () =>
      falVideo('fal-ai/kling-video/v2.5-turbo/pro/text-to-video', {
        ...config,
        defaultModelOptions: { negative_prompt: 'blur' },
      }),
    defaults: { negative_prompt: 'blur' },
  },
]

describe('fal adapters: defaultModelOptions', () => {
  beforeEach(() => {
    clientOptions.mockClear()
  })

  it.each(factories)(
    '$kind adapter stores the defaults and keeps them out of the client',
    ({ create, defaults }) => {
      const adapter = create()

      expect(adapter.defaultModelOptions).toEqual(defaults)
      expect(clientOptions).toHaveBeenCalledTimes(1)
      expect(clientOptions.mock.calls[0]![0]).toStrictEqual({
        credentials: 'test-key',
        fetch: expect.any(Function),
      })
    },
  )

  it('live video adapter stores the defaults', () => {
    const adapter = createFalLiveVideo('minimax/h3-max/director', 'test-key', {
      defaultModelOptions: { tokenDuration: 60 },
    })

    expect(adapter.defaultModelOptions).toEqual({ tokenDuration: 60 })
  })
})
