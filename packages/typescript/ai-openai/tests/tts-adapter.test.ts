import { describe, expect, it, vi } from 'vitest'
import { createOpenaiSpeech } from '../src/adapters/tts'

const stubAdapterClient = (
  adapter: ReturnType<typeof createOpenaiSpeech>,
  create: unknown,
) => {
  ;(adapter as unknown as {
    client: { audio: { speech: { create: unknown } } }
  }).client = {
    audio: {
      speech: {
        create,
      },
    },
  }
}

describe('OpenAI TTS adapter', () => {
  it('passes supported instructions through and returns mp3 output metadata', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(new Response(Uint8Array.from([1, 2, 3])))

    const adapter = createOpenaiSpeech('gpt-4o-mini-tts', 'test-api-key')
    stubAdapterClient(adapter, create)

    const result = await adapter.generateSpeech({
      model: 'gpt-4o-mini-tts',
      text: 'hello world',
      modelOptions: {
        instructions: 'Speak calmly',
      },
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini-tts',
        input: 'hello world',
        voice: 'alloy',
        instructions: 'Speak calmly',
      }),
    )
    expect(result.model).toBe('gpt-4o-mini-tts')
    expect(result.format).toBe('mp3')
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.audio).toBe(Buffer.from([1, 2, 3]).toString('base64'))
  })

  it('rejects unsupported instructions before calling the API', async () => {
    const create = vi.fn()

    const adapter = createOpenaiSpeech('tts-1', 'test-api-key')
    stubAdapterClient(adapter, create)

    await expect(
      adapter.generateSpeech({
        model: 'tts-1',
        text: 'hello world',
        modelOptions: {
          instructions: 'Speak calmly',
        },
      }),
    ).rejects.toThrow('The model tts-1 does not support instructions.')

    expect(create).not.toHaveBeenCalled()
  })
})
