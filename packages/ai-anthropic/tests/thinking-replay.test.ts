import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat, StreamProcessor } from '@tanstack/ai'
import { z } from 'zod'
import { AnthropicTextAdapter } from '../src/adapters/text'
import type { ModelMessage, StreamChunk, Tool } from '@tanstack/ai'

const mocks = vi.hoisted(() => {
  const betaMessagesCreate = vi.fn()
  const client = {
    beta: { messages: { create: betaMessagesCreate } },
    messages: { create: vi.fn() },
  }
  return { betaMessagesCreate, client }
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    beta = mocks.client.beta
    messages = mocks.client.messages
    constructor(_: { apiKey: string }) {}
  }
  return { default: MockAnthropic }
})

type Block = { type: string } & Record<string, unknown>

const adapter = () =>
  new AnthropicTextAdapter({ apiKey: 'test-key' }, 'claude-opus-4-1')

const weather: Tool = {
  name: 'lookup_weather',
  description: 'Return the weather for a city',
  inputSchema: z.object({ location: z.string() }),
  execute: () => 'sunny',
}

/** A stream of raw Anthropic events. */
function stream(events: Array<Record<string, unknown>>) {
  return (async function* () {
    for (const event of events) yield event
  })()
}

const redactedBlock = [
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'redacted_thinking', data: 'opaque-1' },
  },
  { type: 'content_block_stop', index: 0 },
]

function textEvents(index: number, text: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text },
    },
    { type: 'content_block_stop', index },
  ]
}

function end(stopReason: string) {
  return [
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ]
}

/** The raw events of one signed thinking block. */
function thinkingEvents(index: number, thinking: string, signature: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '' },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'thinking_delta', thinking },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'signature_delta', signature },
    },
    { type: 'content_block_stop', index },
  ]
}

/** The raw events of one `lookup_weather` tool_use block. */
function toolUseEvents(index: number, id: string, location: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'tool_use',
        id,
        name: 'lookup_weather',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify({ location }),
      },
    },
    { type: 'content_block_stop', index },
  ]
}

/** A `lookup_weather` tool call of a ModelMessage. */
const weatherCall = (id: string, location: string) => ({
  id,
  type: 'function' as const,
  function: {
    name: 'lookup_weather',
    arguments: JSON.stringify({ location }),
  },
})

/** The replayed tool_use block of `weatherCall(id, location)`. */
const toolUse = (id: string, location: string) => ({
  type: 'tool_use',
  id,
  name: 'lookup_weather',
  input: { location },
})

/** A replayed signed thinking block. */
const signed = (thinking: string, signature: string) => ({
  type: 'thinking',
  thinking,
  signature,
})

/** The content blocks of the last assistant message in a request. */
function assistantBlocks(call: number) {
  const [payload] = mocks.betaMessagesCreate.mock.calls[call]!
  const messages: Array<{ role: string; content: unknown }> = payload.messages
  const assistant = messages.filter((m) => m.role === 'assistant').at(-1)
  return Array.isArray(assistant?.content)
    ? (assistant.content as Array<Block>)
    : []
}

async function drain(iterable: AsyncIterable<unknown>) {
  for await (const _ of iterable) {
    // consume
  }
}

