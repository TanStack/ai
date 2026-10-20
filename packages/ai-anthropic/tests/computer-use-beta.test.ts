import { describe, expect, it, vi } from 'vitest'
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

async function sentBetas(tool: ReturnType<typeof computerUseTool>) {
  mockEmptyStream()
  const adapter = new AnthropicTextAdapter({ apiKey: 'k' }, 'claude-haiku-4-5')
  for await (const _ of chat({
    adapter,
    messages: [{ role: 'user', content: 'Open the browser.' }],
    tools: [tool],
  })) {
    // consume
  }
  const [payload] = mocks.betaMessagesCreate.mock.calls.at(-1)!
  return payload.betas ?? []
}

describe('anthropic computer use beta header', () => {
  it('sends computer_20250124 with the computer-use-2025-01-24 beta', async () => {
    const tool = computerUseTool({
      type: 'computer_20250124',
      name: 'computer',
      display_width_px: 1024,
      display_height_px: 768,
    })
    expect(await sentBetas(tool)).toContain('computer-use-2025-01-24')
  })

  it('sends computer_20241022 with the computer-use-2024-10-22 beta', async () => {
    const tool = computerUseTool({
      type: 'computer_20241022',
      name: 'computer',
      display_width_px: 1024,
      display_height_px: 768,
    })
    expect(await sentBetas(tool)).toContain('computer-use-2024-10-22')
  })
})
