import { describe, expect, it, vi } from 'vitest'
import { generateVoice, getVoiceStatus } from '../src/index'
import { generationParamsFromBody } from '../src/client'
import type { VoiceAdapter } from '../src/activities/generateVoice/adapter'

function mockVoiceAdapter(
  overrides?: Partial<{ generateVoice: VoiceAdapter['generateVoice'] }>,
): VoiceAdapter {
  return {
    kind: 'voice',
    name: 'mock-voice',
    model: 'ttv-test',
    '~types': { providerOptions: {} },
    generateVoice:
      overrides?.generateVoice ??
      (async () => ({
        id: 'voice-1',
        model: 'ttv-test',
        previewText: 'The quick brown fox.',
        voices: [
          { voiceId: 'gen-1', audio: 'AAAA', saved: false },
          { voiceId: 'gen-2', audio: 'BBBB', saved: false },
        ],
      })),
  }
}

describe('generateVoice', () => {
  it('returns the adapter result', async () => {
    const result = await generateVoice({
      adapter: mockVoiceAdapter(),
      prompt: 'A warm, gravelly narrator',
      debug: false,
    })

    expect(result.voices.map((voice) => voice.voiceId)).toEqual([
      'gen-1',
      'gen-2',
    ])
    expect(result.previewText).toBe('The quick brown fox.')
  })

  it('forwards the creation inputs, model, and abort signal to the adapter', async () => {
    const adapterFn = vi.fn(async (options) => ({
      id: 'voice-2',
      model: options.model,
      voices: [{ voiceId: 'gen-9' }],
    }))
    const abort = new AbortController()

    await generateVoice({
      adapter: mockVoiceAdapter({ generateVoice: adapterFn }),
      prompt: 'A calm meditation guide',
      referenceAudio: 'QUJD',
      name: 'Guide',
      description: 'Calm, unhurried',
      abortSignal: abort.signal,
      debug: false,
    })

    const passed = adapterFn.mock.calls[0]![0]
    expect(passed).toMatchObject({
      model: 'ttv-test',
      prompt: 'A calm meditation guide',
      referenceAudio: 'QUJD',
      name: 'Guide',
      description: 'Calm, unhurried',
    })
    expect(passed.abortSignal).toBe(abort.signal)
  })

  it('rejects a call with neither a prompt nor reference audio', async () => {
    const adapterFn = vi.fn()
    await expect(
      generateVoice({
        adapter: mockVoiceAdapter({ generateVoice: adapterFn }),
        name: 'Nameless',
        debug: false,
      }),
    ).rejects.toThrow(/requires `prompt`.*or `referenceAudio`/i)
    expect(adapterFn).not.toHaveBeenCalled()
  })

  it('accepts reference audio alone, for clone-only providers', async () => {
    const result = await generateVoice({
      adapter: mockVoiceAdapter(),
      referenceAudio: 'QUJD',
      debug: false,
    })

    expect(result.voices).toHaveLength(2)
  })

  it('streams the result when asked', async () => {
    const chunks = []
    for await (const chunk of generateVoice({
      adapter: mockVoiceAdapter(),
      prompt: 'A warm, gravelly narrator',
      stream: true,
      debug: false,
    })) {
      chunks.push(chunk)
    }

    expect(chunks.at(0)?.type).toBe('RUN_STARTED')
    expect(chunks.at(-1)?.type).toBe('RUN_FINISHED')
  })
})

describe('voice generation request parsing', () => {
  // Voice is the one kind with two valid input modes, so either key on its own
  // has to identify the body.
  it.each([
    { prompt: 'A warm narrator' },
    { referenceAudio: 'QUJD' },
    { prompt: 'A warm narrator', referenceAudio: 'QUJD' },
  ])('accepts %o', (body) => {
    expect(generationParamsFromBody('voice', body).input).toEqual(body)
  })

  it('rejects a body with neither key', () => {
    expect(() => generationParamsFromBody('voice', { name: 'Guide' })).toThrow(
      /must include prompt or referenceAudio/i,
    )
  })
})

describe('getVoiceStatus', () => {
  // Most providers create a voice in one call. The few that train
  // asynchronously (BytePlus Seed Speech) return `status: 'training'` and are
  // polled until they leave it.
  function mockAsyncVoiceAdapter(
    states: Array<'ready' | 'training' | 'failed'>,
  ): VoiceAdapter {
    const queue = [...states]
    return {
      kind: 'voice',
      name: 'mock-async-voice',
      model: 'clone-test',
      '~types': { providerOptions: {} },
      generateVoice: async () => ({
        id: 'voice-async',
        model: 'clone-test',
        voices: [{ voiceId: 'slot-1', status: 'training' as const, saved: true }],
      }),
      getVoiceStatus: async (voiceId) => ({
        voiceId,
        status: queue.shift() ?? 'ready',
      }),
    }
  }

  it('reports a voice as still training rather than blocking on it', async () => {
    const adapter = mockAsyncVoiceAdapter(['training'])
    const created = await generateVoice({
      adapter,
      referenceAudio: 'QUJD',
      debug: false,
    })

    expect(created.voices[0]).toMatchObject({
      voiceId: 'slot-1',
      status: 'training',
    })

    const polled = await getVoiceStatus({ adapter, voiceId: 'slot-1' })
    expect(polled.status).toBe('training')
  })

  it('polls through to ready', async () => {
    const adapter = mockAsyncVoiceAdapter(['training', 'training', 'ready'])
    const seen: Array<string> = []
    for (let i = 0; i < 3; i++) {
      const polled = await getVoiceStatus({ adapter, voiceId: 'slot-1' })
      seen.push(polled.status)
    }
    expect(seen).toEqual(['training', 'training', 'ready'])
  })

  it('surfaces a failed training run', async () => {
    const adapter = mockAsyncVoiceAdapter(['failed'])
    const polled = await getVoiceStatus({ adapter, voiceId: 'slot-1' })
    expect(polled.status).toBe('failed')
  })

  it('explains itself when the adapter has nothing to poll', async () => {
    // ElevenLabs and xAI finish inside generateVoice(), so they never
    // implement getVoiceStatus. Calling it should say why, not throw a
    // "not a function" TypeError.
    await expect(
      getVoiceStatus({ adapter: mockVoiceAdapter(), voiceId: 'gen-1' }),
    ).rejects.toThrow(/creates a voice in one call/i)
  })
})
