import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryMiddleware } from '../src'
import { inMemory } from '../src/providers/in-memory'
import { mem0 } from '../src/providers/mem0'
import { hindsight } from '../src/providers/hindsight'
import type { ChatMiddlewareConfig, ChatMiddlewareContext } from '@tanstack/ai'
import type { MemoryAdapter } from '../src'

const scope = { threadId: 's1', userId: 'u1' }

const hindsightRecall = vi.hoisted(() =>
  vi.fn(async (_bank: string, _query: string, _opts: object) => ({
    results: [],
  })),
)
vi.mock('@vectorize-io/hindsight-client', () => ({
  HindsightClient: class {
    recall = hindsightRecall
  },
  recallResponseToPromptString: () => '',
}))

function initCall(signal?: AbortSignal) {
  const config: ChatMiddlewareConfig = {
    messages: [{ role: 'user', content: 'hello' }],
    systemPrompts: [],
    tools: [],
  }
  const ctx = {
    phase: 'init',
    messages: config.messages,
    defer: () => {},
    ...(signal && { signal }),
  } as unknown as ChatMiddlewareContext
  return { ctx, config }
}

describe('memory recall signal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the middleware passes ctx.signal to recall, and nothing without it', async () => {
    const recall = vi.fn<MemoryAdapter['recall']>(async () => ({
      systemPrompt: '',
    }))
    const adapter: MemoryAdapter = {
      id: 'fake',
      recall,
      save: async () => [],
    }
    const mw = memoryMiddleware({ adapter, scope })
    const signal = new AbortController().signal
    const withSignal = initCall(signal)
    await mw.onConfig?.(withSignal.ctx, withSignal.config)
    expect(recall.mock.calls[0]).toEqual([
      expect.anything(),
      'hello',
      { signal },
    ])
    const without = initCall()
    await mw.onConfig?.(without.ctx, without.config)
    expect(recall.mock.calls[1]).toHaveLength(2)
  })

  it('the built-in store passes the signal to the embedder', async () => {
    const embed = vi.fn(async () => [1, 0])
    const adapter = inMemory({ embedder: { embed } })
    const signal = new AbortController().signal
    await adapter.recall(scope, 'cats', { signal })
    await adapter.recall(scope, 'dogs')
    expect(embed.mock.calls).toEqual([['cats', { signal }], ['dogs']])
  })

  it('mem0 passes the signal to the search request', async () => {
    const fetchMock = vi.fn(async () => Response.json({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    await mem0({ baseUrl: 'http://mem0.test' }).recall(scope, 'cats', {
      signal,
    })
    expect(fetchMock.mock.calls[0]).toEqual([
      'http://mem0.test/search',
      expect.objectContaining({ signal }),
    ])
  })

  it('hindsight passes the signal to client.recall, and none without it', async () => {
    const adapter = hindsight({ baseUrl: 'http://hindsight.test' })
    const signal = new AbortController().signal
    await adapter.recall(scope, 'cats', { signal })
    await adapter.recall(scope, 'dogs')
    expect(hindsightRecall.mock.calls.map((call) => call[2])).toEqual([
      { budget: 'mid', signal },
      { budget: 'mid' },
    ])
  })
})
