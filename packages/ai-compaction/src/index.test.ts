import { describe, expect, it, vi } from 'vitest'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ModelMessage,
  ToolCall,
} from '@tanstack/ai'
import { estimateMessageTokens, withCompaction } from './index'

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

describe('withCompaction', () => {
  it('passes through when under the token budget', async () => {
    const mw = withCompaction({ maxTokens: 1000 })
    const result = await runOnConfig(mw, [
      text('user', 'hi'),
      text('assistant', 'hello'),
    ])
    expect(result).toBeUndefined()
  })

  it('evicts the head with a marker when no summarizer is given', async () => {
    const mw = withCompaction({ maxTokens: 100, keepRecentTokens: 50 })
    const msgs = [big('user'), big('assistant'), big('user'), big('assistant')]
    const result = await runOnConfig(mw, msgs)
    expect(result).toBeTruthy()
    const out = result?.messages ?? []
    expect(out[0]?.content).toContain('omitted')
    // recent tail is preserved verbatim
    expect(out[out.length - 1]).toBe(msgs[msgs.length - 1])
  })

  it('summarizes the head when a summarizer is given', async () => {
    const summarize = vi.fn(async () => 'the gist')
    const mw = withCompaction({
      maxTokens: 100,
      keepRecentTokens: 50,
      summarize,
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

  it('never lets the tail start with an orphaned tool result', async () => {
    const call: ToolCall = {
      id: 't1',
      type: 'function',
      function: { name: 'f', arguments: '{}' },
    }
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
    const mw = withCompaction({ maxTokens: 100, keepRecentTokens: 45 })
    const result = await runOnConfig(mw, msgs)
    const out = result?.messages ?? []
    // The tool result was folded into the dropped head, so nothing after the
    // note is an orphaned tool message.
    expect(out.slice(1).some((m) => m.role === 'tool')).toBe(false)
  })

  it('reports before/after via onCompact', async () => {
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 100,
      keepRecentTokens: 50,
      onCompact,
    })
    await runOnConfig(mw, [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ])
    expect(onCompact).toHaveBeenCalledOnce()
    const info = onCompact.mock.calls[0]?.[0]
    expect(info.after).toBeLessThan(info.before)
    expect(info.droppedMessages).toBeGreaterThan(0)
  })

  it('rejects keepRecentTokens >= maxTokens', () => {
    expect(() =>
      withCompaction({ maxTokens: 100, keepRecentTokens: 100 }),
    ).toThrow()
  })

  it('estimateMessageTokens counts content and tool calls', () => {
    expect(estimateMessageTokens(text('user', 'x'.repeat(40)))).toBe(10)
  })
})
