import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

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

function mockEmptyStream() {
  mocks.betaMessagesCreate.mockResolvedValueOnce(
    (async function* () {
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 },
      }
      yield { type: 'message_stop' }
    })(),
  )
}

async function drain(iterable: AsyncIterable<unknown>) {
  for await (const _ of iterable) {
    // consume
  }
}

describe('anthropic file content source', () => {
  it('maps an anthropic file handle to a file_id source and sends the Files beta', async () => {
    mockEmptyStream()
    const adapter = new AnthropicTextAdapter({ apiKey: 'k' }, 'claude-opus-4-1')

    await drain(
      chat({
        adapter,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', content: 'describe' },
              {
                type: 'image',
                source: {
                  type: 'file',
                  value: 'file_anthropic_123',
                  provider: 'anthropic',
                },
              },
            ],
          },
        ],
      }),
    )

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    const userMsg = payload.messages.at(-1)
    const imageBlock = userMsg.content.find((b: any) => b.type === 'image')
    expect(imageBlock.source).toEqual({
      type: 'file',
      file_id: 'file_anthropic_123',
    })
    expect(payload.betas).toContain('files-api-2025-04-14')
  })

  it('errors when a foreign provider file handle reaches the anthropic adapter', async () => {
    mockEmptyStream()
    const adapter = new AnthropicTextAdapter({ apiKey: 'k' }, 'claude-opus-4-1')

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'file',
                value: 'file-openai-1',
                provider: 'openai',
              },
            },
          ],
        },
      ],
    })) {
      chunks.push(chunk)
    }

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    if (runError?.type === 'RUN_ERROR') {
      expect(runError.message).toMatch(/anthropic/)
    }
  })
})