describe('Anthropic replay', () => {
  beforeEach(() => {
    mocks.betaMessagesCreate.mockReset()
  })

  it('marks a failed tool result with is_error', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      stream([...textEvents(0, 'Sorry.'), ...end('end_turn')]),
    )
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'Weather in Atlantis?' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'lookup_weather',
              arguments: '{"location":"Atlantis"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: '{"error":"City not found"}',
        error: 'City not found',
      },
    ]

    await drain(chat({ adapter: adapter(), messages }))

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    const blocks: Array<Block> = payload.messages.flatMap(
      (m: { content: unknown }) => (Array.isArray(m.content) ? m.content : []),
    )
    expect(blocks.find((b) => b.type === 'tool_result')).toMatchObject({
      tool_use_id: 'call-1',
      is_error: true,
    })
  })

  it('sends a redacted thinking block back in the same run', async () => {
    mocks.betaMessagesCreate
      .mockResolvedValueOnce(
        stream([
          ...redactedBlock,
          {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'call-1',
              name: 'lookup_weather',
              input: {},
            },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: {
              type: 'input_json_delta',
              partial_json: '{"location":"Berlin"}',
            },
          },
          { type: 'content_block_stop', index: 1 },
          ...end('tool_use'),
        ]),
      )
      .mockResolvedValueOnce(
        stream([...textEvents(0, 'It is sunny.'), ...end('end_turn')]),
      )

    await drain(
      chat({
        adapter: adapter(),
        messages: [{ role: 'user', content: 'Weather in Berlin?' }],
        tools: [weather],
      }),
    )

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(2)
    expect(assistantBlocks(1).map((b) => b.type)).toEqual([
      'redacted_thinking',
      'tool_use',
    ])
    expect(assistantBlocks(1)[0]).toEqual({
      type: 'redacted_thinking',
      data: 'opaque-1',
    })
  })

  it('ties each encrypted value to its reasoning message by id', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      stream([
        // A signed block with omitted text, the default on newer models.
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: 'sig-1' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'redacted_thinking', data: 'opaque-1' },
        },
        { type: 'content_block_stop', index: 1 },
        ...textEvents(2, 'Hello.'),
        ...end('end_turn'),
      ]),
    )
    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: adapter(),
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk)
    }

    const reasoningIds = chunks.flatMap((c) =>
      c.type === 'REASONING_MESSAGE_START' ? [c.messageId] : [],
    )
    const values = chunks.flatMap((c) =>
      c.type === 'REASONING_ENCRYPTED_VALUE' ? [c] : [],
    )
    expect(values.map((v) => v.encryptedValue)).toEqual(['sig-1', 'opaque-1'])
    // An AG-UI client attaches each value to the message with this id.
    expect(values.map((v) => v.entityId)).toEqual(reasoningIds)
    expect(reasoningIds[0]).not.toMatch(/^redacted_thinking-/)
    expect(reasoningIds[1]).toMatch(/^redacted_thinking-/)
  })

  it('sends a redacted thinking block back on the next turn', async () => {
    mocks.betaMessagesCreate
      .mockResolvedValueOnce(
        stream([
          ...redactedBlock,
          ...textEvents(1, 'Hello.'),
          ...end('end_turn'),
        ]),
      )
      .mockResolvedValueOnce(
        stream([...textEvents(0, 'Again.'), ...end('end_turn')]),
      )
    const first: Array<ModelMessage> = [{ role: 'user', content: 'Hi' }]
    const processor = new StreamProcessor()
    processor.addUserMessage('Hi')
    for await (const chunk of chat({ adapter: adapter(), messages: first })) {
      processor.processChunk(chunk)
    }
    processor.finalizeStream()

    await drain(
      chat({
        adapter: adapter(),
        messages: [
          ...processor.getMessages(),
          { role: 'user', content: 'Say it again.' },
        ],
      }),
    )

    expect(assistantBlocks(1)).toEqual([
      { type: 'redacted_thinking', data: 'opaque-1' },
      { type: 'text', text: 'Hello.' },
    ])
  })

  it('does not end a request in a thinking-only assistant message', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      stream([...textEvents(0, 'Hello.'), ...end('end_turn')]),
    )

    await drain(
      chat({
        adapter: adapter(),
        messages: [
          { role: 'user', content: 'Hi' },
          {
            role: 'assistant',
            content: null,
            thinking: [
              { content: 'I think.', signature: 'sig-1' },
              { content: '', signature: 'opaque-1', redacted: true },
            ],
          },
        ],
      }),
    )

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    expect(payload.messages).toEqual([{ role: 'user', content: 'Hi' }])
  })
})

