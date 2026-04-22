import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAudio } from '@tanstack/ai'

import {
  GeminiAudioAdapter,
  createGeminiAudio,
  geminiAudio,
} from '../src/adapters/audio'

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

describe('Gemini Audio (Lyria) Adapter', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset()
  })

  it('createGeminiAudio returns a configured adapter', () => {
    const adapter = createGeminiAudio('lyria-3-pro-preview', 'key')
    expect(adapter).toBeInstanceOf(GeminiAudioAdapter)
    expect(adapter.kind).toBe('audio')
    expect(adapter.name).toBe('gemini')
    expect(adapter.model).toBe('lyria-3-pro-preview')
  })

  it('geminiAudio reads the API key from the environment', () => {
    process.env.GOOGLE_API_KEY = 'env-key'
    try {
      const adapter = geminiAudio('lyria-3-clip-preview')
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

    const adapter = createGeminiAudio('lyria-3-pro-preview', 'key')
    const result = await generateAudio({
      adapter,
      prompt: 'Ambient piano and strings',
      modelOptions: { responseMimeType: 'audio/wav', seed: 42 },
    })

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    const args = mockGenerateContent.mock.calls[0]![0]
    expect(args.model).toBe('lyria-3-pro-preview')
    expect(args.config.responseModalities).toEqual(['AUDIO', 'TEXT'])
    expect(args.config.responseMimeType).toBe('audio/wav')
    expect(args.config.seed).toBe(42)

    expect(result.audio.b64Json).toBe('BASE64AUDIO')
    expect(result.audio.contentType).toBe('audio/mp3')
  })

  it('omits responseMimeType by default so Gemini returns the MP3 default', async () => {
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

    const adapter = createGeminiAudio('lyria-3-clip-preview', 'key')
    await generateAudio({ adapter, prompt: 'Ambient piano' })

    const args = mockGenerateContent.mock.calls[0]![0]
    expect(args.config.responseMimeType).toBeUndefined()
  })

  it('throws when the response has no audio part', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [] } }],
    })
    const adapter = createGeminiAudio('lyria-3-clip-preview', 'key')
    await expect(generateAudio({ adapter, prompt: 'silence' })).rejects.toThrow(
      /No audio data/,
    )
  })
})
