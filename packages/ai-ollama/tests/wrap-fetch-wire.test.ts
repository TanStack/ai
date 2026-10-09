import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOllamaChat } from '../src/adapters/text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'llama3.2'

const answer = {
  model,
  message: { role: 'assistant', content: '{}' },
  done: true,
  done_reason: 'stop',
}

let sentTag: string | null = null

// The wrapper style of the middleware docs: it reads the headers from `init`.
const addTag: FetchWrapper = (next) => (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('x-wrapped', 'yes')
  return next(input, { ...init, headers })
}

const messages = [{ role: 'user' as const, content: 'Hi' }]

async function streamTag(wrapFetch?: FetchWrapper) {
  const adapter = createOllamaChat(model, 'http://ollama.test')
  for await (const _ of adapter.chatStream({
    logger,
    model,
    messages,
    wrapFetch,
  })) {
    // drain
  }
  return sentTag
}

describe('Ollama wrapFetch', () => {
  beforeEach(() => {
    sentTag = null
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const request = new Request(input, init)
      sentTag = request.headers.get('x-wrapped')
      const body = await request.json()
      return body.stream
        ? new Response(JSON.stringify(answer) + '\n', {
            headers: { 'content-type': 'application/x-ndjson' },
          })
        : Response.json(answer)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the stream request through the wrapper', async () => {
    expect(await streamTag(addTag)).toBe('yes')
  })

  it('sends the same request without a wrapper', async () => {
    expect(await streamTag()).toBe(null)
  })

  it('sends the structured output request through the wrapper', async () => {
    const adapter = createOllamaChat(model, 'http://ollama.test')
    await adapter.structuredOutput({
      chatOptions: { logger, model, messages, wrapFetch: addTag },
      outputSchema: { type: 'object', properties: {} },
    })
    expect(sentTag).toBe('yes')
  })
})
