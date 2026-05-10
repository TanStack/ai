// packages/typescript/ai/tests/middlewares/memory.test.ts
import { describe, expect, it, vi } from 'vitest'
import { aiEventClient } from '@tanstack/ai-event-client'
import { chat } from '../../src/activities/chat/index'
import { memoryMiddleware } from '../../src/memory'
import type {
  MemoryAdapter,
  MemoryHit,
  MemoryListResult,
  MemoryQuery,
  MemoryRecord,
  MemoryScope,
  MemorySearchResult,
} from '../../src/memory'
import type { StreamChunk } from '../../src/types'
import { ev, createMockAdapter, collectChunks } from '../test-utils'

// Local test double — keeps tests isolated from @tanstack/ai-memory.
function fakeAdapter(seed: MemoryRecord[] = []): MemoryAdapter & {
  store: Map<string, MemoryRecord>
  searchCalls: MemoryQuery[]
} {
  const store = new Map<string, MemoryRecord>()
  for (const r of seed) store.set(r.id, r)
  const searchCalls: MemoryQuery[] = []
  return {
    name: 'fake',
    store,
    searchCalls,
    async add(input) {
      const list = Array.isArray(input) ? input : [input]
      for (const r of list) store.set(r.id, { ...r, updatedAt: Date.now() })
    },
    async get(id, scope) {
      const r = store.get(id)
      if (!r) return undefined
      // simple scope check
      for (const k of Object.keys(scope) as Array<keyof MemoryScope>) {
        if (scope[k] && r.scope[k] !== scope[k]) return undefined
      }
      return r
    },
    async update(id, scope, patch) {
      const existing = await this.get(id, scope)
      if (!existing) return undefined
      const next = { ...existing, ...patch, updatedAt: Date.now() }
      store.set(id, next)
      return next
    },
    async search(query): Promise<MemorySearchResult> {
      searchCalls.push(query)
      const hits: MemoryHit[] = []
      for (const r of store.values()) {
        let match = true
        for (const k of Object.keys(query.scope) as Array<keyof MemoryScope>) {
          if (query.scope[k] && r.scope[k] !== query.scope[k]) {
            match = false
            break
          }
        }
        if (!match) continue
        if (query.kinds && !query.kinds.includes(r.kind)) continue
        hits.push({ record: r, score: 0.9 })
      }
      return { hits: hits.slice(0, query.topK ?? 6) }
    },
    async list(scope, options): Promise<MemoryListResult> {
      const items: MemoryRecord[] = []
      for (const r of store.values()) {
        let match = true
        for (const k of Object.keys(scope) as Array<keyof MemoryScope>) {
          if (scope[k] && r.scope[k] !== scope[k]) {
            match = false
            break
          }
        }
        if (match) items.push(r)
      }
      return { items: items.slice(0, options?.limit ?? items.length) }
    },
    async delete(ids) {
      for (const id of ids) store.delete(id)
    },
    async clear() {
      store.clear()
    },
  }
}

const baseScope: MemoryScope = { tenantId: 't1', userId: 'u1' }

function rec(over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: over.id ?? crypto.randomUUID(),
    scope: over.scope ?? baseScope,
    text: over.text ?? 'sample',
    kind: over.kind ?? 'fact',
    createdAt: over.createdAt ?? Date.now(),
    ...over,
  }
}

