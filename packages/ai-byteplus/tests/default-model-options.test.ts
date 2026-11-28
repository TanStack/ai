import { describe, expect, it, vi } from 'vitest'
import { createBytePlusImage } from '../src/adapters/image'
import { createBytePlusText } from '../src/adapters/text'
import { createBytePlusTranscription } from '../src/adapters/transcription'
import { createBytePlusSpeech } from '../src/adapters/tts'
import { createBytePlusVideo } from '../src/adapters/video'

const mocks = vi.hoisted(() => ({
  clientOptionsSpy: vi.fn<(options: object) => void>(),
}))

vi.mock('@tanstack/openai-base', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/openai-base')>()),
  createOpenAIClient: (options: object) => {
    mocks.clientOptionsSpy(options)
    return {}
  },
}))

describe('BytePlus defaultModelOptions', () => {
  it('text adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createBytePlusText('seed-2-0-lite-260428', 'test-key', {
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
    expect(mocks.clientOptionsSpy.mock.calls[0]?.[0]).toEqual({
      apiKey: 'test-key',
      baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    })
  })

  it('image adapter stores the defaults', () => {
    const adapter = createBytePlusImage('seedream-5-0-260128', 'test-key', {
      defaultModelOptions: { watermark: false },
    })

    expect(adapter.defaultModelOptions).toEqual({ watermark: false })
  })

  it('video adapter stores the defaults', () => {
    const adapter = createBytePlusVideo(
      'dreamina-seedance-2-0-260128',
      'test-key',
      { defaultModelOptions: { service_tier: 'flex' } },
    )

    expect(adapter.defaultModelOptions).toEqual({ service_tier: 'flex' })
  })

  it('speech adapter stores the defaults', () => {
    const adapter = createBytePlusSpeech('seed-audio-1.0', 'test-key', {
      defaultModelOptions: { format: 'mp3' },
    })

    expect(adapter.defaultModelOptions).toEqual({ format: 'mp3' })
  })

  it('transcription adapter stores the defaults', () => {
    const adapter = createBytePlusTranscription('seed-asr', 'test-key', {
      defaultModelOptions: { enable_punc: true },
    })

    expect(adapter.defaultModelOptions).toEqual({ enable_punc: true })
  })
})
