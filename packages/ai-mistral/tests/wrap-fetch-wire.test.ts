import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createMistralText } from '../src/adapters/text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'mistral-large-latest'

const sse = `data: ${JSON.stringify({
  id: 'cmpl-1',
  model,
  choices: [{ index: 0, delta: { content: 'Done' }, finish_reason: 'stop' }],
})}\n\ndata: [DONE]\n\n`

const completion = {
  id: 'cmpl-1',
  object: 'chat.completion',
  model,
  created: 1,
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: '{}' },
      finish_reason: 'stop',
    },
  ],
}

let sentTag: string | null = null
let sentAuth: string | null = null

// The wrapper style of the middleware docs: it reads the headers from `init`.
const addTag: FetchWrapper = (next) => (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('x-wrapped', 'yes')
  return next(input, { ...init, headers })
}

const messages = [{ role: 'user' as const, content: 'Hi' }]

async function streamTag(wrapFetch?: FetchWrapper) {
  const adapter = createMistralText(model, 'test-key')
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

describe('Mistral wrapFetch', () => {
  beforeEach(() => {
    sentTag = null
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const request = new Request(input, init)
      sentTag = request.headers.get('x-wrapped')
      sentAuth = request.headers.get('authorization')
      const body = await request.json()
      return body.stream
        ? new Response(sse, {
            headers: { 'content-type': 'text/event-stream' },
          })
        : Response.json(completion)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the stream request through the wrapper', async () => {
    expect(await streamTag(addTag)).toBe('yes')
    expect(sentAuth).toBe('Bearer test-key')
  })

  it('sends the same request without a wrapper', async () => {
    expect(await streamTag()).toBe(null)
  })

  it('sends the structured output request through the wrapper', async () => {
    const adapter = createMistralText(model, 'test-key')
    await adapter.structuredOutput({
      chatOptions: { logger, model, messages, wrapFetch: addTag },
      outputSchema: { type: 'object', properties: {} },
    })
    expect(sentTag).toBe('yes')
    expect(sentAuth).toBe('Bearer test-key')
  })
})
