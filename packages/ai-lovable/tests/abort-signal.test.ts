import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createLovableEmbedding } from '../src/adapters/embedding'
import { createLovableVideo } from '../src/adapters/video'

const logger = resolveDebugOption(false)

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

describe('lovable adapters forward abortSignal to the request', () => {
  it('embedding', async () => {
    const { fetch, signals } = hangingFetch()
    const adapter = createLovableEmbedding('google/gemini-embedding-001', 'k', {
      fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(signals, (abortSignal) =>
      adapter.createEmbeddings({
        model: 'google/gemini-embedding-001',
        input: ['a'],
        logger,
        abortSignal,
      }),
    )
  })

  it.each(['getVideoStatus', 'getVideo'] as const)(
    'video %s',
    async (method) => {
      const { fetch, signals } = hangingFetch()
      const adapter = createLovableVideo('google/veo-3.1-lite', 'k', {
        fetch,
        maxRetries: 0,
      })
      await expectAbortReachesFetch(signals, (abortSignal) =>
        adapter[method]('job-1', { abortSignal }),
      )
    },
  )
})
