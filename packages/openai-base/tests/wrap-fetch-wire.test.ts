import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'

class Completions extends OpenAIBaseChatCompletionsTextAdapter<string> {}
class Responses extends OpenAIBaseResponsesTextAdapter<string> {}

const completionsDone = {
  id: 'response-1',
  model,
  choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }],
}
const responsesDone = {
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
}

const apis = [
  {
    api: 'Chat Completions',
    adapter: (client: OpenAI) => new Completions(model, 'openai', client),
    sse: `data: ${JSON.stringify(completionsDone)}\n\ndata: [DONE]\n\n`,
  },
  {
    api: 'Responses',
    adapter: (client: OpenAI) => new Responses(model, 'openai', client),
    sse: `data: ${JSON.stringify(responsesDone)}\n\n`,
  },
]

/** A wrapper that adds one header, then calls the next fetch. */
const addHeader =
  (name: string, value: string): FetchWrapper =>
  (next) =>
  (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set(name, value)
    return next(input, { ...init, headers })
  }

describe.each(apis)('$api adapter with wrapFetch', ({ adapter, sse }) => {
  /** Runs one streaming call. Gives back the headers of each sent request. */
  async function sentHeaders(wrapFetch?: FetchWrapper) {
    const sent: Array<Headers> = []
    const client = new OpenAI({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        sent.push(new Headers(init?.headers))
        return new Response(sse, {
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    })
    for await (const _ of adapter(client).chatStream({
      logger,
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      ...(wrapFetch ? { wrapFetch } : {}),
    })) {
      // drain
    }
    return sent
  }

  it('sends the header that the wrapper adds', async () => {
    const sent = await sentHeaders(addHeader('x-trace-id', 'trace-1'))
    expect(sent).toHaveLength(1)
    expect(sent[0]?.get('x-trace-id')).toBe('trace-1')
    expect(sent[0]?.get('authorization')).toBe('Bearer test-key')
  })

  it('runs two chained wrappers in order', async () => {
    const order: Array<string> = []
    const first: FetchWrapper = (next) => (input, init) => {
      order.push('first')
      return addHeader('x-step', 'first')(next)(input, init)
    }
    const second: FetchWrapper = (next) => (input, init) => {
      order.push('second')
      const headers = new Headers(init?.headers)
      headers.set('x-step', `${headers.get('x-step')},second`)
      return next(input, { ...init, headers })
    }
    const sent = await sentHeaders((next) => first(second(next)))
    expect(order).toStrictEqual(['first', 'second'])
    expect(sent[0]?.get('x-step')).toBe('first,second')
  })

  it('sends no extra header without a wrapper', async () => {
    const sent = await sentHeaders()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.get('x-trace-id')).toBeNull()
  })
})
