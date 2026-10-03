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
    constructorSpy:
      vi.fn<
        (kind: string, options: Record<string, unknown>, model: string) => void
      >(),
  }
})

vi.mock('@tanstack/ai-gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai-gemini')>()
  const adapterClass = (kind: string) => {
    return class {
      readonly name = 'gemini'
      readonly model: string

      constructor(options: Record<string, unknown>, model: string) {
        this.model = model
        mocks.constructorSpy(kind, options, model)
      }
    }
  }

  return {
    ...actual,
    GeminiTextAdapter: adapterClass('text'),
    GeminiImageAdapter: adapterClass('image'),
    GeminiEmbeddingAdapter: adapterClass('embedding'),
    GeminiTTSAdapter: adapterClass('speech'),
    GeminiAudioAdapter: adapterClass('audio'),
    GeminiVideoAdapter: adapterClass('video'),
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
    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith(
      'text',
      {
        project: 'my-project',
        location: 'europe-west1',
        vertexai: true,
      },
      'gemini-3.7-flash',
    )
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

    expect(mocks.constructorSpy.mock.calls).toEqual([
      [
        'text',
        { project: 'my-project', location: 'europe-west1', vertexai: true },
        'gemini-3.7-flash',
      ],
      [
        'image',
        { project: 'my-project', location: 'europe-west1', vertexai: true },
        'gemini-3.1-flash-image',
      ],
      [
        'embedding',
        { project: 'my-project', location: 'europe-west1', vertexai: true },
        'gemini-embedding-001',
      ],
      [
        'speech',
        { project: 'my-project', location: 'europe-west1', vertexai: true },
        'gemini-3.1-flash-tts-preview',
      ],
      [
        'audio',
        { project: 'my-project', location: 'europe-west1', vertexai: true },
        'lyria-3-pro-preview',
      ],
      [
        'video',
        {
          project: 'my-project',
          location: 'europe-west1',
          vertexai: true,
          allowUrlFetch: undefined,
        },
        'veo-3.1-generate-preview',
      ],
    ])
  })
})
