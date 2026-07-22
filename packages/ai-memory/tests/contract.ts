import { beforeEach, describe, expect, it } from 'vitest'
import type { MemoryAdapter, MemoryScope } from '../src'

/**
 * Shared contract suite for any `recall`/`save` {@link MemoryAdapter}. Point it
 * at a factory that returns a fresh adapter and it verifies the round-trip,
 * scope isolation, empty recall, receipt shape, and the optional introspection
 * methods. If your adapter passes, the middleware works.
 */
export function runMemoryAdapterContract(
  label: string,
  factory: () => Promise<MemoryAdapter> | MemoryAdapter,
) {
  describe(label, () => {
    let adapter: MemoryAdapter
    const scopeA: MemoryScope = { sessionId: 's1', userId: 'u1' }
    const scopeB: MemoryScope = { sessionId: 's2', userId: 'u2' }

    beforeEach(async () => {
      adapter = await factory()
    })

    describe('save', () => {
      it('returns a non-empty array of ok receipts', async () => {
        const receipts = await adapter.save(scopeA, {
          user: 'I love hiking in the mountains',
          assistant: 'Noted — hiking it is.',
        })
        expect(Array.isArray(receipts)).toBe(true)
        expect(receipts.length).toBeGreaterThan(0)
        expect(receipts.every((r) => typeof r.ok === 'boolean')).toBe(true)
        expect(receipts.some((r) => r.ok)).toBe(true)
      })
    })

    describe('recall', () => {
      it('round-trips: a saved turn surfaces in a later recall', async () => {
        await adapter.save(scopeA, {
          user: 'My favorite programming language is TypeScript',
          assistant: 'Great choice.',
        })
        const result = await adapter.recall(scopeA, 'programming language')
        expect(result.systemPrompt.toLowerCase()).toContain('typescript')
      })

      it('returns an empty result for a scope with nothing saved', async () => {
        const result = await adapter.recall(scopeA, 'anything at all')
        expect(result.systemPrompt).toBe('')
        expect(result.fragments ?? []).toHaveLength(0)
      })

      it('isolates scopes — recall never crosses into another scope', async () => {
        await adapter.save(scopeA, {
          user: 'The secret code is alpha-bravo',
          assistant: 'Understood.',
        })
        const other = await adapter.recall(scopeB, 'secret code')
        expect(other.systemPrompt).toBe('')
        expect(other.fragments ?? []).toHaveLength(0)
      })
    })

    describe('optional introspection', () => {
      it('inspect (when present) returns a well-formed snapshot after a save', async () => {
        if (!adapter.inspect) return
        await adapter.save(scopeA, { user: 'hello world', assistant: 'hi' })
        const snap = await adapter.inspect(scopeA)
        expect(typeof snap.takenAt).toBe('string')
        expect(snap.data).toBeDefined()
      })

      it('listFacts (when present) returns rows after a save', async () => {
        if (!adapter.listFacts) return
        await adapter.save(scopeA, { user: 'hello world', assistant: 'hi' })
        const facts = await adapter.listFacts(scopeA)
        expect(Array.isArray(facts)).toBe(true)
        expect(
          facts.every((f) => typeof f.id === 'string' && typeof f.text === 'string'),
        ).toBe(true)
      })
    })
  })
}
