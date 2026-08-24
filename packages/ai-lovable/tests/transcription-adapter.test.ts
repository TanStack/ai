import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  LovableTranscriptionAdapter,
  createLovableTranscription,
} from '../src/adapters/transcription'
import type { LovableTranscriptionModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

class TestLovableTranscriptionAdapter<
  TModel extends LovableTranscriptionModel,
> extends LovableTranscriptionAdapter<TModel> {
  spyOnTranscriptionsCreate() {
    return vi.spyOn(this.client.audio.transcriptions, 'create')
  }
}

describe('Lovable transcription adapter', () => {
  it('creates an adapter with the provided API key', () => {
    const adapter = createLovableTranscription(
      'openai/gpt-4o-mini-transcribe',
      'test-api-key',
    )
    expect(adapter).toBeInstanceOf(LovableTranscriptionAdapter)
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('openai/gpt-4o-mini-transcribe')
  })

  it('sends the file with json response format by default', async () => {
    const adapter = new TestLovableTranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'openai/gpt-4o-mini-transcribe',
    )
    const mockCreate = adapter
      .spyOnTranscriptionsCreate()
      .mockResolvedValueOnce({
        text: 'hello world',
      })

    const audio = new File([new Uint8Array([1, 2, 3])], 'clip.mp3', {
      type: 'audio/mpeg',
    })
    const abortSignal = new AbortController().signal
    const result = await adapter.transcribe({
      model: 'openai/gpt-4o-mini-transcribe',
      audio,
      language: 'en',
      logger: testLogger,
      abortSignal,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4o-mini-transcribe',
        file: audio,
        language: 'en',
        response_format: 'json',
      }),
      { signal: abortSignal },
    )
    expect(result.text).toBe('hello world')
  })

  it('rejects verbose_json', async () => {
    const adapter = new TestLovableTranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'openai/gpt-4o-transcribe',
    )
    const mockCreate = adapter.spyOnTranscriptionsCreate()

    await expect(
      adapter.transcribe({
        model: 'openai/gpt-4o-transcribe',
        audio: new File([], 'clip.mp3', { type: 'audio/mpeg' }),
        responseFormat: 'verbose_json',
        logger: testLogger,
      }),
    ).rejects.toThrow(/only supports json and text/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('throws when top-level and modelOptions response formats conflict', async () => {
    const adapter = new TestLovableTranscriptionAdapter(
      { apiKey: 'test-api-key' },
      'openai/gpt-4o-mini-transcribe',
    )

    await expect(
      adapter.transcribe({
        model: 'openai/gpt-4o-mini-transcribe',
        audio: new File([], 'clip.mp3', { type: 'audio/mpeg' }),
        responseFormat: 'json',
        modelOptions: { response_format: 'text' },
        logger: testLogger,
      }),
    ).rejects.toThrow(/Conflicting response formats/)
  })
})
