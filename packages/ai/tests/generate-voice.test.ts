import { describe, expect, it, vi } from 'vitest'
import { generateVoice, listVoices } from '../src/index'
import { generationParamsFromBody } from '../src/client'
import type { VoiceAdapter } from '../src/activities/generateVoice/adapter'
import type { TTSAdapter } from '../src/activities/generateSpeech/adapter'
import type { ListVoicesOptions } from '../src/types'

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
          {
            voiceId: 'gen-1',
            audio: 'AAAA',
            saved: false,
            status: 'ready' as const,
          },
          {
            voiceId: 'gen-2',
            audio: 'BBBB',
            saved: false,
            status: 'ready' as const,
          },
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
      voices: [{ voiceId: 'gen-9', saved: false, status: 'ready' as const }],
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
    // Composed, not passed through verbatim: asserting identity would pass
    // even with the abort plumbing deleted, because combineAbortSignals
    // returns the caller's signal unchanged when there is no timeout.
    expect(passed.abortSignal).toBeInstanceOf(AbortSignal)
    expect(passed.abortSignal?.aborted).toBe(false)
    abort.abort()
    expect(passed.abortSignal?.aborted).toBe(true)
  })

  it('rejects when the caller aborts an adapter that ignores the signal', async () => {
    const abort = new AbortController()
    const adapter = mockVoiceAdapter({
      // Never settles, and never reads abortSignal — the activity's own race
      // is what has to reject.
      generateVoice: () => new Promise(() => {}),
    })

    const pending = generateVoice({
      adapter,
      prompt: 'A warm, gravelly narrator',
      abortSignal: abort.signal,
      debug: false,
    })
    abort.abort()

    await expect(pending).rejects.toThrow(/abort/i)
  })

  it('rejects on timeout and reports it to middleware as an abort', async () => {
    const onAbort = vi.fn()
    const onError = vi.fn()

    await expect(
      generateVoice({
        adapter: mockVoiceAdapter({
          generateVoice: () => new Promise(() => {}),
        }),
        prompt: 'A warm, gravelly narrator',
        timeout: 10,
        middleware: [{ name: 'spy', onAbort, onError }],
        debug: false,
      }),
    ).rejects.toThrow(/timed out/i)

    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('runs middleware start, usage, and finish for the voice activity', async () => {
    const calls: Array<string> = []
    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      unitsBilled: 1,
      cost: 0.02,
    }

    const result = await generateVoice({
      adapter: mockVoiceAdapter({
        generateVoice: async () => ({
          id: 'voice-mw',
          model: 'ttv-test',
          voices: [{ voiceId: 'gen-1', saved: true, status: 'ready' as const }],
          usage,
        }),
      }),
      prompt: 'A warm, gravelly narrator',
      middleware: [
        {
          name: 'spy',
          onStart: (ctx) => {
            calls.push(`start:${ctx.activity}`)
            // Proves the result transform hook is wired: video regressed here.
            ctx.resultTransforms.push((value) => ({
              ...(value as { voices: Array<{ voiceId: string }> }),
              previewText: 'transformed',
            }))
          },
          onUsage: () => {
            calls.push('usage')
          },
          onFinish: () => {
            calls.push('finish')
          },
        },
      ],
      debug: false,
    })

    expect(calls).toEqual(['start:voice', 'usage', 'finish'])
    expect(result.previewText).toBe('transformed')
  })

  it('reports an adapter failure to middleware as an error', async () => {
    const onError = vi.fn()
    const onAbort = vi.fn()

    await expect(
      generateVoice({
        adapter: mockVoiceAdapter({
          generateVoice: async () => {
            throw new Error('provider exploded')
          },
        }),
        prompt: 'A warm, gravelly narrator',
        middleware: [{ name: 'spy', onError, onAbort }],
        debug: false,
      }),
    ).rejects.toThrow('provider exploded')

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onAbort).not.toHaveBeenCalled()
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

    // The CUSTOM chunk in between is the only thing a client reads.
    const payload = chunks.find(
      (chunk) => chunk.type === 'CUSTOM' && chunk.name === 'generation:result',
    )
    expect(payload).toBeDefined()
    expect(
      (
        payload as { value: { voices: Array<{ voiceId: string }> } }
      ).value.voices.map((voice) => voice.voiceId),
    ).toEqual(['gen-1', 'gen-2'])
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

describe('listVoices', () => {
  function mockSpeechAdapter(
    listVoicesImpl?: TTSAdapter['listVoices'],
  ): TTSAdapter {
    return {
      kind: 'tts',
      name: 'mock-speech',
      model: 'tts-test',
      '~types': { providerOptions: {} },
      generateSpeech: async () => ({
        id: 's1',
        model: 'tts-test',
        audio: '',
        format: 'mp3',
      }),
      ...(listVoicesImpl ? { listVoices: listVoicesImpl } : {}),
    }
  }

  it('returns the adapter catalog and forwards the filter', async () => {
    const impl = vi.fn(async (_options?: ListVoicesOptions) => ({
      voices: [{ voiceId: 'v1', origin: 'generated' as const }],
    }))

    const result = await listVoices({
      adapter: mockSpeechAdapter(impl),
      origins: ['generated'],
    })

    expect(result.voices).toEqual([{ voiceId: 'v1', origin: 'generated' }])
    expect(impl.mock.calls[0]![0]).toMatchObject({ origins: ['generated'] })
  })

  it('points at the const when the provider has a fixed voice set', async () => {
    // OpenAI and Gemini ship their voices as a type union, so calling this
    // should say where to look rather than throw a TypeError.
    await expect(listVoices({ adapter: mockSpeechAdapter() })).rejects.toThrow(
      /no per-account voice catalog/i,
    )
  })
})
