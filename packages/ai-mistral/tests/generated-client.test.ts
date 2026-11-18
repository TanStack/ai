import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createMistralClient } from '../src/client'
import { createMistralText } from '../src/adapters/text'

const model = 'mistral-large-latest'

type Call = [url: string, init: RequestInit]

describe('generated Mistral client', () => {
  it('sends a JSON chat completion to the generated path', async () => {
    const fetcher = vi
      .fn<(...args: Call) => Promise<Response>>()
      .mockResolvedValue(
        Response.json({
          id: 'cmpl-1',
          object: 'chat.completion',
          model,
          created: 1,
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'hi' },
              finish_reason: 'stop',
            },
          ],
        }),
      )
    const result = await createMistralClient(
      { apiKey: 'k', baseURL: 'https://gw.example/mistral/' },
      fetcher,
    ).chat.complete({ model, messages: [{ role: 'user', content: 'hi' }] })

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://gw.example/mistral/v1/chat/completions')
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('authorization')).toBe('Bearer k')
    expect(JSON.parse(String(init.body))).toMatchObject({
      model,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.usage.totalTokens).toBe(3)
    expect(result.choices[0]?.message?.content).toBe('hi')
  })

  it('streams a chat completion over SSE from the generated path', async () => {
    const sse = [
      { id: 'c', model, choices: [{ index: 0, delta: { content: 'Hel' } }] },
      {
        id: 'c',
        model,
        choices: [
          { index: 0, delta: { content: 'lo' }, finish_reason: 'stop' },
        ],
      },
    ]
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join('')
    const fetcher = vi
      .fn<(...args: Call) => Promise<Response>>()
      .mockResolvedValue(
        new Response(`${sse}data: [DONE]\n\n`, {
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
    const adapter = createMistralText(model, 'k', {
      baseURL: 'https://gw.example/',
    })
    let text = ''
    for await (const chunk of adapter.chatStream({
      threadId: 'thread-1',
      logger: resolveDebugOption(false),
      model,
      messages: [{ role: 'user', content: 'hi' }],
      modelOptions: {
        response_format: {
          type: 'json_schema',
          jsonSchema: { name: 'out', schemaDefinition: { type: 'object' } },
        },
      },
      // The injected HTTP seam: the request never reaches `next`.
      wrapFetch: () => (input, init) => fetcher(String(input), init ?? {}),
    })) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
    }

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://gw.example/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe(
      'application/json',
    )
    expect(JSON.parse(String(init.body))).toMatchObject({
      model,
      stream: true,
      stream_options: { include_usage: true },
      // `modelOptions.response_format` goes out snake_case.
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'out', schema: { type: 'object' } },
      },
    })
    expect(text).toBe('Hello')
  })
})
