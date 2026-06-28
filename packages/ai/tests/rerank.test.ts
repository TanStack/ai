import { describe, expect, it } from 'vitest'
import { rerank } from '../src/index'
import type { RerankAdapter } from '../src/activities/rerank/adapter'
import type {
  GenerationAbortInfo,
  GenerationErrorInfo,
  GenerationFinishInfo,
  GenerationMiddleware,
  GenerationMiddlewareContext,
  GenerationUsageInfo,
} from '../src/activities/middleware'
import type {
  RerankAdapterResult,
  RerankOptions,
  TokenUsage,
} from '../src/types'

// ============================================================================
// Helpers
// ============================================================================

const zeroUsage: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
}

/**
 * Build a fully-typed mock rerank adapter. `rerankFn` receives the options the
 * activity hands the adapter (documents already serialized to strings) and
 * returns the provider-level result.
 */
function mockRerankAdapter(
  rerankFn: (opts: RerankOptions<object>) => Promise<RerankAdapterResult>,
): RerankAdapter<string, object> & { calls: Array<RerankOptions<object>> } {
  const calls: Array<RerankOptions<object>> = []
  return {
    kind: 'rerank',
    name: 'mock',
    model: 'mock-model',
    '~types': { providerOptions: {} },
    calls,
    rerank: (opts) => {
      calls.push(opts)
      return rerankFn(opts)
    },
  }
}

/** A scored result built from a descending list of indices. */
function ranked(...indices: Array<number>): RerankAdapterResult {
  return {
    id: 'rr-1',
    ranking: indices.map((index, i) => ({ index, score: 1 - i * 0.1 })),
    usage: { ...zeroUsage, unitsBilled: 1 },
  }
}

/** Recording middleware capturing each lifecycle hook's context + payload. */
function recordingMiddleware() {
  const events = {
    start: [] as Array<GenerationMiddlewareContext>,
    usage: [] as Array<GenerationUsageInfo>,
    finish: [] as Array<GenerationFinishInfo>,
    abort: [] as Array<GenerationAbortInfo>,
    error: [] as Array<GenerationErrorInfo>,
  }
  const middleware: GenerationMiddleware = {
    name: 'rec',
    onStart: (ctx) => {
      events.start.push(ctx)
    },
    onUsage: (_ctx, info) => {
      events.usage.push(info)
    },
    onFinish: (_ctx, info) => {
      events.finish.push(info)
    },
    onAbort: (_ctx, info) => {
      events.abort.push(info)
    },
    onError: (_ctx, info) => {
      events.error.push(info)
    },
  }
  return { middleware, events }
}

// ============================================================================
// Tests
// ============================================================================

