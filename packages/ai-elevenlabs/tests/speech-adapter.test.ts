import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TTSOptions } from '@tanstack/ai'

const convertMock = vi.fn()
const convertWithTimestampsMock = vi.fn()
const dialogueConvertMock = vi.fn()
const dialogueConvertWithTimestampsMock = vi.fn()

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    textToSpeech = {
      convert: convertMock,
      convertWithTimestamps: convertWithTimestampsMock,
    }
    textToDialogue = {
      convert: dialogueConvertMock,
      convertWithTimestamps: dialogueConvertWithTimestampsMock,
    }
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
    convertWithTimestampsMock.mockReset()
    dialogueConvertMock.mockReset()
    dialogueConvertWithTimestampsMock.mockReset()
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

  it('wraps PCM samples in a 44.1 kHz, 16-bit mono WAV container', async () => {
    const samples = Buffer.from([0, 0, 255, 127, 0, 128, 255, 255])
    convertMock.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(samples.subarray(0, 3))
          controller.enqueue(samples.subarray(3))
          controller.close()
        },
      }),
    )
    const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })
    const result = await adapter.generateSpeech({
      model: 'eleven_v3',
      text: 'hi',
      voice: 'v',
      format: 'wav',
      logger: makeLogger(),
    })

    expect(convertMock.mock.calls[0]![1].outputFormat).toBe('pcm_44100')
    expect(result).toMatchObject({ format: 'wav', contentType: 'audio/wav' })
    const wav = Buffer.from(result.audio, 'base64')
    expect(wav.length).toBe(44 + samples.length)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8)
    expect(wav.toString('ascii', 8, 16)).toBe('WAVEfmt ')
    expect(wav.readUInt32LE(16)).toBe(16)
    expect(wav.readUInt16LE(20)).toBe(1)
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(44100)
    expect(wav.readUInt32LE(28)).toBe(88200)
    expect(wav.readUInt16LE(32)).toBe(2)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.toString('ascii', 36, 40)).toBe('data')
    expect(wav.readUInt32LE(40)).toBe(samples.length)
    expect(wav.subarray(44)).toEqual(samples)
  })

  it.each(['aac', 'flac'] as const)(
    'rejects %s before calling the SDK',
    async (format) => {
      convertMock.mockResolvedValue(
        makeStream(new Uint8Array([255, 251, 144, 0])),
      )
      const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })
      await expect(
        adapter.generateSpeech({
          model: 'eleven_v3',
          text: 'hi',
          voice: 'v',
          format,
          logger: makeLogger(),
        }),
      ).rejects.toThrow(
        `ElevenLabs TTS does not support format '${format}'. Use mp3, pcm, opus, or wav.`,
      )
      expect(convertMock).not.toHaveBeenCalled()
    },
  )

  it.each(['wav', 'aac', 'flac'] as const)(
    'keeps explicit outputFormat precedence over %s',
    async (format) => {
      const bytes = new Uint8Array([1, 2, 3])
      convertMock.mockResolvedValue(makeStream(bytes))
      const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })
      const result = await adapter.generateSpeech({
        model: 'eleven_v3',
        text: 'hi',
        voice: 'v',
        format,
        modelOptions: { outputFormat: 'mp3_22050_32' },
        logger: makeLogger(),
      })
      expect(convertMock.mock.calls[0]![1].outputFormat).toBe('mp3_22050_32')
      expect(result).toMatchObject({
        format: 'mp3',
        contentType: 'audio/mpeg',
        audio: Buffer.from(bytes).toString('base64'),
      })
    },
  )

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

  describe('endpoint branching', () => {
    const TURNS = [
      { text: 'Knock knock', voice: 'voice-a' },
      { text: 'Who is there?', voice: 'voice-b' },
    ]

    it('sends turns to textToDialogue.convert', async () => {
      dialogueConvertMock.mockResolvedValue(makeStream(new Uint8Array([7])))
      const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

      const result = await adapter.generateSpeech({
        model: 'eleven_v3',
        text: 'Knock knock\nWho is there?',
        turns: TURNS,
        logger: makeLogger(),
      })

      expect(convertMock).not.toHaveBeenCalled()
      expect(dialogueConvertMock.mock.calls[0]![0]).toMatchObject({
        modelId: 'eleven_v3',
        inputs: [
          { text: 'Knock knock', voiceId: 'voice-a' },
          { text: 'Who is there?', voiceId: 'voice-b' },
        ],
      })
      expect(result.audio).toBe(Buffer.from([7]).toString('base64'))
    })

    it('sends turns + timestamps to textToDialogue.convertWithTimestamps and maps the timings', async () => {
      dialogueConvertWithTimestampsMock.mockResolvedValue({
        audioBase64: 'QUJD',
        alignment: {
          characters: ['h', 'i', '!'],
          characterStartTimesSeconds: [0, 0.1, 0.2],
          characterEndTimesSeconds: [0.1, 0.2, 0.3],
        },
        voiceSegments: [
          {
            voiceId: 'voice-a',
            startTimeSeconds: 0,
            endTimeSeconds: 0.2,
            characterStartIndex: 0,
            characterEndIndex: 2,
            dialogueInputIndex: 0,
          },
          {
            voiceId: 'voice-b',
            startTimeSeconds: 0.2,
            endTimeSeconds: 0.3,
            characterStartIndex: 2,
            characterEndIndex: 3,
            dialogueInputIndex: 1,
          },
        ],
      })
      const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

      const result = await adapter.generateSpeech({
        model: 'eleven_v3',
        text: 'hi!',
        turns: TURNS,
        timestamps: true,
        logger: makeLogger(),
      })

      expect(dialogueConvertMock).not.toHaveBeenCalled()
      expect(result.audio).toBe('QUJD')
      expect(result.alignment).toEqual({
        unit: 'character',
        texts: ['h', 'i', '!'],
        startSeconds: [0, 0.1, 0.2],
        endSeconds: [0.1, 0.2, 0.3],
      })
      // `text` per segment is sliced out of the character array, so a caller
      // can label a turn without re-deriving the indices.
      expect(result.segments).toEqual([
        {
          startSeconds: 0,
          endSeconds: 0.2,
          turnIndex: 0,
          voice: 'voice-a',
          text: 'hi',
        },
        {
          startSeconds: 0.2,
          endSeconds: 0.3,
          turnIndex: 1,
          voice: 'voice-b',
          text: '!',
        },
      ])
    })

    it('sends a single voice + timestamps to textToSpeech.convertWithTimestamps', async () => {
      convertWithTimestampsMock.mockResolvedValue({
        audioBase64: 'QUJD',
        alignment: {
          characters: ['h', 'i'],
          characterStartTimesSeconds: [0, 0.1],
          characterEndTimesSeconds: [0.1, 0.2],
        },
      })
      const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

      const result = await adapter.generateSpeech({
        model: 'eleven_v3',
        text: 'hi',
        voice: 'voice-a',
        timestamps: true,
        logger: makeLogger(),
      })

      expect(convertMock).not.toHaveBeenCalled()
      const [voiceId, body] = convertWithTimestampsMock.mock.calls[0]!
      expect(voiceId).toBe('voice-a')
      expect(body).toMatchObject({ text: 'hi', modelId: 'eleven_v3' })
      expect(result.alignment?.unit).toBe('character')
      // Only the dialogue endpoint reports voice segments.
      expect(result.segments).toBeUndefined()
    })

    it('wraps timestamped pcm in WAV when format is wav', async () => {
      convertWithTimestampsMock.mockResolvedValue({
        audioBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
      })
      const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

      const result = await adapter.generateSpeech({
        model: 'eleven_v3',
        text: 'hi',
        voice: 'voice-a',
        format: 'wav',
        timestamps: true,
        logger: makeLogger(),
      })

      expect(convertWithTimestampsMock.mock.calls[0]![1].outputFormat).toBe(
        'pcm_44100',
      )
      const bytes = Buffer.from(result.audio, 'base64')
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')
      expect([...bytes.subarray(44)]).toEqual([1, 2, 3, 4])
      expect(result.format).toBe('wav')
    })

    it('does not need a voice when turns carry their own', async () => {
      dialogueConvertMock.mockResolvedValue(makeStream(new Uint8Array()))
      const adapter = elevenlabsSpeech('eleven_v3', { apiKey: 'k' })

      await expect(
        adapter.generateSpeech({
          model: 'eleven_v3',
          text: 'Knock knock\nWho is there?',
          turns: TURNS,
          logger: makeLogger(),
        }),
      ).resolves.toBeDefined()
    })

    it('declares its dialogue and timestamp capabilities', () => {
      expect(
        elevenlabsSpeech('eleven_v3', { apiKey: 'k' }).capabilities,
      ).toEqual({ maxSpeakers: 10, timestamps: true })
    })
  })
})
