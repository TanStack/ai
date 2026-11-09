import { describe, expect, it } from 'vitest'
import { createAnthropicClient } from '../src/client'

// The Messages call goes through the generated `/v1/messages?beta=true`
// operation. The fetch is injected through the client options.

function recordingFetch(response: () => Response) {
  const requests: Array<Request> = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return response()
  }
  return { fetch, requests }
}

const params = {
  model: 'claude-opus-4-7',
  max_tokens: 64,
  messages: [{ role: 'user' as const, content: 'Hi' }],
}

describe('generated Messages operation', () => {
  it('sends a JSON call and parses the message', async () => {
    const message = { id: 'msg_1', type: 'message', content: [] }
    const { fetch, requests } = recordingFetch(() => Response.json(message))
    const client = createAnthropicClient({
      apiKey: 'k',
      baseURL: 'https://api.anthropic.com',
      fetch,
    })

    const result = await client.beta.messages.create({
      ...params,
      betas: ['b1'],
    })

    expect(result).toEqual(message)
    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(request?.headers.get('content-type')).toBe('application/json')
    expect(request?.headers.get('anthropic-beta')).toBe('b1')
    expect(request?.headers.get('x-api-key')).toBe('k')
    expect(await request?.json()).toEqual(params)
  })

  it('sends a streaming call and parses the SSE events', async () => {
    const sse = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
      'event: ping\ndata: {"type":"ping"}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join('')
    const { fetch, requests } = recordingFetch(
      () =>
        new Response(sse, { headers: { 'content-type': 'text/event-stream' } }),
    )
    const client = createAnthropicClient({
      apiKey: 'k',
      baseURL: 'https://api.anthropic.com',
      fetch,
    })

    const stream = await client.beta.messages.create({
      ...params,
      stream: true,
    })
    const events: Array<unknown> = []
    if (Symbol.asyncIterator in stream) {
      for await (const event of stream) events.push(event)
    }

    expect(events).toEqual([
      { type: 'message_start', message: { id: 'msg_1' } },
      { type: 'message_stop' },
    ])
    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(await request?.json()).toEqual({ ...params, stream: true })
  })
})
