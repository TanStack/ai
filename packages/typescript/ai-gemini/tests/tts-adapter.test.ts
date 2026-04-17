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
    expect(args.systemInstruction).toBe('Speak calmly')
    expect(args.config.speechConfig.languageCode).toBe('en-US')
    expect(
      args.config.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs,
    ).toHaveLength(2)
    // multi-speaker path must not set single-speaker voiceConfig
    expect(args.config.speechConfig.voiceConfig).toBeUndefined()
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
