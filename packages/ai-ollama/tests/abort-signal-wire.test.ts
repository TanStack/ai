import { getEventListeners } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Ollama } from 'ollama'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OllamaTextAdapter, createOllamaChat } from '../src/adapters/text'
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

// `ollama` takes no per-call signal, so with an injected client only the
// stream's own `abort()` can end the request. It needs the response headers,
// so this fake answers at once with a body that never ends.
describe('Ollama abort signal with an injected client', () => {
  it('aborts the stream request when the caller aborts', async () => {
    const signals: Array<AbortSignal> = []
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal
      if (!signal) return Promise.reject(new Error('fetch got no abort signal'))
      signals.push(signal)
      const body = new ReadableStream({
        start(controller) {
          signal.addEventListener('abort', () =>
            controller.error(signal.reason),
          )
        },
      })
      return Promise.resolve(new Response(body))
    })
    const client = new Ollama({ host: 'http://ollama.test', fetch })
    const abortController = new AbortController()
    const run = (async () => {
      for await (const _ of new OllamaTextAdapter(client, model).chatStream({
        threadId: 'thread-1',
        logger,
        model,
        messages,
        request: { signal: abortController.signal },
      })) {
        // drain
      }
    })()

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    abortController.abort()

    await vi.waitFor(
      () => expect(signals.at(-1)?.aborted, 'request aborted').toBe(true),
      { timeout: 500 },
    )
    await run
  })

  it('leaves no abort listener on the signal after the stream ends', async () => {
    const line = `${JSON.stringify({
      model,
      created_at: '2026-11-02T00:00:00Z',
      message: { role: 'assistant', content: 'Hi' },
      done: true,
      done_reason: 'stop',
    })}\n`
    const fetch = vi.fn(() => Promise.resolve(new Response(line)))
    const client = new Ollama({ host: 'http://ollama.test', fetch })
    const adapter = new OllamaTextAdapter(client, model)
    // chat() reuses one signal for every step of the agent loop.
    const { signal } = new AbortController()
    for (let step = 0; step < 2; step++) {
      for await (const _ of adapter.chatStream({
        threadId: 'thread-1',
        logger,
        model,
        messages,
        request: { signal },
      })) {
        // drain
      }
    }

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(getEventListeners(signal, 'abort')).toHaveLength(0)
  })

  it('aborts the request when the consumer stops before the stream ends', async () => {
    const signals: Array<AbortSignal> = []
    const line = `${JSON.stringify({
      model,
      created_at: '2026-11-02T00:00:00Z',
      message: { role: 'assistant', content: 'Hi' },
      done: false,
    })}\n`
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal
      if (!signal) return Promise.reject(new Error('fetch got no abort signal'))
      signals.push(signal)
      // One chunk, then a body that never ends.
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(line))
          signal.addEventListener('abort', () =>
            controller.error(signal.reason),
          )
        },
      })
      return Promise.resolve(new Response(body))
    })
    const client = new Ollama({ host: 'http://ollama.test', fetch })
    const { signal } = new AbortController()
    for await (const chunk of new OllamaTextAdapter(client, model).chatStream({
      threadId: 'thread-1',
      logger,
      model,
      messages,
      request: { signal },
    })) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') break
    }

    expect(signals.at(-1)?.aborted).toBe(true)
  })
})
