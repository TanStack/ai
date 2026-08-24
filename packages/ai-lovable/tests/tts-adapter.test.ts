import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { LovableTTSAdapter, createLovableSpeech } from '../src/adapters/tts'
import type { LovableTTSModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

class TestLovableTTSAdapter<
  TModel extends LovableTTSModel,
> extends LovableTTSAdapter<TModel> {
  spyOnSpeechCreate() {
    return vi.spyOn(this.client.audio.speech, 'create')
  }
}

describe('Lovable TTS adapter', () => {
  it('creates an adapter with the provided API key', () => {
    const adapter = createLovableSpeech(
      'openai/gpt-4o-mini-tts',
      'test-api-key',
    )
    expect(adapter).toBeInstanceOf(LovableTTSAdapter)
    expect(adapter.kind).toBe('tts')
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('openai/gpt-4o-mini-tts')
  })

  it('calls audio.speech.create and returns base64 audio', async () => {
    const adapter = new TestLovableTTSAdapter(
      { apiKey: 'test-api-key' },
      'openai/gpt-4o-mini-tts',
    )
    const bytes = new Uint8Array([1, 2, 3])
    const mockCreate = adapter
      .spyOnSpeechCreate()
      .mockResolvedValueOnce(new Response(bytes))

    const result = await adapter.generateSpeech({
      model: 'openai/gpt-4o-mini-tts',
      text: 'Hello',
      voice: 'nova',
      format: 'mp3',
      logger: testLogger,
      modelOptions: { instructions: 'speak slowly and warmly' },
    })

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'openai/gpt-4o-mini-tts',
      input: 'Hello',
      voice: 'nova',
      response_format: 'mp3',
      instructions: 'speak slowly and warmly',
    })
    expect(result.audio).toBe(Buffer.from(bytes).toString('base64'))
    expect(result.format).toBe('mp3')
    expect(result.contentType).toBe('audio/mpeg')
  })
})
