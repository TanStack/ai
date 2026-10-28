import { describe, expect, it, vi } from 'vitest'
import {
  hindsight,
  makeHindsightTools,
} from '../../src/providers/hindsight/index'
import type {
  HindsightClientLike,
  HindsightRuntime,
} from '../../src/providers/hindsight/index'
import type { SaveReceipt } from '../../src/types'

/**
 * These tests never touch a real Hindsight server. The factory-level assertions
 * check the adapter shape; the tool-level assertions drive `makeHindsightTools`
 * with a fake {@link HindsightRuntime} so we can verify the retain/recall/reflect
 * wiring (and the `onToolRetain`/`onToolRecall` callbacks) in isolation.
 */

function fakeRuntime(
  overrides: Partial<HindsightClientLike> = {},
): HindsightRuntime {
  const client: HindsightClientLike = {
    retain: async () => ({ stored: true }),
    recall: async () => ({
      results: [{ text: 'the user likes penguins', type: 'fact', id: 'm1' }],
    }),
    reflect: async () => ({ text: 'synthesized reflection' }),
    listMemories: async () => ({ items: [] }),
    getBankProfile: async () => ({}),
    deleteBank: async () => ({}),
    ...overrides,
  }
  return { client, recallToPrompt: (data) => JSON.stringify(data) }
}

describe('hindsight factory', () => {
  it('exposes the recall/save contract with a stable id', () => {
    const adapter = hindsight({ user: 'u1' })
    expect(adapter.id).toBe('hindsight')
    expect(typeof adapter.recall).toBe('function')
    expect(typeof adapter.save).toBe('function')
    expect(typeof adapter.inspect).toBe('function')
    expect(typeof adapter.listFacts).toBe('function')
  })
})

describe('makeHindsightTools', () => {
  const deps = () => ({
    getRuntime: async () => fakeRuntime(),
    bankId: 'u1__s1',
    budget: 'mid',
  })

  it('returns the three memory tools with valid input schemas', () => {
    const tools = makeHindsightTools(deps())
    expect(tools.map((t) => t.name)).toEqual([
      'hindsight_retain',
      'hindsight_recall',
      'hindsight_reflect',
    ])
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      })
    }
    expect(tools[0]?.inputSchema).toMatchObject({ required: ['content'] })
    expect(tools[1]?.inputSchema).toMatchObject({ required: ['query'] })
  })

  it('retain tool stores content and fires onToolRetain', async () => {
    const retain = vi.fn(async () => ({ id: 'stored-1' }))
    const receipts: Array<SaveReceipt> = []
    const tools = makeHindsightTools({
      getRuntime: async () => fakeRuntime({ retain }),
      bankId: 'u1__s1',
      budget: 'mid',
      onToolRetain: (r) => receipts.push(r),
    })
    const result = await tools[0]?.execute?.({ content: 'remember this' })
    expect(result).toMatchObject({ ok: true })
    expect(retain).toHaveBeenCalledWith('u1__s1', 'remember this', {
      context: 'chat:tool',
      timestamp: expect.any(Date),
    })
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.ok).toBe(true)
  })

  it('recall tool renders memories and fires onToolRecall', async () => {
    const seen: Array<{ query: string }> = []
    const tools = makeHindsightTools({
      getRuntime: async () => fakeRuntime(),
      bankId: 'u1__s1',
      budget: 'mid',
      onToolRecall: (query) => seen.push({ query }),
    })
    const result = await tools[1]?.execute?.({ query: 'penguins' })
    expect(String(result)).toContain('penguins')
    expect(seen).toEqual([{ query: 'penguins' }])
  })

  it('reflect tool returns the synthesized text', async () => {
    const tools = makeHindsightTools(deps())
    const result = await tools[2]?.execute?.({ query: 'what do I know?' })
    expect(result).toBe('synthesized reflection')
  })

  it('retain tool degrades to an error receipt when the client throws', async () => {
    const receipts: Array<SaveReceipt> = []
    const tools = makeHindsightTools({
      getRuntime: async () =>
        fakeRuntime({
          retain: async () => {
            throw new Error('server down')
          },
        }),
      bankId: 'u1__s1',
      budget: 'mid',
      onToolRetain: (r) => receipts.push(r),
    })
    const result = await tools[0]?.execute?.({ content: 'x' })
    expect(result).toMatchObject({ ok: false })
    expect(receipts[0]?.ok).toBe(false)
    expect(receipts[0]?.error).toContain('server down')
  })
})
