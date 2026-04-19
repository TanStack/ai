import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateTranscription } from '@tanstack/ai'

import { falTranscription } from '../src/adapters/transcription'

// Declare mocks at module level
let mockSubscribe: any
let mockConfig: any

// Mock the fal.ai client
vi.mock('@fal-ai/client', () => {
  return {
    fal: {
      subscribe: (...args: Array<unknown>) => mockSubscribe(...args),
      config: (...args: Array<unknown>) => mockConfig(...args),
    },
  }
})

const createAdapter = () =>
  falTranscription('fal-ai/whisper', { apiKey: 'test-key' })

describe('Fal Transcription Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe = vi.fn()
    mockConfig = vi.fn()
  })

  it('transcribes audio URL with correct API call', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        text: 'Hello, this is a test transcription.',
        chunks: [
          {
            text: 'Hello, this is a test transcription.',
            timestamp: [0.0, 2.5],
          },
        ],
      },
      requestId: 'req-transcription-123',
    })

    const adapter = createAdapter()

    const result = await generateTranscription({
      adapter,
      audio: 'https://example.com/audio.mp3',
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)

    const [model, options] = mockSubscribe.mock.calls[0]!
    expect(model).toBe('fal-ai/whisper')
    expect(options.input).toMatchObject({
      audio_url: 'https://example.com/audio.mp3',
    })

    expect(result.text).toBe('Hello, this is a test transcription.')
    expect(result.model).toBe('fal-ai/whisper')
    expect(result.segments).toHaveLength(1)
    expect(result.segments![0]).toMatchObject({
      id: 0,
      start: 0.0,
      end: 2.5,
      text: 'Hello, this is a test transcription.',
    })
  })

  it('handles ArrayBuffer input by converting to Blob', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        text: 'Transcribed text.',
      },
      requestId: 'req-123',
    })

    const adapter = createAdapter()
    const audioBuffer = new ArrayBuffer(16)

    await generateTranscription({
      adapter,
      audio: audioBuffer,
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input.audio_url).toBeInstanceOf(Blob)
  })

  it('maps chunks to segments with timestamps', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        text: 'First sentence. Second sentence.',
        chunks: [
          { text: 'First sentence.', timestamp: [0.0, 1.5] },
          {
            text: 'Second sentence.',
            timestamp: [1.5, 3.0],
            speaker: 'speaker_1',
          },
        ],
      },
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    const result = await generateTranscription({
      adapter,
      audio: 'https://example.com/audio.mp3',
    })

    expect(result.segments).toHaveLength(2)
    expect(result.segments![0]).toMatchObject({
      id: 0,
      start: 0.0,
      end: 1.5,
      text: 'First sentence.',
    })
    expect(result.segments![1]).toMatchObject({
      id: 1,
      start: 1.5,
      end: 3.0,
      text: 'Second sentence.',
      speaker: 'speaker_1',
    })
  })

  it('passes language and model options', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        text: 'Bonjour.',
        language: 'fr',
      },
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    const result = await generateTranscription({
      adapter,
      audio: 'https://example.com/audio.mp3',
      language: 'fr',
      modelOptions: {
        task: 'transcribe',
      } as any,
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      language: 'fr',
      task: 'transcribe',
    })

    expect(result.language).toBe('fr')
  })

  it('extracts language from inferred_languages', async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: {
        text: 'Hello.',
        inferred_languages: ['en', 'fr'],
      },
      requestId: 'req-123',
    })

    const adapter = createAdapter()

    const result = await generateTranscription({
      adapter,
      audio: 'https://example.com/audio.mp3',
    })

    expect(result.language).toBe('en')
  })

  it('configures client with API key', () => {
    falTranscription('fal-ai/whisper', { apiKey: 'my-api-key' })

    expect(mockConfig).toHaveBeenCalledWith({
      credentials: 'my-api-key',
    })
  })

  it('configures client with proxy URL when provided', () => {
    falTranscription('fal-ai/whisper', {
      apiKey: 'my-api-key',
      proxyUrl: '/api/fal/proxy',
    })

    expect(mockConfig).toHaveBeenCalledWith({
      proxyUrl: '/api/fal/proxy',
    })
  })
})
