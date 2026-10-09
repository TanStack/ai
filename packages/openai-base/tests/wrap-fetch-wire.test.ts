import { afterEach, describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { FetchWrapper } from '@tanstack/ai'
import type { ClientOptions } from 'openai'

type Fetch = NonNullable<ClientOptions['fetch']>

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'
const apiKey = 'test-key'

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
    adapter: (fetch: Fetch) =>
      new Completions(model, 'openai', new OpenAI({ apiKey, fetch }), {
        fetch,
      }),
    sse: `data: ${JSON.stringify(completionsDone)}\n\ndata: [DONE]\n\n`,
  },
  {
    api: 'Responses',
    adapter: (fetch: Fetch) =>
      new Responses(model, 'openai', new OpenAI({ apiKey, fetch }), { fetch }),
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

afterEach(() => vi.unstubAllGlobals())

describe.each(apis)('$api adapter with wrapFetch', ({ adapter, sse }) => {
  /** A fetch that keeps the headers of each sent request. */
  function recordingFetch(sent: Array<Headers>): Fetch {
    return async (_url, init) => {
      sent.push(new Headers(init?.headers))
      return new Response(sse, {
        headers: { 'content-type': 'text/event-stream' },
      })
    }
  }

  /** Runs one streaming call on `instance`. */
  async function stream(
    instance: ReturnType<typeof adapter>,
    wrapFetch?: FetchWrapper,
  ) {
    for await (const _ of instance.chatStream({
      logger,
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      ...(wrapFetch ? { wrapFetch } : {}),
    })) {
      // drain
    }
  }

  /** Runs one streaming call. Gives back the headers of each sent request. */
  async function sentHeaders(wrapFetch?: FetchWrapper) {
    const sent: Array<Headers> = []
    await stream(adapter(recordingFetch(sent)), wrapFetch)
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

  it('sends no header of the wrapper on a later call without one', async () => {
    const sent: Array<Headers> = []
    const instance = adapter(recordingFetch(sent))
    await stream(instance, addHeader('x-trace-id', 'trace-1'))
    await stream(instance)
    expect(sent).toHaveLength(2)
    expect(sent[0]?.get('x-trace-id')).toBe('trace-1')
    expect(sent[1]?.get('x-trace-id')).toBeNull()
  })

  it('wraps the fetch of the config, not the global fetch', async () => {
    const globalFetch = vi.fn<Fetch>()
    vi.stubGlobal('fetch', globalFetch)
    const sent = await sentHeaders(addHeader('x-trace-id', 'trace-1'))
    expect(globalFetch).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.get('x-trace-id')).toBe('trace-1')
  })
})
