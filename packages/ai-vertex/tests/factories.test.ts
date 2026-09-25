import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  return {
    constructorSpy: vi.fn<(options: Record<string, unknown>) => void>(),
  }
})

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()

  class MockGoogleGenAI {
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

describe('vertex factories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a Gemini text adapter with Vertex client options', () => {
    const adapter = vertexText('gemini-3.7-flash', auth)

    expect(adapter.name).toBe('gemini')
    expect(adapter.model).toBe('gemini-3.7-flash')
    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
      project: 'my-project',
      location: 'europe-west1',
      vertexai: true,
    })
  })

  it('builds summarize, image, embedding, speech, audio, and video adapters', () => {
    expect(vertexSummarize('gemini-3.7-flash', auth).name).toBe('gemini')
    expect(vertexImage('gemini-3.1-flash-image', auth).name).toBe('gemini')
    expect(vertexEmbedding('gemini-embedding-001', auth).name).toBe('gemini')
    expect(vertexSpeech('gemini-3.1-flash-tts-preview', auth).name).toBe(
      'gemini',
    )
    expect(vertexAudio('lyria-3-pro-preview', auth).name).toBe('gemini')
    expect(vertexVideo('veo-3.1-generate-preview', auth).name).toBe('gemini')

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
