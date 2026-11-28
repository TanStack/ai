import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGrokImage } from '../src/adapters/image'
import { createGrokText } from '../src/adapters/text'
import { createGrokTranscription } from '../src/adapters/transcription'
import { createGrokSpeech } from '../src/adapters/tts'
import { createGrokVideo } from '../src/adapters/video'
import { grokVertexText } from '../src/vertex'

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

/** The options that the adapter gave to the OpenAI SDK client. */
function sdkClientOptions() {
  expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
  return mocks.clientOptionsSpy.mock.calls[0]?.[0]
}

describe('Grok defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGrokText('grok-4.3', 'test-key', {
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expect(sdkClientOptions()).toEqual({
      apiKey: 'test-key',
      baseURL: 'https://api.x.ai/v1',
    })
  })

  it('vertex text adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = grokVertexText('grok-4.3', {
      project: 'test-project',
      location: 'global',
      getAccessToken: async () => 'test-token',
      defaultModelOptions: { temperature: 0.4 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.4 })
    expect(sdkClientOptions()).not.toHaveProperty('defaultModelOptions')
  })

  it('image adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGrokImage('grok-imagine-image', 'test-key', {
      defaultModelOptions: { response_format: 'b64_json' },
    })

    expect(adapter.defaultModelOptions).toEqual({
      response_format: 'b64_json',
    })
    expect(sdkClientOptions()).toEqual({
      apiKey: 'test-key',
      baseURL: 'https://api.x.ai/v1',
    })
  })

  it('video adapter stores the defaults', () => {
    const adapter = createGrokVideo('grok-imagine-video', 'test-key', {
      defaultModelOptions: { aspect_ratio: '16:9' },
    })

    expect(adapter.defaultModelOptions).toEqual({ aspect_ratio: '16:9' })
  })

  it('speech adapter stores the defaults', () => {
    const adapter = createGrokSpeech('grok-tts', 'test-key', {
      defaultModelOptions: { language: 'de' },
    })

    expect(adapter.defaultModelOptions).toEqual({ language: 'de' })
  })

  it('transcription adapter stores the defaults', () => {
    const adapter = createGrokTranscription('grok-stt', 'test-key', {
      defaultModelOptions: { sample_rate: 16000 },
    })

    expect(adapter.defaultModelOptions).toEqual({ sample_rate: 16000 })
  })
})
