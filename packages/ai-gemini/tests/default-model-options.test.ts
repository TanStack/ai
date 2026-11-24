import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGeminiAudio } from '../src/adapters/audio'
import { createGeminiEmbedding } from '../src/adapters/embedding'
import { createGeminiDecider } from '../src/adapters/evaluate'
import { createGeminiImage } from '../src/adapters/image'
import { createGeminiChat } from '../src/adapters/text'
import { createGeminiSpeech } from '../src/adapters/tts'
import { createGeminiVideo } from '../src/adapters/video'
import { createGeminiTextInteractions } from '../src/experimental/text-interactions/adapter'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: Record<string, unknown>) => void>(),
  }
})

vi.mock('../src/client', () => {
  class MockGoogleGenAI {
    constructor(options: Record<string, unknown>) {
      mocks.constructorSpy(options)
    }
  }

  return {
    createGoogleGenAI: (
      options: ConstructorParameters<typeof MockGoogleGenAI>[0],
    ) => new MockGoogleGenAI(options),
  }
})

/** The options that the adapter gave to the SDK client. */
function sdkClientOptions() {
  expect(mocks.constructorSpy).toHaveBeenCalledOnce()
  return mocks.constructorSpy.mock.calls[0]?.[0]
}

describe('Gemini defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGeminiChat('gemini-2.5-flash', 'test-key', {
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key' })
  })

  it('text interactions adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGeminiTextInteractions(
      'gemini-2.5-flash',
      'test-key',
      { defaultModelOptions: { store: false } },
    )

    expect(adapter.defaultModelOptions).toEqual({ store: false })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key' })
  })

  it('audio adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGeminiAudio('lyria-3-clip-preview', 'test-key', {
      defaultModelOptions: { seed: 7 },
    })

    expect(adapter.defaultModelOptions).toEqual({ seed: 7 })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key' })
  })

  it('embedding adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGeminiEmbedding('gemini-embedding-001', 'test-key', {
      defaultModelOptions: { taskType: 'RETRIEVAL_DOCUMENT' },
    })

    expect(adapter.defaultModelOptions).toEqual({
      taskType: 'RETRIEVAL_DOCUMENT',
    })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key' })
  })

  it('image adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGeminiImage('gemini-3.1-flash-image', 'test-key', {
      defaultModelOptions: { imageConfig: { aspectRatio: '16:9' } },
    })

    expect(adapter.defaultModelOptions).toEqual({
      imageConfig: { aspectRatio: '16:9' },
    })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key' })
  })

  it('speech adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGeminiSpeech(
      'gemini-3.1-flash-tts-preview',
      'test-key',
      { defaultModelOptions: { languageCode: 'de-DE' } },
    )

    expect(adapter.defaultModelOptions).toEqual({ languageCode: 'de-DE' })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key' })
  })

  it('video adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGeminiVideo('veo-3.1-generate-preview', 'test-key', {
      defaultModelOptions: { numberOfVideos: 1 },
    })

    expect(adapter.defaultModelOptions).toEqual({ numberOfVideos: 1 })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key' })
  })

  it('evaluate adapter stores the defaults', () => {
    const defaults = {}
    const adapter = createGeminiDecider('gemini-decision-1', 'test-key', {
      defaultModelOptions: defaults,
    })

    expect(adapter.defaultModelOptions).toBe(defaults)
  })
})
