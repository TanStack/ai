import { describe, expect, it, vi } from 'vitest'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ModelMessage,
  ToolCall,
} from '@tanstack/ai'
import {
  clearToolResults,
  estimateMessageTokens,
  evictOldest,
  summarizeOldest,
  withCompaction,
} from './index'

// Minimal onConfig driver. The middleware ignores ctx, so a bare stub is fine.
// oxlint-disable-next-line eslint-js/no-restricted-syntax -- test stub; onConfig never reads ctx
const CTX = {} as unknown as ChatMiddlewareContext
function runOnConfig(
  mw: ReturnType<typeof withCompaction>,
  messages: Array<ModelMessage>,
) {
  const config: ChatMiddlewareConfig = {
    messages,
    systemPrompts: [],
    tools: [],
  }
  return mw.onConfig?.(CTX, config)
}

const text = (role: ModelMessage['role'], content: string): ModelMessage => ({
  role,
  content,
})
// ~40 tokens each at chars/4.
const big = (role: ModelMessage['role']) => text(role, 'x'.repeat(160))

const call: ToolCall = {
  id: 't1',
  type: 'function',
  function: { name: 'f', arguments: '{}' },
}

describe('withCompaction', () => {
  it('passes through when under the token budget', async () => {
    const mw = withCompaction({ maxTokens: 1000 })
    const result = await runOnConfig(mw, [
      text('user', 'hi'),
      text('assistant', 'hello'),
    ])
    expect(result).toBeUndefined()
  })

  it('defaults to evictOldest', async () => {
    const mw = withCompaction({ maxTokens: 100 })
    const msgs = [big('user'), big('assistant'), big('user'), big('assistant')]
    const result = await runOnConfig(mw, msgs)
    const out = result?.messages ?? []
    expect(out[0]?.content).toContain('omitted')
    expect(out[out.length - 1]).toBe(msgs[msgs.length - 1])
  })

  it('reports before/after token and message counts via onCompact', async () => {
    const onCompact = vi.fn()
    const mw = withCompaction({ maxTokens: 100, onCompact })
    await runOnConfig(mw, [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ])
    expect(onCompact).toHaveBeenCalledOnce()
    const info = onCompact.mock.calls[0]?.[0]
    expect(info.after).toBeLessThan(info.before)
    expect(info.messagesAfter).toBeLessThan(info.messagesBefore)
  })
})

describe('evictOldest', () => {
  it('keeps the recent tail and drops the head', async () => {
    const mw = withCompaction({
      maxTokens: 100,
      strategy: evictOldest({ keepRecentTokens: 50 }),
    })
    const msgs = [big('user'), big('assistant'), big('user'), big('assistant')]
    const out = (await runOnConfig(mw, msgs))?.messages ?? []
    expect(out[0]?.content).toContain('omitted')
    expect(out[out.length - 1]).toBe(msgs[msgs.length - 1])
  })

  it('never lets the tail start with an orphaned tool result', async () => {
    const assistantCall: ModelMessage = {
      role: 'assistant',
      content: 'x'.repeat(160),
      toolCalls: [call],
    }
    const toolResult: ModelMessage = {
      role: 'tool',
      content: 'x'.repeat(160),
      toolCallId: 't1',
    }
    const msgs = [big('user'), assistantCall, toolResult, big('user')]
    const mw = withCompaction({
      maxTokens: 100,
      strategy: evictOldest({ keepRecentTokens: 45 }),
    })
    const out = (await runOnConfig(mw, msgs))?.messages ?? []
    expect(out.slice(1).some((m) => m.role === 'tool')).toBe(false)
  })
})

describe('summarizeOldest', () => {
  it('replaces the head with a summary', async () => {
    const summarize = vi.fn(async () => 'the gist')
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    const result = await runOnConfig(mw, [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ])
    expect(summarize).toHaveBeenCalledOnce()
    expect(result?.messages?.[0]?.content).toBe(
      'Summary of earlier conversation:\nthe gist',
    )
  })
})

describe('clearToolResults', () => {
  const toolMsg = (id: string): ModelMessage => ({
    role: 'tool',
    content: 'x'.repeat(400),
    toolCallId: id,
  })

  it('stubs old tool results but keeps recent ones and message count', async () => {
    const msgs: Array<ModelMessage> = [
      text('user', 'go'),
      toolMsg('a'),
      toolMsg('b'),
      toolMsg('c'),
      toolMsg('d'),
    ]
    const mw = withCompaction({
      maxTokens: 100,
      strategy: clearToolResults({ keepRecentToolResults: 2 }),
    })
    const out = (await runOnConfig(mw, msgs))?.messages ?? []
    // Same number of messages — structure is untouched.
    expect(out.length).toBe(msgs.length)
    // Oldest two tool results are stubbed.
    expect(out[1]?.content).toBe('[tool output cleared to save context]')
    expect(out[2]?.content).toBe('[tool output cleared to save context]')
    // Two most recent tool results are untouched.
    expect(out[3]?.content).toBe('x'.repeat(400))
    expect(out[4]?.content).toBe('x'.repeat(400))
  })

  it('no-ops when there are not enough tool results to clear', async () => {
    const msgs: Array<ModelMessage> = [big('user'), toolMsg('a'), big('user')]
    const mw = withCompaction({
      maxTokens: 50,
      strategy: clearToolResults({ keepRecentToolResults: 3 }),
    })
    expect(await runOnConfig(mw, msgs)).toBeUndefined()
  })
})

describe('estimateMessageTokens', () => {
  it('counts content and tool calls', () => {
    expect(estimateMessageTokens(text('user', 'x'.repeat(40)))).toBe(10)
  })
})
