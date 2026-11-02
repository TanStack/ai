import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGroqTranscription } from '../src/adapters/transcription'

const testLogger = resolveDebugOption(false)

describe('Groq transcription usage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the verbose_json duration as billed seconds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ text: 'hello world', language: 'en', duration: 7.5 }),
      ),
    )
    const adapter = createGroqTranscription('whisper-large-v3', 'test-api-key')

    const result = await adapter.transcribe({
      model: 'whisper-large-v3',
      audio: new ArrayBuffer(8),
      logger: testLogger,
    })

    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      billed: { quantity: 7.5, unit: 'seconds' },
    })
  })
})