describe('rerank() activity', () => {
  it('maps scored indices back to the original documents in ranked order', async () => {
    const adapter = mockRerankAdapter(async () => ranked(1, 0))
    const documents = ['sunny day at the beach', 'rainy afternoon in the city']

    const result = await rerank({
      adapter,
      query: 'talk about rain',
      documents,
    })

    expect(result.ranking.map((r) => r.index)).toEqual([1, 0])
    expect(result.ranking[0]!.document).toBe('rainy afternoon in the city')
    expect(result.rerankedDocuments).toEqual([
      'rainy afternoon in the city',
      'sunny day at the beach',
    ])
    expect(result.usage.unitsBilled).toBe(1)
  })

  it('serializes object documents with JSON.stringify before the adapter call', async () => {
    const adapter = mockRerankAdapter(async () => ranked(0))
    const documents = [{ id: 1, text: 'a lightweight ultrabook' }]

    await rerank({ adapter, query: 'best travel laptop', documents })

    expect(adapter.calls[0]!.documents).toEqual([JSON.stringify(documents[0])])
  })

  it('returns the original object (not its serialized form) in the result', async () => {
    const documents = [
      { id: 1, text: 'heavy gaming desktop' },
      { id: 2, text: 'lightweight ultrabook' },
    ]
    const adapter = mockRerankAdapter(async () => ranked(1, 0))

    const result = await rerank({ adapter, query: 'travel laptop', documents })

    // document is the original object, fully typed — id is accessible.
    expect(result.ranking[0]!.document.id).toBe(2)
    expect(result.ranking[0]!.document).toBe(documents[1])
  })

  it('throws on empty documents before calling the adapter', async () => {
    const adapter = mockRerankAdapter(async () => ranked())

    await expect(
      rerank({ adapter, query: 'x', documents: [] }),
    ).rejects.toThrow('at least one document')
    expect(adapter.calls).toHaveLength(0)
  })

  it('fires middleware start, usage, then finish on success', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = mockRerankAdapter(async () => ranked(0, 1))

    await rerank({
      adapter,
      query: 'q',
      documents: ['a', 'b'],
      middleware: [middleware],
    })

    expect(events.start).toHaveLength(1)
    expect(events.start[0]!.activity).toBe('rerank')
    expect(events.start[0]!.provider).toBe('mock')
    expect(events.usage[0]!.unitsBilled).toBe(1)
    expect(events.finish).toHaveLength(1)
    expect(events.error).toHaveLength(0)
    expect(events.abort).toHaveLength(0)
  })

  it('fires onError (not onAbort) and rethrows when the adapter throws', async () => {
    const { middleware, events } = recordingMiddleware()
    const adapter = mockRerankAdapter(async () => {
      throw new Error('rerank boom')
    })

    await expect(
      rerank({
        adapter,
        query: 'q',
        documents: ['a'],
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('rerank boom')

    expect(events.error).toHaveLength(1)
    expect(events.abort).toHaveLength(0)
    expect(events.finish).toHaveLength(0)
  })

  it('fires onAbort (not onError) when the request is cancelled', async () => {
    const { middleware, events } = recordingMiddleware()
    const controller = new AbortController()
    const adapter = mockRerankAdapter(async () => {
      controller.abort()
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    })

    await expect(
      rerank({
        adapter,
        query: 'q',
        documents: ['a'],
        abortSignal: controller.signal,
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('aborted')

    expect(events.abort).toHaveLength(1)
    expect(events.error).toHaveLength(0)
    expect(events.finish).toHaveLength(0)
  })

  it('classifies a real error as onError even when the signal is already aborted', async () => {
    // A shared/long-lived signal can be aborted while a genuine (non-abort)
    // error is thrown. The error's identity — not the signal state — decides.
    const { middleware, events } = recordingMiddleware()
    const controller = new AbortController()
    const adapter = mockRerankAdapter(async () => {
      controller.abort()
      throw new Error('genuine provider failure')
    })

    await expect(
      rerank({
        adapter,
        query: 'q',
        documents: ['a'],
        abortSignal: controller.signal,
        middleware: [middleware],
        debug: false,
      }),
    ).rejects.toThrow('genuine provider failure')

    expect(events.error).toHaveLength(1)
    expect(events.abort).toHaveLength(0)
  })

  it('forwards topN and abortSignal to the adapter', async () => {
    const controller = new AbortController()
    const adapter = mockRerankAdapter(async () => ranked(0))

    await rerank({
      adapter,
      query: 'q',
      documents: ['a', 'b', 'c'],
      topN: 1,
      abortSignal: controller.signal,
    })

    expect(adapter.calls[0]!.topN).toBe(1)
    expect(adapter.calls[0]!.abortSignal).toBe(controller.signal)
  })

  it('throws when the provider returns an out-of-range index', async () => {
    const adapter = mockRerankAdapter(async () => ({
      id: 'rr-1',
      ranking: [{ index: 5, score: 0.9 }],
      usage: { ...zeroUsage },
    }))

    await expect(
      rerank({ adapter, query: 'q', documents: ['a', 'b'] }),
    ).rejects.toThrow('out-of-range')
  })
})
