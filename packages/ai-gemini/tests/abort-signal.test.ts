import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGeminiEmbedding } from '../src/adapters/embedding'
import { createGeminiVideo } from '../src/adapters/video'
import { createGeminiFiles } from '../src/adapters/files'
import { geminiRealtimeToken } from '../src/realtime/token'

const logger = resolveDebugOption(false)

/**
 * A fetch that fails at once when it gets no signal, and otherwise waits
 * until that signal aborts. `signals` records what each request got.
 */
function hangingFetch() {
  const signals: Array<AbortSignal> = []
  const fetch = (input: unknown, init?: RequestInit): Promise<Response> => {
    // The Interactions client passes a `Request`, the rest pass `init`.
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

describe('gemini adapters forward abortSignal to the request', () => {
  let signals: Array<AbortSignal>

  beforeEach(() => {
    const hanging = hangingFetch()
    signals = hanging.signals
    vi.stubGlobal('fetch', hanging.fetch)
    vi.stubEnv('GOOGLE_API_KEY', 'k')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('embedding', async () => {
    const adapter = createGeminiEmbedding('gemini-embedding-001', 'k')
    await expectAbortReachesFetch(signals, (abortSignal) =>
      adapter.createEmbeddings({
        model: 'gemini-embedding-001',
        input: ['a'],
        logger,
        abortSignal,
      }),
    )
  })

  it.each([
    ['veo', 'veo-3.1-generate-preview'],
    ['omni', 'gemini-omni-1.1-flash'],
  ] as const)('video %s status and download', async (_label, model) => {
    for (const method of ['getVideoStatus', 'getVideo'] as const) {
      signals.length = 0
      const adapter = createGeminiVideo(model, 'k')
      await expectAbortReachesFetch(signals, (abortSignal) =>
        adapter[method]('operations/job-1', { abortSignal }),
      )
    }
  })

  // `upload` is not here: the Gemini SDK does not send a signal for uploads.
  it.each(['get', 'delete'] as const)('files %s', async (method) => {
    const files = createGeminiFiles('k')
    await expectAbortReachesFetch(signals, (abortSignal) =>
      files[method]('files/abc', { abortSignal }),
    )
  })

  it('realtime token', async () => {
    await expectAbortReachesFetch(signals, (abortSignal) =>
      geminiRealtimeToken().generateToken({ abortSignal }),
    )
  })
})
