import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  vertexAudio,
  vertexEmbedding,
  vertexImage,
  vertexSpeech,
  vertexSummarize,
  vertexText,
  vertexVideo,
} from '../src'

const mocks = vi.hoisted(() => {
  const stop = () => Promise.reject(new Error('stop'))
  return {
    constructorSpy: vi.fn<(options: Record<string, unknown>) => void>(),
    stop,
  }
})

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()

  // Every API call fails at once: the tests only check how the SDK client
  // was created.
  class MockGoogleGenAI {
    models = {
      generateContent: mocks.stop,
      generateContentStream: mocks.stop,
      embedContent: mocks.stop,
      generateVideos: mocks.stop,
    }
    interactions = { create: mocks.stop }

    constructor(options: Record<string, unknown>) {
      mocks.constructorSpy(options)
    }
  }

  return {
    ...actual,
    GoogleGenAI: MockGoogleGenAI,
  }
})

const auth = {
  project: 'my-project',
  location: 'europe-west1',
} as const

const logger = resolveDebugOption(false)

const ignoreFailure = () => undefined

/** The SDK client gets the Vertex options and nothing more. */
function expectCleanSdkClient() {
  expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
    project: 'my-project',
    location: 'europe-west1',
    vertexai: true,
  })
}

describe('vertex defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('vertexText stores the defaults and keeps them out of the SDK client', async () => {
    const adapter = vertexText('gemini-3.7-flash', {
      ...auth,
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    for await (const _chunk of adapter.chatStream({
      threadId: 'thread-1',
      logger,
      model: 'gemini-3.7-flash',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      // drain
    }
    expectCleanSdkClient()
  })

  it('vertexSummarize exposes the defaults of its text adapter', () => {
    const adapter = vertexSummarize('gemini-3.7-flash', {
      ...auth,
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
  })

  it('vertexImage stores the defaults and keeps them out of the SDK client', async () => {
    const adapter = vertexImage('gemini-3.1-flash-image', {
      ...auth,
      defaultModelOptions: { imageConfig: { aspectRatio: '16:9' } },
    })

    expect(adapter.defaultModelOptions).toEqual({
      imageConfig: { aspectRatio: '16:9' },
    })
    await adapter
      .generateImages({
        model: 'gemini-3.1-flash-image',
        prompt: 'A cat',
        logger,
      })
      .catch(ignoreFailure)
    expectCleanSdkClient()
  })

  it('vertexEmbedding stores the defaults and keeps them out of the SDK client', async () => {
    const adapter = vertexEmbedding('gemini-embedding-001', {
      ...auth,
      defaultModelOptions: { taskType: 'RETRIEVAL_QUERY' },
    })

    expect(adapter.defaultModelOptions).toEqual({ taskType: 'RETRIEVAL_QUERY' })
    await adapter
      .createEmbeddings({
        model: 'gemini-embedding-001',
        input: ['Hi'],
        logger,
      })
      .catch(ignoreFailure)
    expectCleanSdkClient()
  })

  it('vertexSpeech stores the defaults and keeps them out of the SDK client', async () => {
    const adapter = vertexSpeech('gemini-3.1-flash-tts-preview', {
      ...auth,
      defaultModelOptions: { languageCode: 'de-DE' },
    })

    expect(adapter.defaultModelOptions).toEqual({ languageCode: 'de-DE' })
    await adapter
      .generateSpeech({
        model: 'gemini-3.1-flash-tts-preview',
        text: 'Hi',
        logger,
      })
      .catch(ignoreFailure)
    expectCleanSdkClient()
  })

  it('vertexAudio stores the defaults and keeps them out of the SDK client', async () => {
    const adapter = vertexAudio('lyria-3-pro-preview', {
      ...auth,
      defaultModelOptions: { seed: 7 },
    })

    expect(adapter.defaultModelOptions).toEqual({ seed: 7 })
    await adapter
      .generateAudio({ model: 'lyria-3-pro-preview', prompt: 'A song', logger })
      .catch(ignoreFailure)
    expectCleanSdkClient()
  })

  it('vertexVideo stores the defaults and keeps them out of the SDK client', async () => {
    const adapter = vertexVideo('veo-3.1-generate-preview', {
      ...auth,
      defaultModelOptions: { numberOfVideos: 1 },
    })

    expect(adapter.defaultModelOptions).toEqual({ numberOfVideos: 1 })
    await adapter
      .createVideoJob({
        model: 'veo-3.1-generate-preview',
        prompt: 'A cat',
        logger,
      })
      .catch(ignoreFailure)
    expectCleanSdkClient()
  })
})
