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
      modelOptions: { seed: 42 },
    })

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    const args = mockGenerateContent.mock.calls[0]![0]
    expect(args.model).toBe('lyria-3-pro-preview')
    expect(args.config.responseModalities).toEqual(['AUDIO', 'TEXT'])
    // responseMimeType is NOT forwarded — Lyria returns MP3 by default
    // and the Clip model rejects the field entirely.
    expect(args.config.responseMimeType).toBeUndefined()
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

  it('emits only GenerateContentConfig-valid fields (SDK audit guard)', async () => {
    // Regression guard: Lyria's audio adapter currently rides on
    // generateContent, whose config type (`GenerateContentConfig`) does NOT
    // include `negativePrompt` — that field only exists on
    // GenerateImagesConfig / GenerateVideosConfig. Until the correct
    // endpoint (likely `ai.live.music.connect` with `musicGenerationConfig`)
    // is confirmed, the adapter must not leak Imagen/Veo-shaped fields onto
    // the GenerateContent call. This test pins the emitted config shape so
    // a future SDK author can catch regressions.
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
    await generateAudio({
      adapter,
      prompt: 'Ambient piano',
      modelOptions: {
        seed: 7,
      } as Record<string, unknown>,
    })

    const args = mockGenerateContent.mock.calls[0]![0]
    expect(args.config).not.toHaveProperty('negativePrompt')
    expect(args.config).not.toHaveProperty('responseMimeType')
    expect(Object.keys(args.config).sort()).toEqual(
      ['responseModalities', 'seed'].sort(),
    )
  })

  it('passes the response mime type through verbatim without an `audio/mp3` fallback', async () => {
    // Regression: the adapter used to fall back to the non-standard
    // `audio/mp3` value (IANA uses `audio/mpeg`) — and the fallback was
    // unreachable anyway because audioPart was selected on mime presence.
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/mpeg',
                  data: 'BASE64AUDIO',
                },
              },
            ],
          },
        },
      ],
    })

    const adapter = createGeminiAudio('lyria-3-pro-preview', 'key')
    const result = await generateAudio({ adapter, prompt: 'Ambient piano' })

    expect(result.audio.contentType).toBe('audio/mpeg')
  })
})
