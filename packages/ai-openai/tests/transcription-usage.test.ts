import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAITranscriptionAdapter } from '../src/adapters/transcription'
import type { OpenAITranscriptionModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

/**
 * Test-only subclass exposing the real SDK client's
 * `audio.transcriptions.create` to `vi.spyOn`, mirroring the image-adapter
 * test pattern so the SDK types stay real.
 */
class TestTranscriptionAdapter<
  TModel extends OpenAITranscriptionModel,
> extends OpenAITranscriptionAdapter<TModel> {
  spyOnCreate() {
    return vi.spyOn(this.client.audio.transcriptions, 'create')
  }
}

function audioInput(): ArrayBuffer {
  return new ArrayBuffer(8)
}

describe('OpenAI transcription usage', () => {
  it('surfaces token + modality usage for gpt-4o models', async () => {
    const adapter = new TestTranscriptionAdapter(
      { apiKey: 'test-key' },
      'gpt-4o-transcribe',
    )
    adapter.spyOnCreate().mockResolvedValue({
      text: 'hello world',
      usage: {
        type: 'tokens',
        input_tokens: 50,
        output_tokens: 8,
        total_tokens: 58,
        input_token_details: { audio_tokens: 45, text_tokens: 5 },
      },
    } as never)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe',
      audio: audioInput(),
      logger: testLogger,
    })

    expect(result.usage).toEqual({
      promptTokens: 50,
      completionTokens: 8,
      totalTokens: 58,
      promptTokensDetails: { audioTokens: 45, textTokens: 5 },
      completionTokensDetails: { textTokens: 8 },
    })
  })

  it('omits usage for gpt-4o models when the response has none (no duration fallback)', async () => {
    const adapter = new TestTranscriptionAdapter(
      { apiKey: 'test-key' },
      'gpt-4o-transcribe',
    )
    adapter.spyOnCreate().mockResolvedValue({
      text: 'hello world',
    } as never)

    const result = await adapter.transcribe({
      model: 'gpt-4o-transcribe',
      audio: audioInput(),
      logger: testLogger,
    })

    // Token-billed model with no usage must NOT fall through to a
    // duration-based result.
    expect(result.usage).toBeUndefined()
  })

  it('reports duration-based usage for whisper-1', async () => {
    const adapter = new TestTranscriptionAdapter(
      { apiKey: 'test-key' },
      'whisper-1',
    )
    adapter.spyOnCreate().mockResolvedValue({
      text: 'hello world',
      language: 'en',
      duration: 12.5,
      segments: [],
      words: [],
    } as never)

    const result = await adapter.transcribe({
      model: 'whisper-1',
      audio: audioInput(),
      logger: testLogger,
    })

    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      billed: { quantity: 12.5, unit: 'seconds' },
      durationSeconds: 12.5,
    })
  })
})
