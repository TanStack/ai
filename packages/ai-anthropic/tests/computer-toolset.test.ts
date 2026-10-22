import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'
import { computerUseTool } from '../src/tools'

const mocks = vi.hoisted(() => {
  const betaMessagesCreate = vi.fn()
  const client = { beta: { messages: { create: betaMessagesCreate } } }
  return { betaMessagesCreate, client }
})

vi.mock('@anthropic-ai/sdk', () => {
  const { client } = mocks
  class MockAnthropic {
    beta = client.beta
    constructor(_: { apiKey: string }) {}
  }
  return { default: MockAnthropic }
})

function stream(events: Array<unknown>) {
  mocks.betaMessagesCreate.mockResolvedValueOnce(
    (async function* () {
      yield* events
    })(),
  )
}

/** A computer toolset call, as the model streams it. */
function memberCall(index: number, id: string, name: string, json?: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'tool_use',
        id,
        name,
        toolset_name: 'computer',
        input: {},
      },
    },
    ...(json === undefined
      ? []
      : [
          {
            type: 'content_block_delta',
            index,
            delta: { type: 'input_json_delta', partial_json: json },
          },
        ]),
    { type: 'content_block_stop', index },
  ]
}

const end = (stopReason: string) => [
  {
    type: 'message_delta',
    delta: { stop_reason: stopReason },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

const screenshot = [
  {
    type: 'image' as const,
    source: { type: 'data' as const, value: 'AAAA', mimeType: 'image/png' },
  },
]

beforeEach(() => {
  mocks.betaMessagesCreate.mockReset()
})

describe('anthropic computer toolset', () => {
  it('sends the toolset entry with no name and no beta', async () => {
    stream(end('end_turn'))
    const adapter = new AnthropicTextAdapter({ apiKey: 'k' }, 'claude-opus-5-5')

    for await (const _ of chat({
      threadId: 'thread-1',
      adapter,
      messages: [{ role: 'user', content: 'Open the settings.' }],
      tools: [
        computerUseTool({
          type: 'computer_toolset_20260801',
          configs: { zoom: { enabled: false } },
        }),
      ],
    })) {
      // consume
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    // The prompt cache marker can also sit on the entry.
    expect(payload.tools).toMatchObject([
      {
        type: 'computer_toolset_20260801',
        configs: { zoom: { enabled: false } },
      },
    ])
    expect(payload.tools[0]).not.toHaveProperty('name')
    expect(payload.tools[0]).not.toHaveProperty('__kind')
    expect(payload.betas).toBeUndefined()
  })

  it('runs each toolset call as one computer call and sends it back', async () => {
    stream([
      ...memberCall(0, 'toolu_click', 'left_click', '{"coordinate":[500,300]}'),
      ...memberCall(1, 'toolu_shot', 'screenshot'),
      ...end('tool_use'),
    ])
    stream(end('end_turn'))
    const calls: Array<unknown> = []
    const tool = {
      ...computerUseTool({ type: 'computer_toolset_20260801' }),
      execute: (input: unknown) => {
        calls.push(input)
        return calls.length === 1 ? 'OK' : screenshot
      },
    }
    const adapter = new AnthropicTextAdapter({ apiKey: 'k' }, 'claude-opus-5-5')

    for await (const _ of chat({
      threadId: 'thread-1',
      adapter,
      messages: [{ role: 'user', content: 'Click the button.' }],
      tools: [tool],
      toolExecution: 'sequential',
    })) {
      // consume
    }

    expect(calls).toEqual([
      { action: 'left_click', coordinate: [500, 300] },
      { action: 'screenshot' },
    ])
    const [payload] = mocks.betaMessagesCreate.mock.calls[1]!
    const [, assistant, results] = payload.messages
    expect(assistant.content).toEqual([
      {
        type: 'tool_use',
        id: 'toolu_click',
        name: 'left_click',
        toolset_name: 'computer',
        input: { coordinate: [500, 300] },
      },
      {
        type: 'tool_use',
        id: 'toolu_shot',
        name: 'screenshot',
        toolset_name: 'computer',
        input: {},
      },
    ])
    expect(results.content).toMatchObject([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_click',
        toolset_name: 'computer',
        content: 'OK',
      },
      {
        type: 'tool_result',
        tool_use_id: 'toolu_shot',
        toolset_name: 'computer',
        content: [
          {
            type: 'image',
            source: { type: 'base64', data: 'AAAA', media_type: 'image/png' },
          },
        ],
      },
    ])
  })

  it('sends a computer call back as the single tool when the toolset is not in tools', async () => {
    stream(end('end_turn'))
    const adapter = new AnthropicTextAdapter({ apiKey: 'k' }, 'claude-opus-4-6')

    for await (const _ of chat({
      threadId: 'thread-1',
      adapter,
      messages: [
        { role: 'user', content: 'Click the button.' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'toolu_click',
              type: 'function',
              function: {
                name: 'computer',
                arguments: '{"action":"left_click","coordinate":[1,2]}',
              },
            },
          ],
        },
        { role: 'tool', toolCallId: 'toolu_click', content: 'OK' },
      ],
      tools: [
        computerUseTool({
          type: 'computer_20251124',
          name: 'computer',
          display_width_px: 1024,
          display_height_px: 768,
        }),
      ],
    })) {
      // consume
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    expect(payload.betas).toContain('computer-use-2025-11-24')
    const [, assistant, results] = payload.messages
    expect(assistant.content).toEqual([
      {
        type: 'tool_use',
        id: 'toolu_click',
        name: 'computer',
        input: { action: 'left_click', coordinate: [1, 2] },
      },
    ])
    expect(results.content[0]).not.toHaveProperty('toolset_name')
  })
})
