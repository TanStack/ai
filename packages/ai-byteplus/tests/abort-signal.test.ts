import { describe, expect, it, vi } from 'vitest'
import { createBytePlusVideo } from '../src/adapters/video'

/**
 * A fetch that fails at once when it gets no signal, and otherwise waits
 * until that signal aborts. `signals` records what each request got.
 */
function hangingFetch() {
  const signals: Array<AbortSignal> = []
  const fetch = (_input: unknown, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal
    if (!signal) return Promise.reject(new Error('request had no signal'))
    signals.push(signal)
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
    })
  }
  return { fetch, signals }
}

/** Start `call`, wait for its request, abort the caller, expect a rejection. */
async function expectAbortReachesFetch(
  signals: Array<AbortSignal>,
  call: (abortSignal: AbortSignal) => Promise<unknown>,
) {
  const controller = new AbortController()
  const pending = call(controller.signal)
  await vi.waitFor(() => expect(signals).toHaveLength(1))
  expect(signals[0]!.aborted).toBe(false)
  controller.abort()
  await expect(pending).rejects.toThrow()
  expect(signals[0]!.aborted).toBe(true)
}

describe('byteplus adapters forward abortSignal to the request', () => {
  it.each(['getVideoStatus', 'getVideo', 'cancelVideoJob'] as const)(
    'video %s',
    async (method) => {
      const { fetch, signals } = hangingFetch()
      const adapter = createBytePlusVideo('seedance-1-5-pro-251215', 'k', {
        fetch,
      })
      await expectAbortReachesFetch(signals, (abortSignal) =>
        adapter[method]('job-1', { abortSignal }),
      )
    },
  )
})

describe('byteplus cancelVideoJob', () => {
  it('sends DELETE for the task and resolves on success', async () => {
    const calls: Array<{ url: string; method?: string }> = []
    const fetch = async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method })
      return new Response('{}', { status: 200 })
    }
    const adapter = createBytePlusVideo('seedance-1-5-pro-251215', 'k', {
      fetch,
    })
    await adapter.cancelVideoJob('job-1')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('DELETE')
    expect(calls[0]!.url).toMatch(/\/contents\/generations\/tasks\/job-1$/)
  })

  it('rejects when Ark refuses the cancel', async () => {
    const fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: 'x', message: 'task is running' } }),
        { status: 400 },
      )
    const adapter = createBytePlusVideo('seedance-1-5-pro-251215', 'k', {
      fetch,
    })
    await expect(adapter.cancelVideoJob('job-1')).rejects.toThrow(
      /task is running/,
    )
  })
})
