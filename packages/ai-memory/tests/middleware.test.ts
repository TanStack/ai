import { describe, expect, it, vi } from 'vitest'
import { memoryMiddleware } from '../src'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  FinishInfo,
  Tool,
} from '@tanstack/ai'
import type { MemoryAdapter, MemoryScope, MemoryTurn } from '../src'

const catTool: Tool = {
  name: 'cat_tool',
  description: 'A tool about cats.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}

function makeConfig(userText: string): ChatMiddlewareConfig {
  return {
    messages: [{ role: 'user', content: userText }],
    systemPrompts: ['base prompt'],
    tools: [],
  }
}

function makeCtx(
  config: ChatMiddlewareConfig,
  deferred: Array<Promise<unknown>>,
): ChatMiddlewareContext {
  return {
    phase: 'init',
    messages: config.messages,
    defer: (p: Promise<unknown>) => deferred.push(p),
  } as unknown as ChatMiddlewareContext
}

function fakeAdapter(
  saved: Array<{ scope: MemoryScope; turn: MemoryTurn }>,
): MemoryAdapter {
  return {
    id: 'fake',
    recall: async () => ({
      systemPrompt: 'MEMORY: the user likes cats',
      fragments: [{ text: 'the user likes cats', source: 'f1' }],
      tools: [catTool],
      toolGuidance: 'Use cat_tool when relevant.',
    }),
    save: async (scope, turn) => {
      saved.push({ scope, turn })
      return [{ ok: true }]
    },
  }
}

const scope: MemoryScope = { sessionId: 's1', userId: 'u1' }

describe('memoryMiddleware', () => {
  it('injects recalled systemPrompt + toolGuidance + tools at init', async () => {
    const mw = memoryMiddleware({ adapter: fakeAdapter([]), scope })
    const config = makeConfig('tell me about my pets')
    const result = await mw.onConfig?.(makeCtx(config, []), config)

    expect(result).toBeTruthy()
    const patch = result as Partial<ChatMiddlewareConfig>
    expect(patch.systemPrompts).toEqual([
      'base prompt',
      'Use cat_tool when relevant.',
      'MEMORY: the user likes cats',
    ])
    expect(patch.tools?.map((t) => t.name)).toEqual(['cat_tool'])
  })

  it('save-only role skips recall entirely', async () => {
    const mw = memoryMiddleware({
      adapter: fakeAdapter([]),
      scope,
      role: 'save-only',
    })
    const config = makeConfig('hello')
    const result = await mw.onConfig?.(makeCtx(config, []), config)
    expect(result).toBeUndefined()
  })

  it('defers save of the finished turn and reports receipts', async () => {
    const saved: Array<{ scope: MemoryScope; turn: MemoryTurn }> = []
    const onSave = vi.fn()
    const mw = memoryMiddleware({ adapter: fakeAdapter(saved), scope, onSave })

    const deferred: Array<Promise<unknown>> = []
    const config = makeConfig('remember I like cats')
    const ctx = makeCtx(config, deferred)
    // Prime per-request state (captures lastUserText) via onConfig.
    await mw.onConfig?.(ctx, config)

    const info: FinishInfo = {
      finishReason: 'stop',
      duration: 1,
      content: 'You like cats!',
    }
    mw.onFinish?.(ctx, info)
    await Promise.all(deferred)

    expect(saved).toHaveLength(1)
    expect(saved[0]?.turn).toEqual({
      user: 'remember I like cats',
      assistant: 'You like cats!',
    })
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('recall failures are non-fatal (no throw, no injection)', async () => {
    const failing: MemoryAdapter = {
      id: 'boom',
      recall: async () => {
        throw new Error('recall exploded')
      },
      save: async () => [{ ok: true }],
    }
    const mw = memoryMiddleware({ adapter: failing, scope })
    const config = makeConfig('hi')
    const result = await mw.onConfig?.(makeCtx(config, []), config)
    expect(result).toBeUndefined()
  })
})
