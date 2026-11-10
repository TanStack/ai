import { describe, expect, it, vi } from 'vitest'
import { createGrokVideo } from '../src/adapters/video'
import { createGrokFiles } from '../src/adapters/files'
import { grokRealtimeToken } from '../src/realtime/token'

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

describe('grok adapters forward abortSignal to the request', () => {
  it.each(['getVideoStatus', 'getVideo'] as const)(
    'video %s',
    async (method) => {
      const { fetch, signals } = hangingFetch()
      const adapter = createGrokVideo('grok-imagine-video', 'k', { fetch })
      await expectAbortReachesFetch(signals, (abortSignal) =>
        adapter[method]('job-1', { abortSignal }),
      )
    },
  )

  it.each(['upload', 'get', 'delete'] as const)('files %s', async (method) => {
    const { fetch, signals } = hangingFetch()
    const files = createGrokFiles('k', { fetch, maxRetries: 0 })
    await expectAbortReachesFetch(signals, (abortSignal) =>
      method === 'upload'
        ? files.upload({ data: 'AAAA', mimeType: 'image/png' }, { abortSignal })
        : files[method]('file-1', { abortSignal }),
    )
  })

  it('realtime token', async () => {
    const { fetch, signals } = hangingFetch()
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('XAI_API_KEY', 'k')
    try {
      await expectAbortReachesFetch(signals, (abortSignal) =>
        grokRealtimeToken().generateToken({ abortSignal }),
      )
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })
})
