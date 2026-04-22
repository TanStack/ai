import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateMusic } from '@tanstack/ai'

import {
  GeminiMusicAdapter,
  createGeminiMusic,
  geminiMusic,
} from '../src/adapters/music'

const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => {
  class GoogleGenAI {
    models = {
      generateContent: (...args: Array<unknown>) =>
        mockGenerateContent(...args),
    }
  }
  return { GoogleGenAI }
})

describe('Gemini Music (Lyria) Adapter', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset()
  })

  it('createGeminiMusic returns a configured adapter', () => {
    const adapter = createGeminiMusic('lyria-3-pro-preview', 'key')
    expect(adapter).toBeInstanceOf(GeminiMusicAdapter)
    expect(adapter.kind).toBe('music')
    expect(adapter.name).toBe('gemini')
    expect(adapter.model).toBe('lyria-3-pro-preview')
  })

  it('geminiMusic reads the API key from the environment', () => {
    process.env.GOOGLE_API_KEY = 'env-key'
    try {
      const adapter = geminiMusic('lyria-3-clip-preview')
      expect(adapter.model).toBe('lyria-3-clip-preview')
    } finally {
      delete process.env.GOOGLE_API_KEY
    }
  })

  it('calls generateContent with AUDIO modality and returns base64 audio', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/mp3',
                  data: 'BASE64AUDIO',
                },
              },
            ],
          },
        },
      ],
    })

    const adapter = createGeminiMusic('lyria-3-pro-preview', 'key')
    const result = await generateMusic({
      adapter,
      prompt: 'Ambient piano and strings',
      modelOptions: { responseMimeType: 'audio/wav', seed: 42 },
    })

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    const args = mockGenerateContent.mock.calls[0]![0]
    expect(args.model).toBe('lyria-3-pro-preview')
    expect(args.config.responseModalities).toEqual(['AUDIO'])
    expect(args.config.responseMimeType).toBe('audio/wav')
    expect(args.config.seed).toBe(42)

    expect(result.audio.b64Json).toBe('BASE64AUDIO')
    expect(result.audio.contentType).toBe('audio/mp3')
  })

  it('throws when the response has no audio part', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [] } }],
    })
    const adapter = createGeminiMusic('lyria-3-clip-preview', 'key')
    await expect(generateMusic({ adapter, prompt: 'silence' })).rejects.toThrow(
      /No audio data/,
    )
  })
})
