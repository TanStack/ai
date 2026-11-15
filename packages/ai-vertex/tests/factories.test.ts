import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _chunk of stream) {
    // drain
  }
}

describe('vertex factories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a Gemini text adapter that creates the Vertex SDK client on first call', async () => {
    const adapter = vertexText('gemini-3.7-flash', auth)

    expect(adapter.name).toBe('gemini')
    expect(adapter.model).toBe('gemini-3.7-flash')
    expect(mocks.constructorSpy).not.toHaveBeenCalled()

    await drain(
      adapter.chatStream({
        threadId: 'thread-1',
        logger,
        model: 'gemini-3.7-flash',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    )

    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
      project: 'my-project',
      location: 'europe-west1',
      vertexai: true,
    })
  })

  it('builds summarize, image, embedding, speech, audio, and video adapters', async () => {
    const summarize = vertexSummarize('gemini-3.7-flash', auth)
    const image = vertexImage('gemini-3.1-flash-image', auth)
    const embedding = vertexEmbedding('gemini-embedding-001', auth)
    const speech = vertexSpeech('gemini-3.1-flash-tts-preview', auth)
    const audio = vertexAudio('lyria-3-pro-preview', auth)
    const video = vertexVideo('veo-3.1-generate-preview', auth)
    for (const adapter of [summarize, image, embedding, speech, audio, video]) {
      expect(adapter.name).toBe('gemini')
    }

    const ignoreFailure = () => undefined
    await summarize
      .summarize({
        threadId: 'thread-1',
        model: 'gemini-3.7-flash',
        text: 'Hi',
        logger,
      })
      .catch(ignoreFailure)
    await image
      .generateImages({
        model: 'gemini-3.1-flash-image',
        prompt: 'A cat',
        logger,
      })
      .catch(ignoreFailure)
    await embedding
      .createEmbeddings({
        model: 'gemini-embedding-001',
        input: ['Hi'],
        logger,
      })
      .catch(ignoreFailure)
    await speech
      .generateSpeech({
        model: 'gemini-3.1-flash-tts-preview',
        text: 'Hi',
        logger,
      })
      .catch(ignoreFailure)
    await audio
      .generateAudio({ model: 'lyria-3-pro-preview', prompt: 'A song', logger })
      .catch(ignoreFailure)
    await video
      .createVideoJob({
        model: 'veo-3.1-generate-preview',
        prompt: 'A cat',
        logger,
      })
      .catch(ignoreFailure)

    expect(mocks.constructorSpy).toHaveBeenCalledTimes(6)
    for (const call of mocks.constructorSpy.mock.calls) {
      expect(call[0]).toMatchObject({
        project: 'my-project',
        location: 'europe-west1',
        vertexai: true,
      })
    }
  })
})
