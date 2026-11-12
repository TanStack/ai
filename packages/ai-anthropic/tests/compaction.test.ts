import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import { getAnthropicDefaultMaxTokens } from '../src/model-meta'

const logger = resolveDebugOption(false)
const model = 'claude-opus-5-5'

const summary = {
  id: 'msg_compact_1',
  type: 'message',
  role: 'assistant',
  model,
  content: [
    {
      type: 'compaction',
      content: 'The user is naming recipe entities.',
      signature: 'EuYBCkQY',
      encrypted_content: 'sealed',
    },
  ],
  stop_reason: 'compaction',
  stop_sequence: null,
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    iterations: [
      {
        type: 'compaction',
        input_tokens: 144,
        output_tokens: 276,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    ],
  },
}

const message = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model,
  content: [],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 2, output_tokens: 1 },
}

function sse(events: Array<[string, unknown]>) {
  return new Response(
    events
      .map(
        ([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

/** A fetch that records JSON bodies and answers a compact or a chat stream. */
function recordingFetch() {
  const bodies: Array<unknown> = []
  const headers: Array<Headers> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.url.startsWith('data:')) return new Response('')
    headers.push(request.headers)
    const body = (await request.json()) as { compaction?: unknown }
    bodies.push(body)
    if (body.compaction) return Response.json(summary)
    return sse([
      ['message_start', { type: 'message_start', message }],
      ['message_stop', { type: 'message_stop' }],
    ])
  }
  return { fetch, bodies, headers }
}

describe('Anthropic adapter compact', () => {
  it('posts a summarize request and keeps the signed block', async () => {
    const { fetch, bodies, headers } = recordingFetch()
    const usages: Array<unknown> = []
    const adapter = createAnthropicChat(model, 'test-key', { fetch })

    const messages = await adapter.compact({
      model,
      messages: [
        { role: 'user', content: 'Name the entities.' },
        { role: 'assistant', content: 'Recipe and Ingredient.' },
      ],
      systemPrompts: ['Be brief.'],
      tools: [
        {
          name: 'echo',
          description: 'Echo a message',
          inputSchema: {
            type: 'object',
            properties: { msg: { type: 'string' } },
            required: ['msg'],
          },
        },
      ],
      modelOptions: { max_tokens: 4096, context_management: { edits: [] } },
      wrapFetch: (next) => (input, init) => {
        const requestHeaders = new Headers(init?.headers)
        requestHeaders.set('x-trace-id', 'trace-1')
        return next(input, { ...init, headers: requestHeaders })
      },
      addUsage: (usage) => {
        usages.push(usage)
      },
    })

    expect(bodies).toHaveLength(1)
    expect(headers[0]?.get('x-trace-id')).toBe('trace-1')
    expect(headers[0]?.get('anthropic-beta')).toContain('compact-2026-09-04')
    expect(bodies[0]).toMatchObject({
      model,
      max_tokens: 4096,
      stream: false,
      compaction: { type: 'summarize' },
      system: [{ type: 'text', text: 'Be brief.' }],
      tools: [
        {
          name: 'echo',
          input_schema: {
            type: 'object',
            properties: { msg: { type: 'string' } },
            required: ['msg'],
          },
        },
      ],
      messages: [
        { role: 'user', content: 'Name the entities.' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Recipe and Ingredient.' }],
        },
      ],
    })
    // A compaction request cannot carry context_management.
    expect(bodies[0]).not.toHaveProperty('context_management')
    expect(messages).toEqual([
      {
        role: 'assistant',
        content: 'The user is naming recipe entities.',
        metadata: {
          tanstack: {
            source: {
              provider: 'anthropic',
              api: 'anthropic-messages',
              model,
            },
          },
          anthropicCompaction: {
            content: 'The user is naming recipe entities.',
            signature: 'EuYBCkQY',
            encrypted_content: 'sealed',
          },
        },
      },
    ])
    expect(usages[0]).toMatchObject({
      promptTokens: 144,
      completionTokens: 276,
      totalTokens: 420,
    })
  })

  it('uses the non-streaming output ceiling when max_tokens is absent', async () => {
    const { fetch, bodies } = recordingFetch()
    const adapter = createAnthropicChat(model, 'test-key', { fetch })

    await adapter.compact({
      model,
      messages: [{ role: 'user', content: 'Name the entities.' }],
    })

    expect(bodies[0]).toMatchObject({
      max_tokens: getAnthropicDefaultMaxTokens(model, { stream: false }),
    })
  })

  it('throws when the result is not a signed compaction block', async () => {
    const cases = [
      { ...summary, stop_reason: 'end_turn' },
      {
        ...summary,
        content: [
          {
            type: 'compaction',
            content: '',
            signature: 'EuYBCkQY',
          },
        ],
      },
      {
        ...summary,
        content: [
          {
            type: 'compaction',
            content: 'Summary',
            signature: null,
          },
        ],
      },
    ]
    for (const body of cases) {
      const fetch: typeof globalThis.fetch = async (input, init) => {
        const request = new Request(input, init)
        if (request.url.startsWith('data:')) return new Response('')
        return Response.json(body)
      }
      const adapter = createAnthropicChat(model, 'test-key', { fetch })
      const error = await adapter
        .compact({
          model,
          messages: [{ role: 'user', content: 'Name the entities.' }],
        })
        .then(
          () => undefined,
          (thrown: unknown) => thrown,
        )
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toHaveProperty('status')
    }
  })

  it('sends the signed block back first on the next call', async () => {
    const { fetch, bodies, headers } = recordingFetch()
    const adapter = createAnthropicChat(model, 'test-key', { fetch })
    const compacted = await adapter.compact({
      model,
      messages: [{ role: 'user', content: 'Name the entities.' }],
    })

    for await (const _ of adapter.chatStream({
      threadId: 'thread-1',
      logger,
      model,
      messages: [...compacted, { role: 'user', content: 'Go on' }],
    })) {
      // Drain the stream.
    }

    expect(bodies[1]).toMatchObject({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'compaction',
              content: 'The user is naming recipe entities.',
              signature: 'EuYBCkQY',
              encrypted_content: 'sealed',
            },
          ],
        },
        { role: 'user', content: 'Go on' },
      ],
    })
    expect(JSON.stringify(bodies[1])).not.toContain('Name the entities.')
    expect(headers[1]?.get('anthropic-beta')).toContain('compact-2026-09-04')
  })
})
