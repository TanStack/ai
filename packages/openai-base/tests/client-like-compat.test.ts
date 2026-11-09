import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import { createOpenAIClient } from '../src/client'
import type { FetchWrapper } from '@tanstack/ai'
import type { ClientOptions } from 'openai'
import type { OpenAIClientLike } from '../src/client'

// Our client streams one chat through the base adapters, with the given
// fetch and wrapFetch. A real `OpenAI` instance no longer fits
// `OpenAIClientLike`: its request types are the SDK params, ours are the
// generated modelschemas bodies.

type Fetch = NonNullable<ClientOptions['fetch']>

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'
const apiKey = 'test-key'

class Completions extends OpenAIBaseChatCompletionsTextAdapter<string> {}
class Responses extends OpenAIBaseResponsesTextAdapter<string> {}

const completionsSSE = `data: ${JSON.stringify({
  id: 'response-1',
  model,
  choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }],
})}\n\ndata: [DONE]\n\n`

const responsesSSE = `data: ${JSON.stringify({
  type: 'response.output_text.delta',
  item_id: 'message-1',
  output_index: 0,
  content_index: 0,
  delta: 'Done',
})}\n\ndata: ${JSON.stringify({
  type: 'response.completed',
  response: {
    id: 'response-1',
    model,
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'message-1',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Done', annotations: [] }],
      },
    ],
  },
})}\n\n`

const clients = [
  {
    client: 'createOpenAIClient()',
    make: (fetch: Fetch) => createOpenAIClient({ apiKey, fetch }),
  },
]

const apis = [
  {
    api: 'Chat Completions',
    url: 'https://api.openai.com/v1/chat/completions',
    sse: completionsSSE,
    adapter: (client: OpenAIClientLike, fetch: Fetch) =>
      new Completions(model, 'openai', client, { fetch }),
  },
  {
    api: 'Responses',
    url: 'https://api.openai.com/v1/responses',
    sse: responsesSSE,
    adapter: (client: OpenAIClientLike, fetch: Fetch) =>
      new Responses(model, 'openai', client, { fetch }),
  },
]

const cases = clients.flatMap((client) =>
  apis.map((api) => ({ ...client, ...api })),
)

/** A wrapper that adds one header, then calls the next fetch. */
const addTraceHeader: FetchWrapper = (next) => (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('x-trace-id', 'trace-1')
  return next(input, { ...init, headers })
}

describe.each(cases)(
  '$api adapter with $client',
  ({ make, adapter, sse, url }) => {
    it('streams one chat through the given fetch and wrapFetch', async () => {
      const sent: Array<{ url: string; headers: Headers; body: unknown }> = []
      const fetch: Fetch = async (input, init) => {
        sent.push({
          url: String(input),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        })
        return new Response(sse, {
          headers: { 'content-type': 'text/event-stream' },
        })
      }

      let text = ''
      for await (const chunk of adapter(make(fetch), fetch).chatStream({
        threadId: 'thread-1',
        logger,
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        wrapFetch: addTraceHeader,
      })) {
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) text += chunk.delta
      }

      expect(text).toBe('Done')
      expect(sent).toHaveLength(1)
      expect(sent[0]?.url).toBe(url)
      expect(sent[0]?.headers.get('authorization')).toBe('Bearer test-key')
      expect(sent[0]?.headers.get('x-trace-id')).toBe('trace-1')
      expect(sent[0]?.body).toMatchObject({ model, stream: true })
    })
  },
)
