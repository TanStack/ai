import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  OpenAITranscriptionAdapter,
  createOpenaiTranscription,
} from '../src/adapters/transcription'
import type OpenAI from 'openai'
import type { OpenAITranscriptionModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

class TestOpenAITranscriptionAdapter<
  TModel extends OpenAITranscriptionModel,
> extends OpenAITranscriptionAdapter<TModel> {
  spyOnTranscriptionsCreate() {
    return vi.spyOn(this.client.audio.transcriptions, 'create')
  }
}

describe('OpenAI transcription adapter', () => {
  it('creates a diarization-capable adapter', () => {
    const adapter = createOpenaiTranscription(
      'gpt-4o-transcribe-diarize',
      'test-api-key',
    )

    expect(adapter).toBeInstanceOf(OpenAITranscriptionAdapter)
    expect(adapter.name).toBe('openai')
  })

  it('defaults the diarization model to diarized_json with automatic chunking', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'Agent: Hello\nCustomer: Hi',
      duration: 2.2,
      task: 'transcribe',
      segments: [
        {
          id: 'seg_0',
          type: 'transcript.text.segment',
          start: 0,
          end: 1.4,
          text: 'Hello',
          speaker: 'agent',
        },
        {
          id: 'seg_1',
          type: 'transcript.text.segment',
          start: 1.5,
          end: 2.2,
          text: 'Hi',
          speaker: 'customer',
        },
      ],
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'meeting.wav', { type: 'audio/wav' }),
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-transcribe-diarize',
        response_format: 'diarized_json',
        chunking_strategy: 'auto',
      }),
    )
    expect(result.text).toBe('Agent: Hello\nCustomer: Hi')
    expect(result.segments).toEqual([
      {
        id: 0,
        start: 0,
        end: 1.4,
        text: 'Hello',
        speaker: 'agent',
      },
      {
        id: 1,
        start: 1.5,
        end: 2.2,
        text: 'Hi',
        speaker: 'customer',
      },
    ])
  })

  it('passes explicit diarization chunking and known speaker references', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'Speaker text',
      duration: 1,
      task: 'transcribe',
      segments: [
        {
          id: 'speaker-intro',
          type: 'transcript.text.segment',
          start: 0,
          end: 1,
          text: 'Speaker text',
          speaker: 'agent',
        },
      ],
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'meeting.wav', { type: 'audio/wav' }),
      modelOptions: {
        response_format: 'diarized_json',
        chunking_strategy: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        known_speaker_names: ['agent'],
        known_speaker_references: ['data:audio/wav;base64,AAA='],
      },
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: 'diarized_json',
        chunking_strategy: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        known_speaker_names: ['agent'],
        known_speaker_references: ['data:audio/wav;base64,AAA='],
      }),
    )
    expect(result.segments?.[0]?.id).toBe(0)
  })

  it('uses snake_case modelOptions response_format for diarized output', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'Agent: Hello',
      duration: 1,
      task: 'transcribe',
      segments: [
        {
          id: 'seg_0',
          type: 'transcript.text.segment',
          start: 0,
          end: 1,
          text: 'Hello',
          speaker: 'agent',
        },
      ],
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'meeting.wav', { type: 'audio/wav' }),
      modelOptions: {
        response_format: 'diarized_json',
        chunking_strategy: null,
      },
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: 'diarized_json',
        chunking_strategy: null,
      }),
    )
    expect(result.segments?.[0]?.speaker).toBe('agent')
  })

  it('respects explicit null chunking for short diarization inputs', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'Hello',
      duration: 1,
      task: 'transcribe',
      segments: [],
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'short.wav', { type: 'audio/wav' }),
      modelOptions: {
        chunking_strategy: null,
      },
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        chunking_strategy: null,
      }),
    )
    // Diarized requests always report segments, even when empty — an empty
    // list must not look like a non-diarized result.
    expect(result.segments).toEqual([])
  })

  it('allows json or text response formats for the diarization model', async () => {
    const mockResponse: OpenAI.Audio.Transcription = {
      text: 'Hello',
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'short.wav', { type: 'audio/wav' }),
      responseFormat: 'json',
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: 'json',
        chunking_strategy: 'auto',
      }),
    )
    expect(result).toMatchObject({
      model: 'gpt-4o-transcribe-diarize',
      text: 'Hello',
    })
  })

  it('rejects unsupported response formats for the diarization model', async () => {
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )

    for (const responseFormat of ['srt', 'vtt', 'verbose_json'] as const) {
      await expect(
        adapter.transcribe({
          model: 'gpt-4o-transcribe-diarize',
          audio: new File([], 'audio.wav', { type: 'audio/wav' }),
          responseFormat,
          logger: testLogger,
        }),
      ).rejects.toThrow(
        'diarization transcription models only support json, text, and diarized_json',
      )
    }

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          response_format: 'verbose_json',
        },
        logger: testLogger,
      }),
    ).rejects.toThrow(
      'diarization transcription models only support json, text, and diarized_json',
    )
  })

  it('rejects diarization-only options with non-diarization models', async () => {
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'whisper-1',
    )

    await expect(
      adapter.transcribe({
        model: 'whisper-1',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        responseFormat: 'diarized_json' as never,
        logger: testLogger,
      }),
    ).rejects.toThrow('speaker diarization options')

    await expect(
      adapter.transcribe({
        model: 'whisper-1',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          response_format: 'diarized_json',
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('speaker diarization options')

    await expect(
      adapter.transcribe({
        model: 'whisper-1',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          known_speaker_names: ['agent'],
          known_speaker_references: ['data:audio/wav;base64,AAA='],
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('speaker diarization options')
  })

  it('allows chunking_strategy with non-diarization models', async () => {
    const mockResponse: OpenAI.Audio.Transcription = {
      text: 'Hello',
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    await adapter.transcribe({
      model: 'gpt-4o-transcribe',
      audio: new File([], 'audio.wav', { type: 'audio/wav' }),
      modelOptions: {
        chunking_strategy: 'auto',
      },
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-transcribe',
        chunking_strategy: 'auto',
      }),
    )
  })

  it('rejects unsupported diarization prompt and timestamp options', async () => {
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        prompt: 'Use product vocabulary',
        logger: testLogger,
      }),
    ).rejects.toThrow('do not support prompts')

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          prompt: 'Use product vocabulary',
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('do not support prompts')

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          timestamp_granularities: ['word'],
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('timestamp_granularities')
  })

  it('rejects unsupported diarization include and too many known speakers', async () => {
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          include: ['logprobs'],
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('include')

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          known_speaker_names: ['a', 'b', 'c', 'd', 'e'],
          known_speaker_references: [
            'data:audio/wav;base64,AAA=',
            'data:audio/wav;base64,BBB=',
            'data:audio/wav;base64,CCC=',
            'data:audio/wav;base64,DDD=',
            'data:audio/wav;base64,EEE=',
          ],
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('at most 4')

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          known_speaker_names: ['agent'],
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('must both be provided together')

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          known_speaker_references: ['data:audio/wav;base64,AAA='],
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('must both be provided together')

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        modelOptions: {
          known_speaker_names: ['agent'],
          known_speaker_references: [
            'data:audio/wav;base64,AAA=',
            'data:audio/wav;base64,BBB=',
          ],
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('matching lengths')
  })

  it('accepts exactly 4 known speakers', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'Hello',
      duration: 1,
      task: 'transcribe',
      segments: [],
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    const names = ['a', 'b', 'c', 'd']
    const references = [
      'data:audio/wav;base64,AAA=',
      'data:audio/wav;base64,BBB=',
      'data:audio/wav;base64,CCC=',
      'data:audio/wav;base64,DDD=',
    ]
    await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'audio.wav', { type: 'audio/wav' }),
      modelOptions: {
        known_speaker_names: names,
        known_speaker_references: references,
      },
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        known_speaker_names: names,
        known_speaker_references: references,
      }),
    )
  })

  it('rejects conflicting top-level and modelOptions response formats', async () => {
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        responseFormat: 'json',
        modelOptions: {
          response_format: 'diarized_json',
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('Conflicting response formats')
  })

  it('parses numeric diarized segment ids and guards blank ids', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'One Two',
      duration: 2,
      task: 'transcribe',
      segments: [
        {
          id: 'seg_7',
          type: 'transcript.text.segment',
          start: 0,
          end: 1,
          text: 'One',
          speaker: 'a',
        },
        {
          id: '',
          type: 'transcript.text.segment',
          start: 1,
          end: 2,
          text: 'Two',
          speaker: 'b',
        },
      ],
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    adapter.spyOnTranscriptionsCreate().mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'audio.wav', { type: 'audio/wav' }),
      logger: testLogger,
    })

    // seg_7 parses to 7; the blank id falls back to the array index (1), not
    // Number('') === 0, which would collide with a real seg_0.
    expect(result.segments?.map((s) => s.id)).toEqual([7, 1])
  })

  it('maps token usage and duration for diarized responses', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'Hello',
      duration: 2.5,
      task: 'transcribe',
      segments: [],
      usage: {
        type: 'tokens',
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        input_token_details: { audio_tokens: 8, text_tokens: 2 },
      },
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    adapter.spyOnTranscriptionsCreate().mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'audio.wav', { type: 'audio/wav' }),
      logger: testLogger,
    })

    expect(result.duration).toBe(2.5)
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      promptTokensDetails: { audioTokens: 8, textTokens: 2 },
      completionTokensDetails: { textTokens: 5 },
    })
  })

  it('maps duration-billed usage for diarized responses', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'Hello',
      duration: 2.5,
      task: 'transcribe',
      segments: [],
      usage: { type: 'duration', seconds: 2.5 },
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    adapter.spyOnTranscriptionsCreate().mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'audio.wav', { type: 'audio/wav' }),
      logger: testLogger,
    })

    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationSeconds: 2.5,
    })
  })

  it('honors modelOptions response_format verbose_json for whisper', async () => {
    const mockResponse: OpenAI.Audio.Transcriptions.TranscriptionVerbose = {
      text: 'Hello world',
      duration: 3,
      language: 'en',
      segments: [
        {
          id: 0,
          avg_logprob: 0,
          compression_ratio: 1,
          end: 3,
          no_speech_prob: 0,
          seek: 0,
          start: 0,
          temperature: 0,
          text: 'Hello world',
          tokens: [1, 2],
        },
      ],
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'whisper-1',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    const result = await adapter.transcribe({
      model: 'whisper-1',
      audio: new File([], 'audio.wav', { type: 'audio/wav' }),
      modelOptions: {
        response_format: 'verbose_json',
      },
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: 'verbose_json',
      }),
    )
    expect(result.segments).toEqual([
      { id: 0, start: 0, end: 3, text: 'Hello world', confidence: 1 },
    ])
  })

  it('honors modelOptions response_format text for whisper', async () => {
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'whisper-1',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(
        'Hello world' as unknown as OpenAI.Audio.Transcription,
      )

    const result = await adapter.transcribe({
      model: 'whisper-1',
      audio: new File([], 'audio.wav', { type: 'audio/wav' }),
      modelOptions: {
        response_format: 'text',
      },
      logger: testLogger,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: 'text',
      }),
    )
    expect(result.text).toBe('Hello world')
    expect(result.segments).toBeUndefined()
  })

  it('returns plain text for the diarization model with text format', async () => {
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce('Hello' as unknown as OpenAI.Audio.Transcription)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: new File([], 'audio.wav', { type: 'audio/wav' }),
      responseFormat: 'text',
      logger: testLogger,
    })

    expect(result.text).toBe('Hello')
  })

  it('does not let modelOptions override model, file, or stream', async () => {
    const mockResponse: OpenAI.Audio.TranscriptionDiarized = {
      text: 'Hello',
      duration: 1,
      task: 'transcribe',
      segments: [],
    }
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce(mockResponse)

    const file = new File([], 'audio.wav', { type: 'audio/wav' })
    // Simulates untyped modelOptions passed through from a server route.
    const hostileModelOptions = {
      model: 'whisper-1',
      file: new File([], 'evil.wav'),
      stream: true,
    } as never

    await adapter.transcribe({
      model: 'gpt-4o-transcribe-diarize',
      audio: file,
      modelOptions: hostileModelOptions,
      logger: testLogger,
    })

    const sentRequest = mockCreate.mock.calls[0]?.[0]
    expect(sentRequest?.model).toBe('gpt-4o-transcribe-diarize')
    expect(sentRequest?.file).toBe(file)
    expect(sentRequest).not.toHaveProperty('stream')
  })

  it('throws a descriptive error when a diarized response has no segments', async () => {
    const adapter = new TestOpenAITranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'gpt-4o-transcribe-diarize',
    )
    adapter.spyOnTranscriptionsCreate().mockResolvedValueOnce({
      text: 'Hello',
    } as unknown as OpenAI.Audio.TranscriptionDiarized)

    await expect(
      adapter.transcribe({
        model: 'gpt-4o-transcribe-diarize',
        audio: new File([], 'audio.wav', { type: 'audio/wav' }),
        logger: testLogger,
      }),
    ).rejects.toThrow('did not include segments')
  })
})
