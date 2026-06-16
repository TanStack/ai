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

    await adapter.transcribe({
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
          chunking_strategy: 'auto',
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('speaker diarization options')
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
          known_speaker_references: [
            'data:audio/wav;base64,AAA=',
            'data:audio/wav;base64,BBB=',
          ],
        },
        logger: testLogger,
      }),
    ).rejects.toThrow('matching lengths')
  })
})
