import { describe, expect, it, vi } from 'vitest'
import { generateWorld } from '../src/index'
import type { WorldAdapter } from '../src/activities/generateWorld/adapter'

function mockWorldAdapter(
  overrides?: Partial<{
    createWorld: WorldAdapter['createWorld']
  }>,
): WorldAdapter {
  return {
    kind: 'world',
    name: 'mock-world',
    model: 'visko-orbis-stable',
    '~types': { providerOptions: {} },
    createWorld:
      overrides?.createWorld ??
      (async () => ({
        id: 'world-1',
        model: 'reactor/visko-orbis-stable',
        token: 'jwt-test',
        expiresAt: Date.now() + 60_000,
        prompt: 'a world',
        status: 'ready' as const,
      })),
  }
}

describe('generateWorld', () => {
  it('returns the adapter session payload', async () => {
    const adapter = mockWorldAdapter()
    const result = await generateWorld({
      adapter,
      prompt: 'A neon city',
      debug: false,
    })

    expect(result.token).toBe('jwt-test')
    expect(result.model).toBe('reactor/visko-orbis-stable')
    expect(result.prompt).toBe('a world')
    expect(result.status).toBe('ready')
  })

  it('forwards prompt, model, and abort signal to the adapter', async () => {
    const createWorld = vi.fn(async (options) => ({
      id: 'world-2',
      model: options.model,
      token: 'jwt-2',
      expiresAt: 1,
      prompt: options.prompt,
      status: 'ready' as const,
    }))
    const adapter = mockWorldAdapter({ createWorld })
    const abort = new AbortController()

    await generateWorld({
      adapter,
      prompt: 'black volcanic cliffs',
      abortSignal: abort.signal,
      debug: false,
    })

    expect(createWorld).toHaveBeenCalledTimes(1)
    const options = createWorld.mock.calls[0]![0]
    expect(options.prompt).toBe('black volcanic cliffs')
    expect(options.model).toBe('visko-orbis-stable')
    expect(options.abortSignal).toBe(abort.signal)
  })

  it('rethrows adapter errors', async () => {
    const adapter = mockWorldAdapter({
      createWorld: vi.fn(async () => {
        throw new Error('token boom')
      }),
    })

    await expect(
      generateWorld({
        adapter,
        prompt: 'x',
        debug: false,
      }),
    ).rejects.toThrow('token boom')
  })
})
