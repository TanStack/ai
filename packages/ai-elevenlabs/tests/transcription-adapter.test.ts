import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptionOptions } from '@tanstack/ai'

const convertMock = vi.fn()

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    speechToText = { convert: convertMock }
  },
}))

import { elevenlabsTranscription } from '../src/adapters/transcription'

function makeLogger() {
  return {
    request: vi.fn(),
    response: vi.fn(),
    provider: vi.fn(),
    errors: vi.fn(),
  } as unknown as TranscriptionOptions['logger']
}

describe('elevenlabsTranscription adapter', () => {
  beforeEach(() => {
    convertMock.mockReset()
  })

  it('passes diarize + keyterms through to the SDK', async () => {
    convertMock.mockResolvedValue({
      text: 'hello world',
      languageCode: 'eng',
      words: [],
      audioDurationSecs: 1.2,
    })
    const adapter = elevenlabsTranscription('scribe_v1', { apiKey: 'k' })

    const result = await adapter.transcribe({
      model: 'scribe_v1',
      audio: new Blob([new Uint8Array([1, 2, 3])]),
      language: 'en',
      modelOptions: {
        diarize: true,
        keyterms: ['foo', 'bar'],
        timestampsGranularity: 'word',
      },
      logger: makeLogger(),
    })

    expect(convertMock).toHaveBeenCalledTimes(1)
    expect(convertMock.mock.calls[0]![0]).toMatchObject({
      modelId: 'scribe_v1',
      languageCode: 'en',
      diarize: true,
      keyterms: ['foo', 'bar'],
      timestampsGranularity: 'word',
    })
    expect(result).toMatchObject({
      text: 'hello world',
      language: 'eng',
      duration: 1.2,
    })
  })

  it('decodes a data: URL audio input to a Blob file upload', async () => {
    convertMock.mockResolvedValue({ text: '', words: [] })
    const adapter = elevenlabsTranscription('scribe_v1', { apiKey: 'k' })

    const dataUrl =
      'data:audio/wav;base64,' + Buffer.from([10, 20, 30]).toString('base64')

    await adapter.transcribe({
      model: 'scribe_v1',
      audio: dataUrl,
      logger: makeLogger(),
    })

    const body = convertMock.mock.calls[0]![0]
    expect(body.file).toBeInstanceOf(Blob)
    expect(body.cloudStorageUrl).toBeUndefined()
  })

  it('treats a plain https string as cloudStorageUrl', async () => {
    convertMock.mockResolvedValue({ text: '', words: [] })
    const adapter = elevenlabsTranscription('scribe_v1', { apiKey: 'k' })

    await adapter.transcribe({
      model: 'scribe_v1',
      audio: 'https://example.com/audio.mp3',
      logger: makeLogger(),
    })

    const body = convertMock.mock.calls[0]![0]
    expect(body.cloudStorageUrl).toBe('https://example.com/audio.mp3')
    expect(body.file).toBeUndefined()
  })

  it('wraps ArrayBuffer inputs into a Blob file upload', async () => {
    convertMock.mockResolvedValue({ text: '', words: [] })
    const adapter = elevenlabsTranscription('scribe_v1', { apiKey: 'k' })

    const buffer = new Uint8Array([1, 2, 3]).buffer

    await adapter.transcribe({
      model: 'scribe_v1',
      audio: buffer,
      logger: makeLogger(),
    })

    const body = convertMock.mock.calls[0]![0]
    expect(body.file).toBeInstanceOf(Blob)
  })

  it('builds word-level + diarized segments from the response', async () => {
    convertMock.mockResolvedValue({
      text: 'hello world hi there',
      languageCode: 'eng',
      words: [
        { text: 'hello', start: 0, end: 0.4, type: 'word', speakerId: 's1' },
        { text: 'world', start: 0.4, end: 0.9, type: 'word', speakerId: 's1' },
        { text: ' ', start: 0.9, end: 1.0, type: 'spacing' },
        { text: 'hi', start: 1.0, end: 1.3, type: 'word', speakerId: 's2' },
        { text: 'there', start: 1.3, end: 1.8, type: 'word', speakerId: 's2' },
      ],
      audioDurationSecs: 2,
    })
    const adapter = elevenlabsTranscription('scribe_v2', { apiKey: 'k' })

    const result = await adapter.transcribe({
      model: 'scribe_v2',
      audio: new Blob(),
      logger: makeLogger(),
    })

    expect(result.words).toHaveLength(4)
    expect(result.segments).toHaveLength(2)
    expect(result.segments?.[0]).toMatchObject({
      speaker: 's1',
      text: 'hello world',
    })
    expect(result.segments?.[1]).toMatchObject({
      speaker: 's2',
      text: 'hi there',
    })
  })

  it('logs and rethrows SDK errors', async () => {
    convertMock.mockRejectedValue(new Error('stt down'))
    const adapter = elevenlabsTranscription('scribe_v1', { apiKey: 'k' })
    const logger = makeLogger()

    await expect(
      adapter.transcribe({
        model: 'scribe_v1',
        audio: new Blob(),
        logger,
      }),
    ).rejects.toThrow('stt down')
    expect(logger.errors).toHaveBeenCalledWith(
      'elevenlabs.generateTranscription fatal',
      expect.objectContaining({ source: 'elevenlabs.generateTranscription' }),
    )
  })
})
