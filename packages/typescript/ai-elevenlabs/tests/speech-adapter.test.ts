import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TTSOptions } from '@tanstack/ai'

const convertMock = vi.fn()

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    textToSpeech = { convert: convertMock }
  },
}))

import { elevenlabsSpeech } from '../src/adapters/speech'

function makeLogger() {
  return {
    request: vi.fn(),
    response: vi.fn(),
    provider: vi.fn(),
    errors: vi.fn(),
  } as unknown as TTSOptions['logger']
}

function makeStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

describe('elevenlabsSpeech adapter', () => {
  beforeEach(() => {
    convertMock.mockReset()
  })

  it('forwards text + modelId + voiceId to the SDK and returns base64', async () => {
    convertMock.mockResolvedValue(makeStream(new Uint8Array([1, 2, 3])))
    const adapter = elevenlabsSpeech('eleven_multilingual_v2', {
      apiKey: 'test-key',
    })

    const result = await adapter.generateSpeech({
      model: 'eleven_multilingual_v2',
      text: 'Hello there',
      voice: 'voice-1',
      logger: makeLogger(),
    })

    expect(convertMock).toHaveBeenCalledTimes(1)
    const [voiceId, body] = convertMock.mock.calls[0]!
    expect(voiceId).toBe('voice-1')
    expect(body).toMatchObject({
      text: 'Hello there',
      modelId: 'eleven_multilingual_v2',
    })
    expect(result).toMatchObject({
      model: 'eleven_multilingual_v2',
      audio: Buffer.from([1, 2, 3]).toString('base64'),
      format: 'mp3',
      contentType: 'audio/mpeg',
    })
    expect(result.id).toMatch(/^elevenlabs-/)
  })

  it('prefers options.voice over modelOptions.voiceId', async () => {
    convertMock.mockResolvedValue(makeStream(new Uint8Array()))
    const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

    await adapter.generateSpeech({
      model: 'eleven_v3',
      text: 'hi',
      voice: 'explicit-voice',
      modelOptions: { voiceId: 'fallback-voice' },
      logger: makeLogger(),
    })

    expect(convertMock.mock.calls[0]![0]).toBe('explicit-voice')
  })

  it('falls back to modelOptions.voiceId when options.voice is missing', async () => {
    convertMock.mockResolvedValue(makeStream(new Uint8Array()))
    const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

    await adapter.generateSpeech({
      model: 'eleven_v3',
      text: 'hi',
      modelOptions: { voiceId: 'fallback-voice' },
      logger: makeLogger(),
    })

    expect(convertMock.mock.calls[0]![0]).toBe('fallback-voice')
  })

  it('throws when no voice is provided', async () => {
    const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })
    const logger = makeLogger()

    await expect(
      adapter.generateSpeech({
        model: 'eleven_v3',
        text: 'hi',
        logger,
      }),
    ).rejects.toThrow(/requires a voice/i)
    expect(logger.errors).toHaveBeenCalled()
  })

  it('translates TTSOptions.format to the closest ElevenLabs outputFormat', async () => {
    convertMock.mockResolvedValue(makeStream(new Uint8Array()))
    const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

    const result = await adapter.generateSpeech({
      model: 'eleven_v3',
      text: 'hi',
      voice: 'v',
      format: 'pcm',
      logger: makeLogger(),
    })

    expect(convertMock.mock.calls[0]![1].outputFormat).toBe('pcm_44100')
    expect(result.format).toBe('pcm')
    expect(result.contentType).toBe('audio/pcm')
  })

  it('merges voiceSettings and promotes options.speed', async () => {
    convertMock.mockResolvedValue(makeStream(new Uint8Array()))
    const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

    await adapter.generateSpeech({
      model: 'eleven_v3',
      text: 'hi',
      voice: 'v',
      speed: 1.25,
      modelOptions: {
        voiceSettings: { stability: 0.4, similarityBoost: 0.6 },
      },
      logger: makeLogger(),
    })

    expect(convertMock.mock.calls[0]![1].voiceSettings).toEqual({
      stability: 0.4,
      similarityBoost: 0.6,
      speed: 1.25,
    })
  })

  it('reports SDK errors through logger.errors', async () => {
    convertMock.mockRejectedValue(new Error('boom'))
    const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })
    const logger = makeLogger()

    await expect(
      adapter.generateSpeech({
        model: 'eleven_v3',
        text: 'hi',
        voice: 'v',
        logger,
      }),
    ).rejects.toThrow('boom')
    expect(logger.errors).toHaveBeenCalledWith(
      'elevenlabs.generateSpeech fatal',
      expect.objectContaining({ source: 'elevenlabs.generateSpeech' }),
    )
  })
})
