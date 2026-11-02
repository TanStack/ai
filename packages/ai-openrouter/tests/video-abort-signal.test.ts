import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenRouterVideo } from '../src/adapters/video'

/**
 * A fetch that fails at once when it gets no signal, and otherwise waits
 * until that signal aborts. `signals` records what each request got.
 */
function hangingFetch() {
  const signals: Array<AbortSignal> = []
  const fetch = (input: unknown, init?: RequestInit): Promise<Response> => {
    // Some SDKs pass a `Request`, others pass `init`.
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined)
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

describe('openrouter video forwards abortSignal to the request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['getVideoStatus', 'getVideo'] as const)('%s', async (method) => {
    const { fetch, signals } = hangingFetch()
    vi.stubGlobal('fetch', fetch)
    const adapter = createOpenRouterVideo('bytedance/seedance-2.0', 'k')
    await expectAbortReachesFetch(signals, (abortSignal) =>
      adapter[method]('job-1', { abortSignal }),
    )
  })
})
