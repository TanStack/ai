import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChatWithClient } from '../src'
import { customTool } from '../src/tools/custom-tool'
import type { JSONSchema, ModelMessage, TextOptions, Tool } from '@tanstack/ai'
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/beta/messages'
import type { AnthropicTextProviderOptions } from '../src/adapters/text'

const MODEL = 'claude-opus-4-1'
const logger = resolveDebugOption(false)

const SHORT = { type: 'ephemeral' }
const LONG = { type: 'ephemeral', ttl: '1h' }

const wordSchema: JSONSchema = {
  type: 'object',
  properties: { word: { type: 'string' } },
}
const lookup: Tool = {
  name: 'lookup',
  description: 'Look up a word',
  inputSchema: wordSchema,
}
const search: Tool = {
  name: 'search',
  description: 'Search the web',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
}

const userHi: ModelMessage = { role: 'user', content: 'hi' }

/** A user turn, an assistant tool call, and the tool result for it. */
const toolTurn: Array<ModelMessage> = [
  { role: 'user', content: 'Weather in Paris?' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'lookup', arguments: '{"word":"Paris"}' },
      },
    ],
  },
  { role: 'tool', toolCallId: 'call_1', content: '{"temp":20}' },
]

function textStream() {
  return (async function* () {
    yield {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'ok' },
    }
    yield { type: 'content_block_stop', index: 0 }
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 1 },
    }
    yield { type: 'message_stop' }
  })()
}

/** An adapter whose Messages client records each request body. */
function createAdapter(response: unknown) {
  const create = vi.fn((_body: MessageCreateParams) => response)
  const adapter = createAnthropicChatWithClient(MODEL, {
    beta: { messages: { create } },
  })
  return { adapter, create }
}

type SendOptions = Omit<
  TextOptions<AnthropicTextProviderOptions>,
  'model' | 'logger'
>

/** Sends one streaming request and returns the body on the wire. */
async function send(options: SendOptions) {
  const { adapter, create } = createAdapter(textStream())
  for await (const _chunk of adapter.chatStream({
    ...options,
    model: MODEL,
    logger,
  })) {
    // Drain the stream.
  }
  return create.mock.calls[0]![0]
}

