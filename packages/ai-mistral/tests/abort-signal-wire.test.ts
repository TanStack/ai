import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createMistralText } from '../src/adapters/text'

const logger = resolveDebugOption(false)
const model = 'mistral-large-latest'
const messages = [{ role: 'user' as const, content: 'Hi' }]
const outputSchema = { type: 'object', properties: {} }

// The signal of the request that reached `fetch`. Mistral never answers it,
// so only this signal can end it.
let sent: Promise<AbortSignal | undefined>

beforeEach(() => {
  let onSend: (signal: AbortSignal | undefined) => void
  sent = new Promise((resolve) => (onSend = resolve))
  vi.stubGlobal(
    'fetch',
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        // The stream path sends a URL and an init. The SDK sends a Request.
        const signal =
          input instanceof Request ? input.signal : (init?.signal ?? undefined)
        onSend(signal)
        signal?.addEventListener('abort', () => reject(signal.reason))
      }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Mistral abort signal', () => {
  it('aborts the stream request when the caller aborts', async () => {
    const abortController = new AbortController()
    const run = (async () => {
      for await (const _ of chat({
        adapter: createMistralText(model, 'test-key'),
        threadId: 'thread-1',
        messages,
        abortController,
      })) {
        // drain
      }
    })()

    const signal = await sent
    abortController.abort()

    expect(signal?.aborted).toBe(true)
    await run
  })

  it('aborts the structured output request when the caller aborts', async () => {
    const abortController = new AbortController()
    const run = chat({
      adapter: createMistralText(model, 'test-key'),
      threadId: 'thread-1',
      messages,
      outputSchema,
      abortController,
    })

    const signal = await sent
    abortController.abort()

    expect(signal?.aborted).toBe(true)
    await expect(run).rejects.toThrow()
  })

  it('keeps timeoutMs on a structured output call with a signal', async () => {
    const run = createMistralText(model, 'test-key', {
      timeoutMs: 20,
    }).structuredOutput({
      chatOptions: {
        threadId: 'thread-1',
        logger,
        model,
        messages,
        request: { signal: new AbortController().signal },
      },
      outputSchema,
    })

    await expect(run).rejects.toThrow('Request timed out')
  })
})
