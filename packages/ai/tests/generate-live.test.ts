import { describe, expect, it, vi } from 'vitest'
import { generateLive } from '../src/index'
import type { LiveAdapter } from '../src/activities/generateLive/adapter'

function mockLiveAdapter(
  overrides?: Partial<{
    createLive: LiveAdapter['createLive']
  }>,
): LiveAdapter {
  return {
    kind: 'live',
    name: 'mock-live',
    model: 'helios',
    '~types': { providerOptions: {} },
    createLive:
      overrides?.createLive ??
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

describe('generateLive', () => {
  it('returns the adapter session payload', async () => {
    const adapter = mockLiveAdapter()
    const result = await generateLive({
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
    const createLive = vi.fn(async (options) => ({
      id: 'live-2',
      model: options.model,
      token: 'jwt-2',
      expiresAt: 1,
      prompt: options.prompt,
      status: 'ready' as const,
    }))
    const adapter = mockLiveAdapter({ createLive })
    const abort = new AbortController()

    await generateLive({
      adapter,
      prompt: 'a chef tosses noodles in a steel wok',
      abortSignal: abort.signal,
      debug: false,
    })

    expect(createLive).toHaveBeenCalledTimes(1)
    const options = createLive.mock.calls[0]![0]
    expect(options.prompt).toBe('a chef tosses noodles in a steel wok')
    expect(options.model).toBe('helios')
    expect(options.abortSignal).toBe(abort.signal)
  })

  it('rethrows adapter errors', async () => {
    const adapter = mockLiveAdapter({
      createLive: vi.fn(async () => {
        throw new Error('token boom')
      }),
    })

    await expect(
      generateLive({
        adapter,
        prompt: 'x',
        debug: false,
      }),
    ).rejects.toThrow('token boom')
  })
})
