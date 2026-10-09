import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGroqText } from '../src/adapters/text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'llama-3.3-70b-versatile'
const messages = [{ role: 'user' as const, content: 'Hi' }]

/** A wrapper that adds one header, then calls the next fetch. */
const addTraceHeader: FetchWrapper = (next) => (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('x-trace-id', 'trace-1')
  return next(input, { ...init, headers })
}

type Send = (
  fetch: typeof globalThis.fetch,
  wrapFetch?: FetchWrapper,
) => AsyncIterable<unknown>

const adapters = [
  {
    adapter: 'Chat Completions',
    send: (fetch, wrapFetch) =>
      createGroqText(model, 'test-key', { fetch }).chatStream({
        logger,
        model,
        messages,
        ...(wrapFetch ? { wrapFetch } : {}),
      }),
  },
] satisfies Array<{ adapter: string; send: Send }>

/** Runs one streaming call. Gives back the headers of each sent request. */
async function sentHeaders(send: Send, wrapFetch?: FetchWrapper) {
  const sent: Array<Headers> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    sent.push(new Request(input, init).headers)
    return new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  for await (const _ of send(fetch, wrapFetch)) {
    // drain
  }
  return sent
}

describe.each(adapters)('groq $adapter wrapFetch', ({ send }) => {
  it('sends the header that the wrapper adds', async () => {
    const sent = await sentHeaders(send, addTraceHeader)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.get('x-trace-id')).toBe('trace-1')
    expect(sent[0]?.get('authorization')).toBe('Bearer test-key')
  })

  it('sends no extra header without a wrapper', async () => {
    const sent = await sentHeaders(send)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.get('x-trace-id')).toBeNull()
  })
})
