import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenaiEmbedding } from '../src/adapters/embedding'
import { createOpenaiVideo } from '../src/adapters/video'
import { createOpenaiFiles } from '../src/adapters/files'
import { openaiRealtimeToken } from '../src/realtime/token'

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

describe('openai adapters forward abortSignal to the request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('embedding', async () => {
    const { fetch, signals } = hangingFetch()
    const adapter = createOpenaiEmbedding('text-embedding-3-small', 'k', {
      fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(signals, (abortSignal) =>
      adapter.createEmbeddings({
        model: 'text-embedding-3-small',
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
      const adapter = createOpenaiVideo('sora-2', 'k', {
        fetch,
        maxRetries: 0,
      })
      await expectAbortReachesFetch(signals, (abortSignal) =>
        adapter[method]('video_1', { abortSignal }),
      )
    },
  )

  it.each(['upload', 'get', 'delete'] as const)('files %s', async (method) => {
    const { fetch, signals } = hangingFetch()
    const files = createOpenaiFiles('k', { fetch, maxRetries: 0 })
    await expectAbortReachesFetch(signals, (abortSignal) =>
      method === 'upload'
        ? files.upload({ data: 'AAAA', mimeType: 'image/png' }, { abortSignal })
        : files[method]('file-1', { abortSignal }),
    )
  })

  it('realtime token', async () => {
    const { fetch, signals } = hangingFetch()
    vi.stubGlobal('fetch', fetch)
    vi.stubEnv('OPENAI_API_KEY', 'k')
    const adapter = openaiRealtimeToken()
    await expectAbortReachesFetch(signals, (abortSignal) =>
      adapter.generateToken({ abortSignal }),
    )
  })
})
