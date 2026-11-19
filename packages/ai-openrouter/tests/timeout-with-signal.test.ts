import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenRouterRerank } from '../src/adapters/rerank'

const logger = resolveDebugOption(false)

/** A fake `fetch` that never answers and rejects once its signal aborts. */
function hangingFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined)
    return new Promise<never>((_resolve, reject) => {
      if (!signal) return
      if (signal.aborted) reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason))
    })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenRouter timeoutMs with a caller abort signal', () => {
  it('still times out when the caller passes an abort signal', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const adapter = createOpenRouterRerank('cohere/rerank-v3.5', 'sk-or-test', {
      timeoutMs: 50,
      retryConfig: { strategy: 'none' },
    })
    const caller = new AbortController()
    const run = adapter.rerank({
      model: 'cohere/rerank-v3.5',
      query: 'rain',
      documents: ['a', 'b'],
      abortSignal: caller.signal,
      logger,
    })
    const outcome = await Promise.race([
      run.then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 1000)),
    ])
    expect(outcome).toBe('rejected')
    expect(caller.signal.aborted).toBe(false)
  })

  it('still aborts when the caller aborts before the timeout', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const adapter = createOpenRouterRerank('cohere/rerank-v3.5', 'sk-or-test', {
      timeoutMs: 60_000,
      retryConfig: { strategy: 'none' },
    })
    const caller = new AbortController()
    const run = adapter.rerank({
      model: 'cohere/rerank-v3.5',
      query: 'rain',
      documents: ['a', 'b'],
      abortSignal: caller.signal,
      logger,
    })
    run.catch(() => {})
    setTimeout(() => caller.abort(), 20)
    await expect(run).rejects.toBeDefined()
  })
})