/** Counts every cache marker in the body, at any depth. */
function countMarkers(body: MessageCreateParams) {
  return JSON.stringify(body).match(/"cache_control":\{/g)?.length ?? 0
}

describe('Anthropic automatic prompt cache markers', () => {
  it.each([
    ['absent', undefined],
    ['none', { retention: 'none' } as const],
  ])('adds no markers when promptCache is %s', async (_name, promptCache) => {
    const body = await send({
      messages: [userHi],
      systemPrompts: ['Be brief.'],
      tools: [lookup],
      ...(promptCache && { promptCache }),
    })
    expect(countMarkers(body)).toBe(0)
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('short: marks the last tool, the last system block, and the last user block', async () => {
    const body = await send({
      messages: [userHi],
      systemPrompts: ['Be brief.'],
      tools: [lookup, search],
      promptCache: { retention: 'short' },
    })
    expect(body.tools?.[0]).toMatchObject({
      name: 'lookup',
      cache_control: null,
    })
    expect(body.tools?.[1]).toMatchObject({
      name: 'search',
      cache_control: SHORT,
    })
    expect(body.system).toEqual([
      { type: 'text', text: 'Be brief.', cache_control: SHORT },
    ])
    // A string content becomes one marked text block.
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'hi', cache_control: SHORT }],
      },
    ])
    expect(countMarkers(body)).toBe(3)
  })

  it('long: every marker has a 1h ttl', async () => {
    const body = await send({
      messages: [userHi],
      systemPrompts: ['Be brief.'],
      tools: [lookup],
      promptCache: { retention: 'long' },
    })
    expect(body.tools?.[0]).toMatchObject({ cache_control: LONG })
    expect(body.system).toEqual([
      { type: 'text', text: 'Be brief.', cache_control: LONG },
    ])
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'hi', cache_control: LONG }],
      },
    ])
  })

  it.each<[string, Array<ModelMessage>, unknown]>([
    [
      'text',
      [{ role: 'user', content: [{ type: 'text', content: 'hi' }] }],
      { type: 'text', text: 'hi', cache_control: SHORT },
    ],
    [
      'image',
      [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/a.png' },
            },
          ],
        },
      ],
      {
        type: 'image',
        source: { type: 'url', url: 'https://example.com/a.png' },
        cache_control: SHORT,
      },
    ],
    [
      'document',
      [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'url', value: 'https://example.com/a.pdf' },
            },
          ],
        },
      ],
      {
        type: 'document',
        source: { type: 'url', url: 'https://example.com/a.pdf' },
        cache_control: SHORT,
      },
    ],
    [
      'tool_result',
      toolTurn,
      {
        type: 'tool_result',
        tool_use_id: 'call_1',
        content: '{"temp":20}',
        cache_control: SHORT,
      },
    ],
  ])(
    'marks a %s block at the end of the last user message',
    async (_type, messages, lastBlock) => {
      const body = await send({
        messages,
        promptCache: { retention: 'short' },
      })
      const last = body.messages.at(-1)
      expect(last?.role).toBe('user')
      expect(last?.content.at(-1)).toEqual(lastBlock)
    },
  )

  it('does not mark an assistant last message', async () => {
    const body = await send({
      messages: [userHi, { role: 'assistant', content: 'hello' }],
      systemPrompts: ['Be brief.'],
      promptCache: { retention: 'short' },
    })
    expect(body.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ])
    // Only the system block takes a marker.
    expect(countMarkers(body)).toBe(1)
  })

  it('does not mark an empty user string', async () => {
    const body = await send({
      messages: [{ role: 'user', content: '' }],
      promptCache: { retention: 'short' },
    })
    expect(body.messages).toEqual([{ role: 'user', content: '' }])
  })

  it('uses at most 4 markers: system markers go on the last blocks', async () => {
    const body = await send({
      messages: [userHi],
      systemPrompts: ['s1', 's2', 's3', 's4', 's5'],
      tools: [lookup],
      promptCache: { retention: 'short' },
    })
    expect(body.system).toEqual([
      { type: 'text', text: 's1' },
      { type: 'text', text: 's2' },
      { type: 'text', text: 's3' },
      { type: 'text', text: 's4', cache_control: SHORT },
      { type: 'text', text: 's5', cache_control: SHORT },
    ])
    expect(countMarkers(body)).toBe(4)
  })

  it.each<[string, SendOptions]>([
    [
      'system prompt metadata',
      {
        messages: [userHi],
        systemPrompts: [
          { content: 's1', metadata: { cache_control: { type: 'ephemeral' } } },
          's2',
        ],
        tools: [lookup],
      },
    ],
    [
      'content part metadata',
      {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                content: 'hi',
                metadata: { cache_control: { type: 'ephemeral' } },
              },
            ],
          },
        ],
        systemPrompts: ['Be brief.'],
        tools: [lookup],
      },
    ],
    [
      'a content part inside a tool result',
      {
        messages: [
          ...toolTurn.slice(0, 2),
          {
            role: 'tool',
            toolCallId: 'call_1',
            content: [
              {
                type: 'text',
                content: '{"temp":20}',
                metadata: { cache_control: { type: 'ephemeral' } },
              },
            ],
          },
          userHi,
        ],
        systemPrompts: ['Be brief.'],
        tools: [lookup],
      },
    ],
    [
      'tool metadata',
      {
        messages: [userHi],
        systemPrompts: ['Be brief.'],
        tools: [
          {
            ...lookup,
            metadata: { cacheControl: { type: 'ephemeral', ttl: '5m' } },
          },
          search,
        ],
      },
    ],
    [
      'top-level modelOptions.cache_control',
      {
        messages: [userHi],
        systemPrompts: ['Be brief.'],
        tools: [lookup],
        modelOptions: { cache_control: { type: 'ephemeral' } },
      },
    ],
  ])('a manual marker on %s wins: adds no markers', async (_name, options) => {
    const body = await send({ ...options, promptCache: { retention: 'short' } })
    expect(countMarkers(body)).toBe(1)
  })

  it('a custom tool with no cache metadata does not block automatic markers', async () => {
    const body = await send({
      messages: [userHi],
      tools: [customTool('lookup', 'Look up a word', wordSchema)],
      promptCache: { retention: 'short' },
    })
    expect(body.tools?.[0]).toMatchObject({
      name: 'lookup',
      cache_control: SHORT,
    })
    expect(countMarkers(body)).toBe(2)
  })

  it('marks the last block of a tool result merged with a user text', async () => {
    const body = await send({
      messages: [...toolTurn, { role: 'user', content: 'Thanks' }],
      promptCache: { retention: 'short' },
    })
    expect(body.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: '{"temp":20}' },
        { type: 'text', text: 'Thanks', cache_control: SHORT },
      ],
    })
  })

  it('chat() sends markers by default', async () => {
    const { adapter, create } = createAdapter(textStream())
    for await (const _chunk of chat({
      adapter,
      messages: [userHi],
      threadId: 't1',
    })) {
      // Drain the stream.
    }
    expect(create.mock.calls[0]![0].messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'hi', cache_control: SHORT }],
      },
    ])
  })

  it('structured output keeps the system and message markers', async () => {
    const { adapter, create } = createAdapter({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'structured_output',
          input: { word: 'hi' },
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    await adapter.structuredOutput({
      chatOptions: {
        model: MODEL,
        logger,
        messages: [userHi],
        systemPrompts: ['Be brief.'],
        tools: [lookup],
        promptCache: { retention: 'short' },
      },
      outputSchema: {
        type: 'object',
        properties: { word: { type: 'string' } },
        required: ['word'],
      },
    })
    const body = create.mock.calls[0]![0]
    expect(body.system).toEqual([
      { type: 'text', text: 'Be brief.', cache_control: SHORT },
    ])
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'hi', cache_control: SHORT }],
      },
    ])
    // The structured output tool replaces the marked tool.
    expect(countMarkers(body)).toBe(2)
  })
})
