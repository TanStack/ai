import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src'
import type { ChatMiddleware, ModelMessage, ModelReasoning } from '@tanstack/ai'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    beta = { messages: { create: mocks.create } }
    messages = { create: vi.fn() }
    constructor(_: { apiKey: string }) {}
  }
  return { default: MockAnthropic }
})

const logger = resolveDebugOption(false)

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

/** `modelReasoning(record)` of OpenRouter `anthropic/claude-opus-5.5`. */
const MANAGED: ModelReasoning = {
  map: {
    off: null,
    minimal: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  },
  budget: false,
  adaptive: true,
  midConversationEffort: true,
}
const MODEL = 'anthropic/claude-opus-5.5'
const adapter = () =>
  createAnthropicChat(MODEL, 'test-key', { reasoning: MANAGED })

const effortMessage = (effort: string) => ({
  role: 'system',
  content: [],
  output_config: { effort },
})

/** One chat() turn. Returns the request body and the saved transcript. */
async function turn(messages: Array<ModelMessage>, reasoning: 'low' | 'high') {
  mocks.create.mockClear()
  let saved: Array<ModelMessage> = []
  const keep: ChatMiddleware = {
    name: 'keep-transcript',
    onFinish(ctx) {
      saved = [...ctx.messages]
    },
  }
  for await (const _chunk of chat({
    adapter: adapter(),
    messages,
    reasoning,
    middleware: [keep],
    // The cache marker moves to the last user message on each turn
    // (Anthropic's multi-turn pattern). It is not part of the cached
    // content, so this test leaves it out and compares the bytes.
    promptCache: 'none',
  })) {
    // Drain the stream.
  }
  const [body] = mocks.create.mock.calls[0] ?? []
  return { body: body as Record<string, any>, saved }
}

describe('Anthropic mid-conversation effort', () => {
  beforeEach(() => {
    mocks.create.mockReset()
    mocks.create.mockImplementation(() => Promise.resolve(textStream()))
  })

  it('sends the level in the messages and keeps the first request as the prefix', async () => {
    const first = await turn([{ role: 'user', content: 'Hi' }], 'low')
    expect(first.body.thinking).toEqual({
      type: 'adaptive',
      display: 'summarized',
      block_binding: { prefix_mismatch_behavior: 'drop_block' },
    })
    expect(first.body.output_config).toEqual({ effort: 'high' })
    expect(first.body.messages).toEqual([
      { role: 'user', content: 'Hi' },
      effortMessage('low'),
    ])
    // The answer keeps its effort for the next turn.
    expect(first.saved.at(-1)?.metadata?.tanstack?.reasoningEffort).toBe('low')

    // The level changes. The first request stays the start of the second.
    const second = await turn(
      [...first.saved, { role: 'user', content: 'Again' }],
      'high',
    )
    const messages: Array<unknown> = second.body.messages
    expect(JSON.stringify(messages.slice(0, 2))).toBe(
      JSON.stringify(first.body.messages),
    )
    expect(messages.slice(2)).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      { role: 'user', content: 'Again' },
      effortMessage('high'),
    ])
    expect(second.body.thinking.block_binding).toEqual({
      prefix_mismatch_behavior: 'drop_block',
    })
    expect(second.body.output_config).toEqual({ effort: 'high' })
    expect(second.body.betas).toEqual(
      expect.arrayContaining([
        'mid-conversation-output-config-2026-07-01',
        'thinking-binding-controls-2026-08-01',
      ]),
    )
  })

  it('leaves out the effort of another provider and sends high without a level', async () => {
    const foreign: ModelMessage = {
      role: 'assistant',
      content: 'ok',
      metadata: {
        tanstack: {
          source: { provider: 'openai', api: 'openai-responses', model: 'x' },
          reasoningEffort: 'low',
        },
      },
    }
    mocks.create.mockClear()
    for await (const _chunk of adapter().chatStream({
      logger,
      model: MODEL,
      messages: [{ role: 'user', content: 'Hi' }, foreign],
    })) {
      // Drain the stream.
    }
    const [body] = mocks.create.mock.calls[0] ?? []
    expect(
      body.messages.map((message: { role: string }) => message.role),
    ).toEqual(['user', 'assistant', 'system'])
    expect(body.messages.at(-1)).toEqual(effortMessage('high'))
  })

  it('sends no temperature and keeps the cache marker on the last user message', async () => {
    mocks.create.mockClear()
    for await (const _chunk of adapter().chatStream({
      logger,
      model: MODEL,
      messages: [{ role: 'user', content: 'Hi' }],
      reasoning: { level: 'medium', summary: true },
      modelOptions: { temperature: 0.5 },
      promptCache: { retention: 'short' },
    })) {
      // Drain the stream.
    }
    const [body] = mocks.create.mock.calls[0] ?? []
    expect(body).not.toHaveProperty('temperature')
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi', cache_control: { type: 'ephemeral' } },
        ],
      },
      effortMessage('medium'),
    ])
  })
})
