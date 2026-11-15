import { describe, expect, it, vi } from 'vitest'
import { RealtimeClient } from '../src'
import type { RealtimeAdapter } from '@tanstack/ai/client'

const token = {
  provider: 'test',
  token: 't',
  expiresAt: Date.now() + 3_600_000,
  config: {},
}

/** An adapter whose connect waits until its `abortSignal` aborts. */
function hangingAdapter() {
  const signals: Array<AbortSignal | undefined> = []
  const adapter: RealtimeAdapter = {
    provider: 'test',
    connect: (_token, _tools, options) => {
      const signal = options?.abortSignal
      signals.push(signal)
      if (!signal) return Promise.reject(new Error('connect had no signal'))
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      })
    },
  }
  return { adapter, signals }
}

describe('RealtimeClient connect abortSignal', () => {
  it('disconnect() aborts a connect that is in progress', async () => {
    const { adapter, signals } = hangingAdapter()
    const onError = vi.fn()
    const client = new RealtimeClient({
      getToken: async () => token,
      adapter,
      onError,
    })

    // Handle the rejection now: it comes while the test still awaits.
    const pending = expect(client.connect()).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    expect(signals[0]!.aborted).toBe(false)

    await client.disconnect()
    expect(signals[0]!.aborted).toBe(true)
    await pending
    expect(client.getSnapshot().status).toBe('idle')
    expect(onError).not.toHaveBeenCalled()
    client.destroy()
  })

  it('a second connect() aborts the setup of the first', async () => {
    const { adapter, signals } = hangingAdapter()
    const onError = vi.fn()
    const client = new RealtimeClient({
      getToken: async () => token,
      adapter,
      onError,
    })

    // Handle each rejection now: it comes while the test still awaits.
    const first = expect(client.connect()).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    const second = expect(client.connect()).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.waitFor(() => expect(signals).toHaveLength(2))

    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
    await first
    expect(onError).not.toHaveBeenCalled()

    await client.disconnect()
    await second
    client.destroy()
  })

  it('a connect error that is not an abort still sets the error state', async () => {
    const client = new RealtimeClient({
      getToken: async () => token,
      adapter: {
        provider: 'test',
        connect: async () => {
          throw new Error('refused')
        },
      },
    })
    await expect(client.connect()).rejects.toThrow('refused')
    expect(client.getSnapshot().status).toBe('error')
    client.destroy()
  })
})
