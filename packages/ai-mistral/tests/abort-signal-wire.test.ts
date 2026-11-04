import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createMistralText } from '../src/adapters/text'

const logger = resolveDebugOption(false)

/**
 * A fake `fetch` that never answers. It rejects at once when it gets no abort
 * signal. Otherwise it rejects only when its signal aborts.
 */
function hangingFetch() {
  const signals: Array<AbortSignal> = []
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (!signal) return Promise.reject(new Error('fetch got no abort signal'))
    signals.push(signal)
    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason))
    })
  })
  return { fetch, signals }
}

/** Starts the call, aborts the caller, and expects the request to abort. */
async function expectAbortReachesFetch(
  wire: ReturnType<typeof hangingFetch>,
  start: (signal: AbortSignal) => Promise<unknown>,
) {
  const controller = new AbortController()
  const run = start(controller.signal)
  run.catch(() => {})
  await vi.waitFor(() => expect(wire.fetch).toHaveBeenCalled())
  controller.abort()
  await vi.waitFor(
    () => expect(wire.signals.at(-1)?.aborted, 'request aborted').toBe(true),
    { timeout: 500 },
  )
  await expect(run).rejects.toBeDefined()
}

/** Drains a stream. A RUN_ERROR chunk counts as a rejection. */
async function drain(stream: AsyncIterable<{ type: string }>) {
  for await (const chunk of stream) {
    if (chunk.type === EventType.RUN_ERROR) throw new Error('RUN_ERROR')
  }
}

const model = 'mistral-large-latest'
const messages = [{ role: 'user' as const, content: 'Hi' }]
const outputSchema = { type: 'object', properties: {} }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Mistral text adapter aborts the provider request', () => {
  it('chatStream', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createMistralText(model, 'test-key')
    await expectAbortReachesFetch(wire, (signal) =>
      drain(
        adapter.chatStream({
          threadId: 'thread-1',
          logger,
          model,
          messages,
          request: { signal },
        }),
      ),
    )
  })

  it('structuredOutput', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createMistralText(model, 'test-key')
    await expectAbortReachesFetch(wire, (signal) =>
      adapter.structuredOutput({
        chatOptions: {
          threadId: 'thread-1',
          logger,
          model,
          messages,
          request: { signal },
        },
        outputSchema,
      }),
    )
  })

  // A signal turns off the SDK default timeout, so the adapter keeps it.
  it('structuredOutput keeps timeoutMs when the caller passes a signal', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createMistralText(model, 'test-key', { timeoutMs: 50 })
    const run = adapter.structuredOutput({
      chatOptions: {
        threadId: 'thread-1',
        logger,
        model,
        messages,
        request: { signal: new AbortController().signal },
      },
      outputSchema,
    })
    await expect(run).rejects.toBeDefined()
    expect(wire.signals.at(-1)?.aborted).toBe(true)
  })
})
