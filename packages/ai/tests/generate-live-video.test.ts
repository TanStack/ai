import { describe, expect, it, vi } from 'vitest'
import { generateLiveVideo } from '../src/index'
import type { LiveVideoAdapter } from '../src/activities/generateLiveVideo/adapter'

function mockLiveVideoAdapter(
  overrides?: Partial<{
    createLiveVideo: LiveVideoAdapter['createLiveVideo']
  }>,
): LiveVideoAdapter {
  return {
    kind: 'liveVideo',
    name: 'mock-live',
    model: 'helios',
    '~types': { providerOptions: {} },
    createLiveVideo:
      overrides?.createLiveVideo ??
      (async () => ({
        id: 'live-1',
        model: 'reactor/helios',
        token: 'jwt-test',
        expiresAt: Date.now() + 60_000,
        prompt: 'a shot',
        status: 'ready' as const,
      })),
  }
}

describe('generateLiveVideo', () => {
  it('returns the adapter session payload', async () => {
    const adapter = mockLiveVideoAdapter()
    const result = await generateLiveVideo({
      adapter,
      prompt: 'A red sports car',
      debug: false,
    })

    expect(result.token).toBe('jwt-test')
    expect(result.model).toBe('reactor/helios')
    expect(result.prompt).toBe('a shot')
    expect(result.status).toBe('ready')
  })

  it('forwards prompt, model, and abort signal to the adapter', async () => {
    const createLiveVideo = vi.fn(async (options) => ({
      id: 'live-2',
      model: options.model,
      token: 'jwt-2',
      expiresAt: 1,
      prompt: options.prompt,
      status: 'ready' as const,
    }))
    const adapter = mockLiveVideoAdapter({ createLiveVideo })
    const abort = new AbortController()

    await generateLiveVideo({
      adapter,
      prompt: 'a chef tosses noodles in a steel wok',
      abortSignal: abort.signal,
      debug: false,
    })

    expect(createLiveVideo).toHaveBeenCalledTimes(1)
    const options = createLiveVideo.mock.calls[0]![0]
    expect(options.prompt).toBe('a chef tosses noodles in a steel wok')
    expect(options.model).toBe('helios')
    expect(options.abortSignal).toBe(abort.signal)
  })

  it('rethrows adapter errors', async () => {
    const adapter = mockLiveVideoAdapter({
      createLiveVideo: vi.fn(async () => {
        throw new Error('token boom')
      }),
    })

    await expect(
      generateLiveVideo({
        adapter,
        prompt: 'x',
        debug: false,
      }),
    ).rejects.toThrow('token boom')
  })
})
