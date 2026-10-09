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
        promptCache: 'none',
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
