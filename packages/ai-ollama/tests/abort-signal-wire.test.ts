import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOllamaChat } from '../src/adapters/text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'llama3.2'
const messages = [{ role: 'user' as const, content: 'Hi' }]

// The request that reached `fetch`. Ollama never answers it, so only its
// signal can end it.
let sent: Promise<RequestInit | undefined>

beforeEach(() => {
  let onSend: (init: RequestInit | undefined) => void
  sent = new Promise((resolve) => (onSend = resolve))
  vi.stubGlobal(
    'fetch',
    (_input: RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        onSend(init)
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        )
      }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Ollama abort signal', () => {
  it('aborts the stream request when the caller aborts', async () => {
    const abortController = new AbortController()
    const run = (async () => {
      for await (const _ of chat({
        threadId: 'thread-1',
        adapter: createOllamaChat(model, 'http://ollama.test'),
        messages,
        abortController,
      })) {
        // drain
      }
    })()

    const init = await sent
    abortController.abort()

    expect(init?.signal?.aborted).toBe(true)
    await run
  })

  it('aborts the structured output request when the caller aborts', async () => {
    const abortController = new AbortController()
    const run = chat({
      threadId: 'thread-1',
      adapter: createOllamaChat(model, 'http://ollama.test'),
      messages,
      outputSchema: { type: 'object', properties: {} },
      abortController,
    })

    const init = await sent
    abortController.abort()

    expect(init?.signal?.aborted).toBe(true)
    await expect(run).rejects.toThrow()
  })

  it('keeps wrapFetch on a call with a signal', async () => {
    let wrapped = false
    const wrapFetch: FetchWrapper = (next) => (input, init) => {
      wrapped = true
      return next(input, init)
    }
    const abortController = new AbortController()
    const run = (async () => {
      for await (const _ of createOllamaChat(
        model,
        'http://ollama.test',
      ).chatStream({
        threadId: 'thread-1',
        logger,
        model,
        messages,
        wrapFetch,
        request: { signal: abortController.signal },
      })) {
        // drain
      }
    })()

    await sent
    abortController.abort()

    expect(wrapped).toBe(true)
    await run
  })
})
