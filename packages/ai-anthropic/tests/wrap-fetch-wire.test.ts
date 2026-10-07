import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'claude-haiku-4-5'

const sse = [
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} },
  { type: 'message_stop' },
]
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join('')

const message = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model,
  content: [
    { type: 'tool_use', id: 't1', name: 'structured_output', input: {} },
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: 1, output_tokens: 1 },
}

let sentTag: string | null = null
let sentKey: string | null = null
const baseFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  sentTag = request.headers.get('x-wrapped')
  sentKey = request.headers.get('x-api-key')
  const body = await request.json()
  return body.stream
    ? new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
    : Response.json(message)
}

// The wrapper style of the middleware docs: it reads the headers from `init`.
const addTag: FetchWrapper = (next) => (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('x-wrapped', 'yes')
  return next(input, { ...init, headers })
}

const messages = [{ role: 'user' as const, content: 'Hi' }]

async function streamTag(wrapFetch?: FetchWrapper) {
  sentTag = null
  const adapter = createAnthropicChat(model, 'test-key', { fetch: baseFetch })
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

describe('anthropic wrapFetch', () => {
  it('sends the stream request through the wrapper', async () => {
    expect(await streamTag(addTag)).toBe('yes')
    expect(sentKey).toBe('test-key')
  })

  it('sends the same request without a wrapper', async () => {
    expect(await streamTag()).toBe(null)
  })

  it('sends the structured output request through the wrapper', async () => {
    sentTag = null
    const adapter = createAnthropicChat(model, 'test-key', { fetch: baseFetch })
    await adapter.structuredOutput({
      chatOptions: { logger, model, messages, wrapFetch: addTag },
      outputSchema: { type: 'object', properties: {} },
    })
    expect(sentTag).toBe('yes')
    expect(sentKey).toBe('test-key')
  })
})
