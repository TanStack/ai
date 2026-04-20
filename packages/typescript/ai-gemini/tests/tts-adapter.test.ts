import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSpeech } from '@tanstack/ai'

import {
  GeminiTTSAdapter,
  createGeminiSpeech,
  geminiSpeech,
} from '../src/adapters/tts'

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

describe('Gemini TTS Adapter', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset()
  })

  afterEach(() => {
    delete process.env.GOOGLE_API_KEY
    delete process.env.GEMINI_API_KEY
  })

  it('createGeminiSpeech returns a configured adapter', () => {
    const adapter = createGeminiSpeech(
      'gemini-2.5-flash-preview-tts',
      'explicit-key',
    )
    expect(adapter).toBeInstanceOf(GeminiTTSAdapter)
    expect(adapter.kind).toBe('tts')
    expect(adapter.name).toBe('gemini')
    expect(adapter.model).toBe('gemini-2.5-flash-preview-tts')
  })

  it('geminiSpeech reads the API key from the environment', () => {
    process.env.GOOGLE_API_KEY = 'env-key'
    const adapter = geminiSpeech('gemini-2.5-flash-preview-tts')
    expect(adapter.model).toBe('gemini-2.5-flash-preview-tts')
  })

  it('defaults to a single-speaker Kore voice and returns the audio payload', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/wav',
                  data: 'BASE64AUDIO',
                },
              },
            ],
          },
        },
      ],
    })

    const adapter = createGeminiSpeech('gemini-2.5-flash-preview-tts', 'key')
    const result = await generateSpeech({ adapter, text: 'Hello friend' })

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    const args = mockGenerateContent.mock.calls[0]![0]
    expect(args.model).toBe('gemini-2.5-flash-preview-tts')
    expect(args.config.responseModalities).toEqual(['AUDIO'])
    expect(
      args.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    ).toBe('Kore')

    expect(result.audio).toBe('BASE64AUDIO')
    expect(result.format).toBe('wav')
    expect(result.contentType).toBe('audio/wav')
  })

  it('forwards multi-speaker and system-instruction options', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'audio/wav', data: 'B' } }],
          },
        },
      ],
    })

    const adapter = createGeminiSpeech('gemini-2.5-flash-preview-tts', 'key')

    await generateSpeech({
      adapter,
      text: 'Joe: hello\nJane: hi',
      modelOptions: {
        systemInstruction: 'Speak calmly',
        languageCode: 'en-US',
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Joe',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
            {
              speaker: 'Jane',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
          ],
        },
      },
    })

    const args = mockGenerateContent.mock.calls[0]![0]
    // systemInstruction lives inside `config`, not at the top level —
    // @google/genai only reads it off GenerateContentConfig.
    expect(args.config.systemInstruction).toBe('Speak calmly')
    expect(args.systemInstruction).toBeUndefined()
    expect(args.config.speechConfig.languageCode).toBe('en-US')
    expect(
      args.config.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs,
    ).toHaveLength(2)
    // multi-speaker path must not set single-speaker voiceConfig
    expect(args.config.speechConfig.voiceConfig).toBeUndefined()
  })

  it('honors TTSOptions.voice as a fallback for the prebuilt voice', async () => {
    // Regression: the adapter used to ignore `options.voice` and hard-code
    // 'Kore' even when the caller asked for something else.
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'audio/wav', data: 'B' } }],
          },
        },
      ],
    })

    const adapter = createGeminiSpeech('gemini-2.5-flash-preview-tts', 'key')
    await generateSpeech({ adapter, text: 'hi', voice: 'Puck' })

    const args = mockGenerateContent.mock.calls[0]![0]
    expect(
      args.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    ).toBe('Puck')
  })

  it('wraps raw audio/L16 PCM output in a WAV container', async () => {
    // Regression: Gemini TTS returns raw 16-bit LE PCM with
    // `mimeType: audio/L16;codec=pcm;rate=24000`. The adapter must prepend
    // a RIFF header and normalize the response so the result is playable.
    const pcmBase64 = Buffer.from(new Uint8Array([1, 2, 3, 4])).toString(
      'base64',
    )
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/L16;codec=pcm;rate=24000',
                  data: pcmBase64,
                },
              },
            ],
          },
        },
      ],
    })

    const adapter = createGeminiSpeech('gemini-2.5-flash-preview-tts', 'key')
    const result = await generateSpeech({ adapter, text: 'hi' })

    expect(result.format).toBe('wav')
    expect(result.contentType).toBe('audio/wav')
    const decoded = Buffer.from(result.audio as string, 'base64')
    expect(decoded.slice(0, 4).toString('ascii')).toBe('RIFF')
    expect(decoded.slice(8, 12).toString('ascii')).toBe('WAVE')
    // sample rate (little-endian uint32 at offset 24) should match 24000
    expect(decoded.readUInt32LE(24)).toBe(24000)
  })

  it('throws when the response has no audio part', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'no audio' }] } }],
    })
    const adapter = createGeminiSpeech('gemini-2.5-flash-preview-tts', 'key')
    await expect(generateSpeech({ adapter, text: 'hi' })).rejects.toThrow(
      /No audio data/,
    )
  })

  it('throws when the response has no candidate parts', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [] } }],
    })
    const adapter = createGeminiSpeech('gemini-2.5-flash-preview-tts', 'key')
    await expect(generateSpeech({ adapter, text: 'hi' })).rejects.toThrow(
      /No audio output/,
    )
  })
})
