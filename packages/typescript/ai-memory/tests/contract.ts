// packages/typescript/ai-memory/tests/contract.ts
import { describe, it, expect, beforeEach } from 'vitest'
import type {
  MemoryAdapter,
  MemoryRecord,
  MemoryScope,
} from '@tanstack/ai/memory'

export function runMemoryAdapterContract(
  label: string,
  factory: () => Promise<MemoryAdapter> | MemoryAdapter,
) {
  describe(label, () => {
    let adapter: MemoryAdapter
    const scopeA: MemoryScope = { tenantId: 't1', userId: 'u1' }
    const scopeB: MemoryScope = { tenantId: 't1', userId: 'u2' }

    beforeEach(async () => {
      adapter = await factory()
    })

    function rec(over: Partial<MemoryRecord> = {}): MemoryRecord {
      return {
        id: over.id ?? crypto.randomUUID(),
        scope: over.scope ?? scopeA,
        text: over.text ?? 'hello world',
        kind: over.kind ?? 'fact',
        createdAt: over.createdAt ?? Date.now(),
        ...over,
      }
    }

    describe('add', () => {
      it('inserts a single record', async () => {
        const r = rec()
        await adapter.add(r)
        expect(await adapter.get(r.id, scopeA)).toMatchObject({ id: r.id })
      })

      it('inserts an array of records in one call', async () => {
        const a = rec({ id: 'a' })
        const b = rec({ id: 'b' })
        await adapter.add([a, b])
        expect(await adapter.get('a', scopeA)).toBeDefined()
        expect(await adapter.get('b', scopeA)).toBeDefined()
      })

      it('upserts by id (replays the same id replace)', async () => {
        const r = rec({ id: 'x', text: 'first' })
        await adapter.add(r)
        await adapter.add({ ...r, text: 'second' })
        const got = await adapter.get('x', scopeA)
        expect(got?.text).toBe('second')
        expect(got?.updatedAt).toBeGreaterThanOrEqual(got!.createdAt)
      })
    })

    describe('get', () => {
      it('returns undefined for unknown id', async () => {
        expect(await adapter.get('nope', scopeA)).toBeUndefined()
      })
      it('returns undefined when scope mismatches', async () => {
        const r = rec({ id: 'q', scope: scopeA })
        await adapter.add(r)
        expect(await adapter.get('q', scopeB)).toBeUndefined()
      })
      it('returns undefined when record is expired', async () => {
        const r = rec({ id: 'e', expiresAt: Date.now() - 1 })
        await adapter.add(r)
        expect(await adapter.get('e', scopeA)).toBeUndefined()
      })
    })

    describe('update', () => {
      it('patches text and bumps updatedAt, preserves createdAt', async () => {
        const r = rec({ id: 'u', text: 'old', createdAt: 1000 })
        await adapter.add(r)
        const before = Date.now()
        const out = await adapter.update('u', scopeA, { text: 'new' })
        expect(out?.text).toBe('new')
        expect(out?.createdAt).toBe(1000)
        expect(out?.updatedAt ?? 0).toBeGreaterThanOrEqual(before)
      })
      it('returns undefined for unknown id or wrong scope', async () => {
        await adapter.add(rec({ id: 'u', scope: scopeA }))
        expect(await adapter.update('u', scopeB, { text: 'x' })).toBeUndefined()
        expect(
          await adapter.update('nope', scopeA, { text: 'x' }),
        ).toBeUndefined()
      })
    })

    describe('search', () => {
      it('respects topK', async () => {
        for (let i = 0; i < 10; i++) {
          await adapter.add(rec({ id: `r${i}`, text: `word${i} same` }))
        }
        const out = await adapter.search({
          scope: scopeA,
          text: 'same',
          topK: 3,
        })
        expect(out.hits.length).toBeLessThanOrEqual(3)
      })

      it('isolates scope', async () => {
        await adapter.add(rec({ id: 'a', scope: scopeA, text: 'apples' }))
        await adapter.add(rec({ id: 'b', scope: scopeB, text: 'apples' }))
        const out = await adapter.search({ scope: scopeA, text: 'apples' })
        expect(out.hits.every((h) => h.record.scope.userId === 'u1')).toBe(true)
      })

      it('filters by kinds', async () => {
        await adapter.add(rec({ id: 'a', text: 'foo', kind: 'fact' }))
        await adapter.add(rec({ id: 'b', text: 'foo', kind: 'preference' }))
        const out = await adapter.search({
          scope: scopeA,
          text: 'foo',
          kinds: ['fact'],
        })
        expect(out.hits.every((h) => h.record.kind === 'fact')).toBe(true)
      })

      it('does not return expired records', async () => {
        await adapter.add(
          rec({ id: 'e', text: 'orange', expiresAt: Date.now() - 1 }),
        )
        await adapter.add(rec({ id: 'f', text: 'orange' }))
        const out = await adapter.search({ scope: scopeA, text: 'orange' })
        expect(out.hits.find((h) => h.record.id === 'e')).toBeUndefined()
        expect(out.hits.find((h) => h.record.id === 'f')).toBeDefined()
      })

      it('paginates with cursor and terminates', async () => {
        for (let i = 0; i < 12; i++) {
          await adapter.add(rec({ id: `p${i}`, text: `pagework${i}` }))
        }
        let cursor: string | undefined
        const seen = new Set<string>()
        let pages = 0
        do {
          const out = await adapter.search({
            scope: scopeA,
            text: 'pagework',
            topK: 4,
            cursor,
          })
          for (const h of out.hits) seen.add(h.record.id)
          cursor = out.nextCursor
          pages++
          if (pages > 10) throw new Error('cursor did not terminate')
        } while (cursor)
        // Either single page if adapter returns everything, or multi-page if it streams.
        expect(seen.size).toBeGreaterThan(0)
      })
    })

    describe('list', () => {
      it('returns scoped records', async () => {
        await adapter.add(rec({ id: 'a', scope: scopeA }))
        await adapter.add(rec({ id: 'b', scope: scopeB }))
        const out = await adapter.list(scopeA)
        expect(out.items.every((r) => r.scope.userId === 'u1')).toBe(true)
      })
      it('respects limit', async () => {
        for (let i = 0; i < 6; i++) await adapter.add(rec({ id: `l${i}` }))
        const out = await adapter.list(scopeA, { limit: 2 })
        expect(out.items.length).toBeLessThanOrEqual(2)
      })
      it('filters by kinds', async () => {
        await adapter.add(rec({ id: 'a', kind: 'fact' }))
        await adapter.add(rec({ id: 'b', kind: 'preference' }))
        const out = await adapter.list(scopeA, { kinds: ['preference'] })
        expect(out.items.every((r) => r.kind === 'preference')).toBe(true)
      })
    })

    describe('delete', () => {
      it('removes records by id within scope', async () => {
        await adapter.add(rec({ id: 'd' }))
        await adapter.delete(['d'], scopeA)
        expect(await adapter.get('d', scopeA)).toBeUndefined()
      })
      it('does not remove records from another scope', async () => {
        await adapter.add(rec({ id: 'd', scope: scopeA }))
        await adapter.delete(['d'], scopeB)
        expect(await adapter.get('d', scopeA)).toBeDefined()
      })
    })

    describe('clear', () => {
      it('removes all records for a scope', async () => {
        await adapter.add(rec({ id: 'c1', scope: scopeA }))
        await adapter.add(rec({ id: 'c2', scope: scopeB }))
        await adapter.clear(scopeA)
        expect(await adapter.get('c1', scopeA)).toBeUndefined()
        expect(await adapter.get('c2', scopeB)).toBeDefined()
      })
    })

    describe('empty scope safety', () => {
      // Cross-tenant safety guard: an empty scope object MUST NOT match any
      // record. See `scopeMatches` JSDoc — `clear({})` and `search({ scope: {} })`
      // would otherwise wipe / leak every tenant's records.
      it('search with empty scope returns no hits', async () => {
        await adapter.add(rec({ id: 'a', scope: scopeA, text: 'apples' }))
        await adapter.add(rec({ id: 'b', scope: scopeB, text: 'apples' }))
        const out = await adapter.search({ scope: {}, text: 'apples' })
        expect(out.hits.length).toBe(0)
      })

      it('list with empty scope returns no items', async () => {
        await adapter.add(rec({ id: 'a', scope: scopeA }))
        await adapter.add(rec({ id: 'b', scope: scopeB }))
        const out = await adapter.list({})
        expect(out.items.length).toBe(0)
      })

      it('clear with empty scope wipes nothing', async () => {
        await adapter.add(rec({ id: 'a', scope: scopeA }))
        await adapter.add(rec({ id: 'b', scope: scopeB }))
        await adapter.clear({})
        expect(await adapter.get('a', scopeA)).toBeDefined()
        expect(await adapter.get('b', scopeB)).toBeDefined()
      })
    })

    describe('semantic vs lexical ranking', () => {
      it('lexical-only when no embeddings', async () => {
        await adapter.add(rec({ id: 'a', text: 'apple banana' }))
        await adapter.add(rec({ id: 'b', text: 'totally unrelated' }))
        const out = await adapter.search({ scope: scopeA, text: 'apple' })
        expect(out.hits[0]?.record.id).toBe('a')
      })
      it('semantic match outranks lexical-only when embeddings present', async () => {
        await adapter.add(rec({ id: 'lex', text: 'apple', embedding: [0, 1] }))
        await adapter.add(rec({ id: 'sem', text: 'fruit', embedding: [1, 0] }))
        const out = await adapter.search({
          scope: scopeA,
          text: 'apple',
          embedding: [1, 0],
        })
        expect(out.hits[0]?.record.id).toBe('sem')
      })
    })
  })
}
