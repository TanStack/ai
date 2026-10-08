import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'

class Responses extends OpenAIBaseResponsesTextAdapter<string> {}

const compacted = {
  id: 'resp_compact_1',
  created_at: 1,
  object: 'response.compaction',
  output: [
    {
      type: 'message',
      id: 'msg_1',
      role: 'user',
      status: 'completed',
      content: [
        { type: 'input_text', text: 'Plan the trip' },
        { type: 'input_image', image_url: 'https://example.com/map.png' },
      ],
    },
    { type: 'compaction', id: 'cmp_1', encrypted_content: 'sealed' },
  ],
  usage: {
    input_tokens: 40,
    output_tokens: 10,
    total_tokens: 50,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  },
}

const done = {
  type: 'response.completed',
  response: { id: 'resp_2', model, status: 'completed', output: [] },
}

/** A client that records each request and answers it with `reply`. */
function recordingClient(reply: (url: string) => Response) {
  const sent: Array<{ url: string; body: unknown; headers: Headers }> = []
  const client = new OpenAI({
    apiKey: 'test-key',
    fetch: async (url, init) => {
      sent.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
      })
      return reply(String(url))
    },
  })
  return { client, sent }
}

describe('Responses adapter compact', () => {
  it('posts the history to /responses/compact and maps the output', async () => {
    const { client, sent } = recordingClient(() => Response.json(compacted))
    const adapter = new Responses(model, 'openai', client)

    const messages = await adapter.compact({
      model,
      messages: [
        { role: 'user', content: 'Plan the trip' },
        { role: 'assistant', content: 'Where to?' },
      ],
      wrapFetch: (next) => (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set('x-trace-id', 'trace-1')
        return next(input, { ...init, headers })
      },
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('https://api.openai.com/v1/responses/compact')
    expect(sent[0]?.headers.get('x-trace-id')).toBe('trace-1')
    expect(sent[0]?.body).toStrictEqual({
      model,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Plan the trip' }],
        },
        {
          type: 'message',
          role: 'assistant',
          content: 'Where to?',
        },
      ],
    })
    expect(messages).toStrictEqual([
      {
        role: 'user',
        content: [
          { type: 'text', content: 'Plan the trip' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/map.png' },
          },
        ],
      },
      {
        role: 'assistant',
        content: null,
        thinking: [
          {
            content: '',
            redacted: true,
            signature:
              '{"type":"compaction","id":"cmp_1","encrypted_content":"sealed"}',
          },
        ],
        metadata: {
          tanstack: {
            source: { provider: 'openai', api: 'openai-responses', model },
          },
        },
      },
    ])
  })

  it('sends the system prompts as instructions and the tools', async () => {
    const { client, sent } = recordingClient(() => Response.json(compacted))
    const adapter = new Responses(model, 'openai', client)

    await adapter.compact({
      model,
      messages: [{ role: 'user', content: 'Plan the trip' }],
      systemPrompts: ['Be brief.', 'Answer in English.'],
      tools: [
        {
          name: 'search',
          description: 'Search the web',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      ],
    })

    expect(sent[0]?.body).toMatchObject({
      instructions: 'Be brief.\nAnswer in English.',
      tools: [{ type: 'function', name: 'search' }],
    })
  })

  it('throws when the result has no compaction item', async () => {
    const { client } = recordingClient(() =>
      Response.json({
        ...compacted,
        output: compacted.output.filter((item) => item.type !== 'compaction'),
      }),
    )
    const adapter = new Responses(model, 'openai', client)

    await expect(
      adapter.compact({
        model,
        messages: [{ role: 'user', content: 'Plan the trip' }],
      }),
    ).rejects.toThrow('no compaction item')
  })

  it('sends the compaction item back as it is on the next call', async () => {
    const { client, sent } = recordingClient(
      () =>
        new Response(`data: ${JSON.stringify(done)}\n\n`, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    )
    const adapter = new Responses(model, 'openai', client)
    const compactedHistory = await new Responses(
      model,
      'openai',
      recordingClient(() => Response.json(compacted)).client,
    ).compact({ model, messages: [{ role: 'user', content: 'Plan the trip' }] })

    for await (const _ of adapter.chatStream({
      logger,
      model,
      messages: [...compactedHistory, { role: 'user', content: 'Go on' }],
    })) {
      // drain
    }

    const body = sent[0]?.body
    expect(body).toMatchObject({
      input: [
        { type: 'message', role: 'user' },
        { type: 'compaction', id: 'cmp_1', encrypted_content: 'sealed' },
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Go on' }],
        },
      ],
    })
  })
})