describe('memoryMiddleware — retrieval', () => {
  it('is a no-op when there is no user message', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
      ],
    })
    const memory = fakeAdapter([rec({ text: 'X' })])
    const stream = chat({
      adapter,
      messages: [],
      middleware: [memoryMiddleware({ adapter: memory, scope: baseScope })],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(memory.searchCalls).toHaveLength(0)
  })

  it('retrieves at init and injects a memory system prompt', async () => {
    const memory = fakeAdapter([
      rec({ text: 'User likes TS.', kind: 'preference' }),
    ])
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      middleware: [memoryMiddleware({ adapter: memory, scope: baseScope })],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    const first = calls[0] as { systemPrompts?: string[] }
    expect(first.systemPrompts?.some((p) => p.includes('User likes TS.'))).toBe(
      true,
    )
  })

  it('does not re-inject across agent-loop iterations', async () => {
    const memory = fakeAdapter([rec({ text: 'X' })])
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('c1', 't'),
          ev.toolArgs('c1', '{}'),
          ev.toolEnd('c1', 't'),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('done'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 't', description: 'noop', execute: async () => ({}) }],
      middleware: [memoryMiddleware({ adapter: memory, scope: baseScope })],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    const iter1 =
      (calls[0] as { systemPrompts?: string[] }).systemPrompts?.length ?? 0
    const iter2 =
      (calls[1] as { systemPrompts?: string[] }).systemPrompts?.length ?? 0
    expect(iter1).toBe(iter2)
  })

  it('skips retrieval and injection when shouldRetrieve returns false', async () => {
    const memory = fakeAdapter([rec({ text: 'X' })])
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      middleware: [
        memoryMiddleware({
          adapter: memory,
          scope: baseScope,
          shouldRetrieve: () => false,
        }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(memory.searchCalls).toHaveLength(0)
  })

  it('calls rerank between search and render', async () => {
    const memory = fakeAdapter([
      rec({ id: 'a', text: 'A' }),
      rec({ id: 'b', text: 'B' }),
    ])
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
      ],
    })
    const rerank = vi.fn(async (hits: MemoryHit[]) => [...hits].reverse())
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      middleware: [
        memoryMiddleware({ adapter: memory, scope: baseScope, rerank }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(rerank).toHaveBeenCalledTimes(1)
    const promptText = (
      calls[0] as { systemPrompts: string[] }
    ).systemPrompts.join('\n')
    expect(promptText.indexOf('B')).toBeLessThan(promptText.indexOf('A'))
  })

  it('resolves function-form scope once and caches it', async () => {
    const memory = fakeAdapter([rec({ text: 'X' })])
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
      ],
    })
    const scopeFn = vi.fn(() => baseScope)
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      middleware: [memoryMiddleware({ adapter: memory, scope: scopeFn })],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(scopeFn).toHaveBeenCalledTimes(1)
  })
})

describe('memoryMiddleware — persistence', () => {
  it('persists user and assistant messages on finish', async () => {
    const memory = fakeAdapter()
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('Pong.'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Ping' }],
      middleware: [memoryMiddleware({ adapter: memory, scope: baseScope })],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    const texts = [...memory.store.values()].map((r) => r.text).sort()
    expect(texts).toEqual(['Ping', 'Pong.'])
  })

  it('shouldRemember=false skips the entire turn (base records and extractMemories)', async () => {
    // Per-turn semantics: shouldRemember is evaluated ONCE per turn and
    // gates the whole persist path. The user message is short ("hi", 2
    // chars) so the gate returns false and NOTHING is persisted — the
    // assistant message is dropped too, and `extractMemories` is never
    // called.
    const memory = fakeAdapter()
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textContent('long enough response text'),
          ev.runFinished('stop'),
        ],
      ],
    })
    const extractMemories = vi.fn(async () => [
      rec({ text: 'should not run', kind: 'fact' }),
    ])
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      middleware: [
        memoryMiddleware({
          adapter: memory,
          scope: baseScope,
          shouldRemember: ({ message }) => message.content.length > 10,
          extractMemories,
        }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect([...memory.store.values()]).toEqual([])
    expect(extractMemories).not.toHaveBeenCalled()
  })

  it('shouldRemember=true persists user, assistant, and extracted records', async () => {
    const memory = fakeAdapter()
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textContent('long enough response text'),
          ev.runFinished('stop'),
        ],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'a meaningful user message' }],
      middleware: [
        memoryMiddleware({
          adapter: memory,
          scope: baseScope,
          // 25-char user message + non-empty response — gate keeps the turn.
          shouldRemember: ({ message }) => message.content.length > 10,
        }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    const texts = [...memory.store.values()].map((r) => r.text).sort()
    expect(texts).toEqual([
      'a meaningful user message',
      'long enough response text',
    ])
  })

  it('extractMemories returning records adds them as kind: fact', async () => {
    const memory = fakeAdapter()
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('R'), ev.runFinished('stop')],
      ],
    })
    const extractMemories = vi.fn(async () => [
      rec({ text: 'extracted', kind: 'fact' }),
    ])
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'U' }],
      middleware: [
        memoryMiddleware({
          adapter: memory,
          scope: baseScope,
          extractMemories,
        }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(extractMemories).toHaveBeenCalledTimes(1)
    const kinds = [...memory.store.values()].map((r) => r.kind).sort()
    expect(kinds).toEqual(['fact', 'message', 'message'])
  })

  it('extractMemories MemoryOp[] dispatches to add/update/delete', async () => {
    const existing = rec({ id: 'old', text: 'old text', kind: 'fact' })
    const memory = fakeAdapter([existing])
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('R'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'U' }],
      middleware: [
        memoryMiddleware({
          adapter: memory,
          scope: baseScope,
          extractMemories: () => [
            { op: 'add', record: rec({ text: 'new fact', kind: 'fact' }) },
            { op: 'update', id: 'old', patch: { text: 'updated text' } },
          ],
        }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(memory.store.get('old')?.text).toBe('updated text')
    expect([...memory.store.values()].some((r) => r.text === 'new fact')).toBe(
      true,
    )
  })

  it('applies ops in array order: update after add in same batch sees the add', async () => {
    // Order-sensitivity regression test. Previously, all `add` ops were
    // batched and flushed at the END after updates/deletes, meaning an
    // `update` of an id added in the SAME batch silently no-op'd. With
    // strict in-order dispatch the update now sees the just-added record.
    const memory = fakeAdapter()
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('R'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'U' }],
      middleware: [
        memoryMiddleware({
          adapter: memory,
          scope: baseScope,
          extractMemories: () => [
            {
              op: 'add',
              record: rec({ id: 'X', text: 'initial', kind: 'fact' }),
            },
            { op: 'update', id: 'X', patch: { text: 'patched' } },
          ],
        }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(memory.store.get('X')?.text).toBe('patched')
  })

  it('afterPersist receives newly-added records (not updates/deletes)', async () => {
    const memory = fakeAdapter()
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('R'), ev.runFinished('stop')],
      ],
    })
    const afterPersist = vi.fn()
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'U' }],
      middleware: [
        memoryMiddleware({ adapter: memory, scope: baseScope, afterPersist }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(afterPersist).toHaveBeenCalledTimes(1)
    const arg = afterPersist.mock.calls[0]?.[0] as
      | { newRecords: MemoryRecord[] }
      | undefined
    expect(arg?.newRecords.length).toBe(2) // user + assistant
  })

  it('onToolResult persists kind: tool-result records', async () => {
    const memory = fakeAdapter()
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('c1', 'echo'),
          ev.toolArgs('c1', '{}'),
          ev.toolEnd('c1', 'echo'),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('done'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'U' }],
      tools: [
        { name: 'echo', description: 'noop', execute: async () => ({ ok: 1 }) },
      ],
      middleware: [
        memoryMiddleware({
          adapter: memory,
          scope: baseScope,
          onToolResult: ({ toolName, result }) => [
            rec({
              text: `${toolName}:${JSON.stringify(result)}`,
              kind: 'tool-result',
              role: 'tool',
            }),
          ],
        }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)
    const toolResults = [...memory.store.values()].filter(
      (r) => r.kind === 'tool-result',
    )
    expect(toolResults).toHaveLength(1)
    expect(toolResults[0]?.text).toContain('echo')
  })
})