describe('Anthropic replay block order', () => {
  beforeEach(() => {
    mocks.betaMessagesCreate.mockReset()
  })

  it('sends thinking, tool_use, thinking, tool_use back in that order', async () => {
    mocks.betaMessagesCreate
      .mockResolvedValueOnce(
        stream([
          ...thinkingEvents(0, 'Check Berlin first.', 'sig-1'),
          ...toolUseEvents(1, 'call-1', 'Berlin'),
          ...thinkingEvents(2, 'Now Paris.', 'sig-2'),
          ...toolUseEvents(3, 'call-2', 'Paris'),
          ...end('tool_use'),
        ]),
      )
      .mockResolvedValueOnce(
        stream([...textEvents(0, 'Both are sunny.'), ...end('end_turn')]),
      )

    await drain(
      chat({
        adapter: adapter(),
        messages: [{ role: 'user', content: 'Weather in Berlin and Paris?' }],
        tools: [weather],
      }),
    )

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(2)
    expect(assistantBlocks(1)).toEqual([
      signed('Check Berlin first.', 'sig-1'),
      toolUse('call-1', 'Berlin'),
      signed('Now Paris.', 'sig-2'),
      toolUse('call-2', 'Paris'),
    ])
    // The automatic cache marker (promptCache defaults to 'short') still
    // lands on the last block of the last user message.
    const [payload] = mocks.betaMessagesCreate.mock.calls[1]!
    expect(payload.messages.at(-1).content.at(-1)).toMatchObject({
      type: 'tool_result',
      cache_control: { type: 'ephemeral' },
    })
  })

  it('keeps an emoji whole when thinking splits the text', async () => {
    mocks.betaMessagesCreate
      .mockResolvedValueOnce(
        stream([
          ...thinkingEvents(0, 'Think A.', 'sig-a'),
          ...textEvents(1, 'Done 👍'),
          ...thinkingEvents(2, 'Think B.', 'sig-b'),
          ...textEvents(3, '👋 Bye'),
          ...toolUseEvents(4, 'call-1', 'Berlin'),
          ...end('tool_use'),
        ]),
      )
      .mockResolvedValueOnce(
        stream([...textEvents(0, 'Sunny.'), ...end('end_turn')]),
      )

    await drain(
      chat({
        adapter: adapter(),
        messages: [{ role: 'user', content: 'Weather in Berlin?' }],
        tools: [weather],
      }),
    )

    // Text lengths count UTF-16 code units, so each emoji stays whole.
    expect(assistantBlocks(1)).toEqual([
      signed('Think A.', 'sig-a'),
      { type: 'text', text: 'Done 👍' },
      signed('Think B.', 'sig-b'),
      { type: 'text', text: '👋 Bye' },
      toolUse('call-1', 'Berlin'),
    ])
  })

  it('sends thinking, text, thinking, text back in that order', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      stream([...textEvents(0, 'Next.'), ...end('end_turn')]),
    )
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'Think twice.' },
      {
        role: 'assistant',
        content: 'First.Second.',
        thinking: [
          { content: 'Think A.', signature: 'sig-a' },
          { content: 'Think B.', signature: 'sig-b' },
        ],
        blockOrder: [
          { type: 'thinking', index: 0 },
          { type: 'text', length: 'First.'.length },
          { type: 'thinking', index: 1 },
          { type: 'text', length: 'Second.'.length },
        ],
      },
      { role: 'user', content: 'Go on.' },
    ]

    await drain(chat({ adapter: adapter(), messages }))

    expect(assistantBlocks(0)).toEqual([
      signed('Think A.', 'sig-a'),
      { type: 'text', text: 'First.' },
      signed('Think B.', 'sig-b'),
      { type: 'text', text: 'Second.' },
    ])
  })

  it('skips unsigned thinking at its place and keeps the rest of the order', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      stream([...textEvents(0, 'Next.'), ...end('end_turn')]),
    )
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'Weather in three cities?' },
      {
        role: 'assistant',
        content: null,
        thinking: [
          { content: 'Check Berlin first.', signature: 'sig-1' },
          // Another model wrote this one. It has no signature.
          { content: 'Unsigned note.' },
          { content: 'Then Rome.', signature: 'sig-3' },
        ],
        toolCalls: [
          weatherCall('call-1', 'Berlin'),
          weatherCall('call-2', 'Paris'),
          weatherCall('call-3', 'Rome'),
        ],
        blockOrder: [
          { type: 'thinking', index: 0 },
          { type: 'tool-call', id: 'call-1' },
          { type: 'thinking', index: 1 },
          { type: 'tool-call', id: 'call-2' },
          { type: 'thinking', index: 2 },
          { type: 'tool-call', id: 'call-3' },
        ],
      },
      { role: 'tool', toolCallId: 'call-1', content: 'sunny' },
      { role: 'tool', toolCallId: 'call-2', content: 'rainy' },
      { role: 'tool', toolCallId: 'call-3', content: 'windy' },
    ]

    await drain(chat({ adapter: adapter(), messages, tools: [weather] }))

    expect(assistantBlocks(0)).toEqual([
      signed('Check Berlin first.', 'sig-1'),
      toolUse('call-1', 'Berlin'),
      toolUse('call-2', 'Paris'),
      signed('Then Rome.', 'sig-3'),
      toolUse('call-3', 'Rome'),
    ])
  })

  it("keeps today's order when the map does not fit the message", async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      stream([...textEvents(0, 'Next.'), ...end('end_turn')]),
    )
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'Weather in Berlin and Paris?' },
      {
        role: 'assistant',
        content: null,
        thinking: [
          { content: 'Check Berlin first.', signature: 'sig-1' },
          { content: 'Now Paris.', signature: 'sig-2' },
        ],
        toolCalls: [
          weatherCall('call-1', 'Berlin'),
          weatherCall('call-2', 'Paris'),
        ],
        // call-3 is not a tool call of this message, and call-2 is missing.
        blockOrder: [
          { type: 'thinking', index: 0 },
          { type: 'tool-call', id: 'call-1' },
          { type: 'thinking', index: 1 },
          { type: 'tool-call', id: 'call-3' },
        ],
      },
      { role: 'tool', toolCallId: 'call-1', content: 'sunny' },
      { role: 'tool', toolCallId: 'call-2', content: 'rainy' },
    ]

    await drain(chat({ adapter: adapter(), messages, tools: [weather] }))

    expect(assistantBlocks(0)).toEqual([
      signed('Check Berlin first.', 'sig-1'),
      signed('Now Paris.', 'sig-2'),
      toolUse('call-1', 'Berlin'),
      toolUse('call-2', 'Paris'),
    ])
  })

  it('sends a message in the default order exactly as before', async () => {
    mocks.betaMessagesCreate
      .mockResolvedValueOnce(
        stream([...textEvents(0, 'Next.'), ...end('end_turn')]),
      )
      .mockResolvedValueOnce(
        stream([...textEvents(0, 'Next.'), ...end('end_turn')]),
      )
    const answer: ModelMessage = {
      role: 'assistant',
      content: 'Let me check.',
      thinking: [{ content: 'Check Berlin.', signature: 'sig-1' }],
      toolCalls: [weatherCall('call-1', 'Berlin')],
    }
    const history = (assistant: ModelMessage): Array<ModelMessage> => [
      { role: 'user', content: 'Weather in Berlin?' },
      assistant,
      { role: 'tool', toolCallId: 'call-1', content: 'sunny' },
    ]

    await drain(
      chat({ adapter: adapter(), messages: history(answer), tools: [weather] }),
    )
    await drain(
      chat({
        adapter: adapter(),
        messages: history({
          ...answer,
          // The writers never set a map for the default order. A reader
          // must still send the same request for one.
          blockOrder: [
            { type: 'thinking', index: 0 },
            { type: 'text', length: 'Let me check.'.length },
            { type: 'tool-call', id: 'call-1' },
          ],
        }),
        tools: [weather],
      }),
    )

    const [today] = mocks.betaMessagesCreate.mock.calls[0]!
    const [withMap] = mocks.betaMessagesCreate.mock.calls[1]!
    expect(today.messages[1].content).toEqual([
      signed('Check Berlin.', 'sig-1'),
      { type: 'text', text: 'Let me check.' },
      toolUse('call-1', 'Berlin'),
    ])
    // Both requests have the default automatic markers, in the same places.
    expect(today.messages.at(-1).content.at(-1)).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'call-1',
      cache_control: { type: 'ephemeral' },
    })
    expect(JSON.stringify(withMap)).toBe(JSON.stringify(today))
  })
})
