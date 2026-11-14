import { describe, expect, it } from 'vitest'
import { createOpenRouterClient } from '../src/client'

// The client sends chat, responses, and video create through the generated
// operations. The `httpClient` seam sees the final request.

function fakeHttp(respond: () => Response) {
  const sent: Array<Request> = []
  return {
    sent,
    httpClient: {
      request: async (request: Request) => {
        sent.push(request)
        return await Promise.resolve(respond())
      },
    },
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('generated OpenRouter client', () => {
  it('sends a JSON chat completion to the generated path', async () => {
    const { sent, httpClient } = fakeHttp(() =>
      json({
        id: 'gen-1',
        object: 'chat.completion',
        created: 1,
        model: 'openai/gpt-5',
        system_fingerprint: null,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'hi' },
          },
        ],
      }),
    )
    const client = createOpenRouterClient({ apiKey: 'sk-or-test', httpClient })
    const result = await client.chat.send({
      chatRequest: {
        model: 'openai/gpt-5',
        messages: [{ role: 'user', content: 'hello' }],
        maxTokens: 5,
      },
    })

    expect(sent).toHaveLength(1)
    const [request] = sent
    expect(request!.method).toBe('POST')
    expect(request!.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(request!.headers.get('content-type')).toBe('application/json')
    expect(request!.headers.get('authorization')).toBe('Bearer sk-or-test')
    // The body is renamed to the wire (snake_case).
    expect(await request!.json()).toMatchObject({
      model: 'openai/gpt-5',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 5,
    })
    expect(result).toMatchObject({
      id: 'gen-1',
      choices: [{ finishReason: 'stop', message: { content: 'hi' } }],
    })
  })

  it('streams responses events from the generated path under a custom base URL', async () => {
    const delta = (text: string, sequence: number) => ({
      type: 'response.output_text.delta',
      sequence_number: sequence,
      item_id: 'm',
      output_index: 0,
      content_index: 0,
      delta: text,
      logprobs: [],
    })
    const events = [delta('He', 1), delta('y', 2)]
    const sse =
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
      'data: [DONE]\n\n'
    const { sent, httpClient } = fakeHttp(
      () =>
        new Response(sse, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    )
    const client = createOpenRouterClient({
      apiKey: 'sk-or-test',
      serverURL: 'https://proxy.example.com/openrouter/api/v1/',
      httpClient,
    })
    const stream = await client.beta.responses.send({
      responsesRequest: { model: 'openai/gpt-5', input: 'hi', stream: true },
    })

    const received: Array<unknown> = []
    for await (const event of stream) received.push(event)

    const [request] = sent
    expect(request!.method).toBe('POST')
    expect(request!.url).toBe(
      'https://proxy.example.com/openrouter/api/v1/responses',
    )
    expect(request!.headers.get('accept')).toBe('text/event-stream')
    expect(await request!.json()).toMatchObject({
      model: 'openai/gpt-5',
      input: 'hi',
      stream: true,
    })
    expect(received).toMatchObject([
      { type: 'response.output_text.delta', delta: 'He', sequenceNumber: 1 },
      { type: 'response.output_text.delta', delta: 'y', sequenceNumber: 2 },
    ])
  })
})
