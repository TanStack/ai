import { describe, expect, it, vi } from 'vitest'
import { createAnthropicFiles } from '../src/adapters/files'

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

describe('anthropic adapters forward abortSignal to the request', () => {
  it.each(['upload', 'get', 'delete'] as const)('files %s', async (method) => {
    const { fetch, signals } = hangingFetch()
    const files = createAnthropicFiles('k', { fetch, maxRetries: 0 })
    await expectAbortReachesFetch(signals, (abortSignal) =>
      method === 'upload'
        ? files.upload({ data: 'AAAA', mimeType: 'image/png' }, { abortSignal })
        : files[method]('file-1', { abortSignal }),
    )
  })
})