describe('memoryMiddleware — failure handling', () => {
  it('non-strict: retrieval failure does not abort chat', async () => {
    const memory = fakeAdapter()
    memory.search = async () => {
      throw new Error('boom')
    }
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      middleware: [memoryMiddleware({ adapter: memory, scope: baseScope })],
    })
    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(chunks.some((c) => c.type === 'TEXT_MESSAGE_CONTENT')).toBe(true)
  })

  it('strict: retrieval failure rejects the stream', async () => {
    const memory = fakeAdapter()
    memory.search = async () => {
      throw new Error('boom')
    }
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
      ],
    })
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      middleware: [
        memoryMiddleware({ adapter: memory, scope: baseScope, strict: true }),
      ],
    })
    await expect(
      collectChunks(stream as AsyncIterable<StreamChunk>),
    ).rejects.toThrow('boom')
  })
})

describe('memoryMiddleware — devtools events', () => {
  it('emits retrieve and persist events in order', async () => {
    const memory = fakeAdapter([rec({ text: 'X' })])
    const { adapter } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('R'), ev.runFinished('stop')],
      ],
    })
    const seen: string[] = []
    const opts = { withEventTarget: true } as const
    const off1 = aiEventClient.on(
      'memory:retrieve:started',
      () => seen.push('retrieve:started'),
      opts,
    )
    const off2 = aiEventClient.on(
      'memory:retrieve:completed',
      () => seen.push('retrieve:completed'),
      opts,
    )
    const off3 = aiEventClient.on(
      'memory:persist:started',
      () => seen.push('persist:started'),
      opts,
    )
    const off4 = aiEventClient.on(
      'memory:persist:completed',
      () => seen.push('persist:completed'),
      opts,
    )
    try {
      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'U' }],
        middleware: [memoryMiddleware({ adapter: memory, scope: baseScope })],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(seen).toEqual([
        'retrieve:started',
        'retrieve:completed',
        'persist:started',
        'persist:completed',
      ])
    } finally {
      off1()
      off2()
      off3()
      off4()
    }
  })
})
