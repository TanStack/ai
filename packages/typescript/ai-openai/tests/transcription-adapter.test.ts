import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenaiTranscription } from '../src/adapters/transcription'

const stubAdapterClient = (
  adapter: ReturnType<typeof createOpenaiTranscription>,
  create: unknown,
) => {
  ;(adapter as unknown as {
    client: { audio: { transcriptions: { create: unknown } } }
  }).client = {
    audio: {
      transcriptions: {
        create,
      },
    },
  }
}

describe('OpenAI transcription adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults non-whisper models to verbose_json and maps rich responses', async () => {
    const create = vi.fn().mockResolvedValueOnce({
      text: 'hello world',
      language: 'en',
      duration: 1.25,
      segments: [
        {
          id: 1,
          start: 0,
          end: 1.25,
          text: 'hello world',
          avg_logprob: -0.5,
        },
      ],
      words: [{ word: 'hello', start: 0, end: 0.5 }],
    })

    const adapter = createOpenaiTranscription('gpt-4o-transcribe', 'test-api-key')
    stubAdapterClient(adapter, create)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe',
      audio: new ArrayBuffer(8),
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-transcribe',
        response_format: 'verbose_json',
        stream: false,
      }),
    )
    expect(result.text).toBe('hello world')
    expect(result.language).toBe('en')
    expect(result.duration).toBe(1.25)
    expect(result.segments).toEqual([
      {
        id: 1,
        start: 0,
        end: 1.25,
        text: 'hello world',
        confidence: Math.exp(-0.5),
      },
    ])
    expect(result.words).toEqual([{ word: 'hello', start: 0, end: 0.5 }])
  })

  it('respects explicit whisper response formats and string responses', async () => {
    const create = vi.fn().mockResolvedValueOnce('plain transcript')

    const adapter = createOpenaiTranscription('whisper-1', 'test-api-key')
    stubAdapterClient(adapter, create)

    const result = await adapter.transcribe({
      model: 'whisper-1',
      audio: new ArrayBuffer(8),
      language: 'en',
      prompt: 'Prefer short phrases',
      responseFormat: 'text',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'whisper-1',
        language: 'en',
        prompt: 'Prefer short phrases',
        response_format: 'text',
        stream: false,
      }),
    )
    expect(result.text).toBe('plain transcript')
    expect(result.language).toBe('en')
  })

  it('falls back to an empty string when a non-verbose response has no text field', async () => {
    const create = vi.fn().mockResolvedValueOnce({ segments: [] })

    const adapter = createOpenaiTranscription('gpt-4o-transcribe', 'test-api-key')
    stubAdapterClient(adapter, create)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe',
      audio: new ArrayBuffer(8),
      responseFormat: 'json',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-transcribe',
        response_format: 'json',
        stream: false,
      }),
    )
    expect(result.text).toBe('')
  })

  it('passes modelOptions through to verbose transcription requests', async () => {
    const create = vi.fn().mockResolvedValueOnce({
      text: 'hello world',
      language: 'en',
      duration: 1.25,
      segments: [],
      words: [],
    })

    const adapter = createOpenaiTranscription('gpt-4o-transcribe', 'test-api-key')
    stubAdapterClient(adapter, create)

    await adapter.transcribe({
      model: 'gpt-4o-transcribe',
      audio: new ArrayBuffer(8),
      modelOptions: {
        temperature: 0.3,
        timestamp_granularities: ['word', 'segment'],
      },
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-transcribe',
        response_format: 'verbose_json',
        stream: false,
        temperature: 0.3,
        timestamp_granularities: ['word', 'segment'],
      }),
    )
  })
})
