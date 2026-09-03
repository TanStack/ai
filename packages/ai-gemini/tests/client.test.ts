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

describe('createGeminiClient proxy options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps baseURL and defaultHeaders onto httpOptions', () => {
    createGeminiClient({
      apiKey: 'k',
      baseURL: 'https://gw.example/gemini',
      defaultHeaders: { 'cf-aig-authorization': 'Bearer t' },
    })

    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'k',
      httpOptions: {
        baseUrl: 'https://gw.example/gemini',
        headers: { 'cf-aig-authorization': 'Bearer t' },
      },
    })
  })

  it('merges with existing httpOptions, normalized names win', () => {
    createGeminiClient({
      apiKey: 'k',
      httpOptions: {
        baseUrl: 'https://old.example',
        headers: { a: '1', b: 'old' },
        timeout: 5,
      },
      baseURL: 'https://new.example',
      defaultHeaders: { b: 'new' },
    })

    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'k',
      httpOptions: {
        baseUrl: 'https://new.example',
        headers: { a: '1', b: 'new' },
        timeout: 5,
      },
    })
  })
})
