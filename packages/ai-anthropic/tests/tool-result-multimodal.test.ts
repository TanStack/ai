import { describe, it, expect, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'

const mocks = vi.hoisted(() => {
  const betaMessagesCreate = vi.fn()
  const messagesCreate = vi.fn()

  const client = {
    beta: {
      messages: {
        create: betaMessagesCreate,
      },
    },
    messages: {
      create: messagesCreate,
    },
  }

  return { betaMessagesCreate, messagesCreate, client }
})

vi.mock('@anthropic-ai/sdk', () => {
  const { client } = mocks

  class MockAnthropic {
    beta = client.beta
    messages = client.messages

    constructor(_: { apiKey: string }) {}
  }

  return { default: MockAnthropic }
})

describe('anthropic multimodal tool result', () => {
  it('maps a ContentPart[] tool result to tool_result blocks', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      (async function* () {
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        }
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'done' },
        }
        yield { type: 'content_block_stop', index: 0 }
        yield {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 1 },
        }
        yield { type: 'message_stop' }
      })(),
    )

    const adapter = new AnthropicTextAdapter(
      { apiKey: 'test-key' },
      'claude-opus-4-1',
    )

    for await (const _ of chat({
      adapter,
      messages: [
        { role: 'user', content: 'look' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'tu_1',
              type: 'function',
              function: { name: 'shot', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'tu_1',
          content: [
            { type: 'text', content: 'screenshot' },
            {
              type: 'image',
              source: { type: 'data', value: 'AAAA', mimeType: 'image/png' },
            },
          ],
        },
      ],
    })) {
      // consume stream
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    const toolMsg = payload.messages.find(
      (m: any) =>
        Array.isArray(m.content) && m.content[0]?.type === 'tool_result',
    )
    expect(toolMsg).toBeDefined()
    const block = toolMsg.content[0]
    expect(Array.isArray(block.content)).toBe(true)
    expect(block.content[0]).toEqual({ type: 'text', text: 'screenshot' })
    expect(block.content[1]).toEqual({
      type: 'image',
      source: { type: 'base64', data: 'AAAA', media_type: 'image/png' },
    })
  })
})
