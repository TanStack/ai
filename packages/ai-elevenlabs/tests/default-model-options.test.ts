import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElevenLabsAudio } from '../src/adapters/audio'
import { elevenlabsSpeech } from '../src/adapters/speech'
import { elevenlabsTranscription } from '../src/adapters/transcription'
import { elevenlabsVoiceDesign } from '../src/adapters/voice'
import type { ElevenLabsClientConfig } from '../src/utils/client'

const clientConfig = vi.fn((_config?: ElevenLabsClientConfig) => ({}))

// The SDK client boundary: record the config each adapter passes to it.
vi.mock('../src/client', () => ({
  createElevenLabsClient: (config?: ElevenLabsClientConfig) =>
    clientConfig(config),
}))

const factories = [
  {
    kind: 'audio',
    create: () =>
      createElevenLabsAudio('music_v1', 'test-key', {
        defaultModelOptions: { forceInstrumental: true },
      }),
    defaults: { forceInstrumental: true },
  },
  {
    kind: 'speech',
    create: () =>
      elevenlabsSpeech('eleven_v3', {
        apiKey: 'test-key',
        defaultModelOptions: { voiceId: 'voice-1' },
      }),
    defaults: { voiceId: 'voice-1' },
  },
  {
    kind: 'transcription',
    create: () =>
      elevenlabsTranscription('scribe_v1', {
        apiKey: 'test-key',
        defaultModelOptions: { diarize: true },
      }),
    defaults: { diarize: true },
  },
  {
    kind: 'voice',
    create: () =>
      elevenlabsVoiceDesign('eleven_ttv_v3', {
        apiKey: 'test-key',
        defaultModelOptions: { seed: 7 },
      }),
    defaults: { seed: 7 },
  },
]

describe('ElevenLabs adapters: defaultModelOptions', () => {
  beforeEach(() => {
    clientConfig.mockClear()
  })

  it.each(factories)(
    '$kind adapter stores the defaults and keeps them out of the client',
    ({ create, defaults }) => {
      const adapter = create()

      expect(adapter.defaultModelOptions).toEqual(defaults)
      expect(clientConfig).toHaveBeenCalledTimes(1)
      expect(clientConfig.mock.calls[0]![0]).toStrictEqual({
        apiKey: 'test-key',
      })
    },
  )
})
