import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGeminiClient } from '../src/utils/client'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: Record<string, unknown>) => void>(),
  }
})

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    constructor(options: Record<string, unknown>) {
      mocks.constructorSpy(options)
    }
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
  }
})

describe('createGeminiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('passes an API key through in AI Studio mode', () => {
    createGeminiClient({ apiKey: 'studio-key' })

    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'studio-key',
    })
  })

  it('throws in AI Studio mode when apiKey is missing', () => {
    expect(() => createGeminiClient({})).toThrow(/A Gemini API key is required/)
    expect(mocks.constructorSpy).not.toHaveBeenCalled()
  })

  it('does not force apiKey in Vertex mode', () => {
    createGeminiClient({
      vertexai: true,
      project: 'my-project',
      location: 'europe-west1',
    })

    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
      vertexai: true,
      project: 'my-project',
      location: 'europe-west1',
    })
  })

  it('does not force apiKey in enterprise mode', () => {
    createGeminiClient({
      enterprise: true,
      project: 'my-project',
      location: 'europe-west1',
    })

    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
      enterprise: true,
      project: 'my-project',
      location: 'europe-west1',
    })
  })
})
