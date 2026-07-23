import { afterEach, describe, expect, it, vi } from 'vitest'
import { mem0 } from '../../src/providers/mem0/index'

/**
 * mem0 talks to its server over plain `fetch`, so these tests stub `fetch` and
 * never open a socket. They assert the `recall`/`save` mapping onto mem0's
 * `/memories` and `/search` endpoints — request shape out, contract shape back.
 */

interface FetchCall {
  url: string
  method: string
  body: unknown
}

function stubFetch(
  handler: (call: FetchCall) => {
    ok?: boolean
    status?: number
    data: unknown
  },
): Array<FetchCall> {
  const calls: Array<FetchCall> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      const call: FetchCall = { url, method: init?.method ?? 'GET', body }
      calls.push(call)
      const res = handler(call)
      const ok = res.ok ?? true
      return {
        ok,
        status: res.status ?? (ok ? 200 : 500),
        json: async () => res.data,
        text: async () => JSON.stringify(res.data),
      } as Response
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mem0 factory', () => {
  it('exposes the recall/save contract with a stable id', () => {
    const adapter = mem0()
    expect(adapter.id).toBe('mem0')
    expect(typeof adapter.recall).toBe('function')
    expect(typeof adapter.save).toBe('function')
    expect(typeof adapter.inspect).toBe('function')
    expect(typeof adapter.listFacts).toBe('function')
  })
})

describe('mem0 save', () => {
  it('POSTs the turn to /memories and returns an ok receipt', async () => {
    const calls = stubFetch(() => ({ data: { id: 'mem-1' } }))
    const adapter = mem0({ baseUrl: 'http://mem0.test', user: 'u1' })
    const receipts = await adapter.save(
      { sessionId: 's1', userId: 'u1' },
      { user: 'I live in Berlin', assistant: 'noted' },
    )
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.ok).toBe(true)
    expect(calls[0]?.url).toBe('http://mem0.test/memories')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.body).toMatchObject({
      user_id: 'u1',
      messages: [
        { role: 'user', content: 'I live in Berlin' },
        { role: 'assistant', content: 'noted' },
      ],
    })
  })
})

describe('mem0 recall', () => {
  it('maps /search results into fragments and a rendered systemPrompt', async () => {
    const calls = stubFetch(() => ({
      data: {
        results: [
          { memory: 'lives in Berlin', id: 'm1' },
          { memory: 'likes hiking', id: 'm2' },
        ],
      },
    }))
    const adapter = mem0({ baseUrl: 'http://mem0.test', user: 'u1' })
    const result = await adapter.recall(
      { sessionId: 's1', userId: 'u1' },
      'where do I live',
    )
    expect(calls[0]?.url).toBe('http://mem0.test/search')
    expect(calls[0]?.body).toMatchObject({
      query: 'where do I live',
      user_id: 'u1',
    })
    expect(result.fragments).toHaveLength(2)
    expect(result.fragments?.[0]).toMatchObject({
      text: 'lives in Berlin',
      source: 'm1',
    })
    expect(result.systemPrompt).toContain('lives in Berlin')
    expect(result.systemPrompt).toContain('likes hiking')
  })

  it('returns an empty result when the server finds nothing', async () => {
    stubFetch(() => ({ data: { results: [] } }))
    const adapter = mem0({ baseUrl: 'http://mem0.test' })
    const result = await adapter.recall({ sessionId: 's1' }, 'anything')
    expect(result.systemPrompt).toBe('')
    expect(result.fragments).toHaveLength(0)
  })

  it('degrades to an empty result on an HTTP error', async () => {
    stubFetch(() => ({ ok: false, status: 500, data: 'boom' }))
    const adapter = mem0({ baseUrl: 'http://mem0.test' })
    const result = await adapter.recall({ sessionId: 's1' }, 'anything')
    expect(result.systemPrompt).toBe('')
    expect(result.fragments).toHaveLength(0)
    expect(result.raw).toBeDefined()
  })
})
