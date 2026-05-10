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
        const after1 = await adapter.get('x', scopeA)
        expect(after1?.text).toBe('first')
        expect(after1?.updatedAt).toBeGreaterThanOrEqual(after1!.createdAt)

        // Yield to the event loop so Date.now() can advance — without this,
        // a tight double-add can land in the same millisecond and the
        // strictly-greater assertion below would be flaky on fast machines.
        await new Promise((resolve) => setTimeout(resolve, 2))

        await adapter.add({ ...r, text: 'second' })
        const after2 = await adapter.get('x', scopeA)
        expect(after2?.text).toBe('second')
        expect(after2?.updatedAt).toBeGreaterThanOrEqual(after2!.createdAt)
        // Load-bearing assertion: the second add MUST bump updatedAt.
        // Without this, an adapter that sets updatedAt = createdAt once
        // and never touches it again would silently pass the upsert
        // contract test.
        expect(after2!.updatedAt).toBeGreaterThan(after1!.updatedAt!)
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
        // Non-empty guard: `every` on [] is vacuously true and would mask
        // an adapter that returned zero hits.
        expect(out.hits.length).toBeGreaterThan(0)
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
        // Non-empty guard: `every` on [] is vacuously true.
        expect(out.hits.length).toBeGreaterThan(0)
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
        // Load-bearing: every record must be visible exactly once across
        // pages. Catches adapters that drop records between pages or
        // return the same page repeatedly with a terminating cursor.
        // Adapters MAY return all in one page (no nextCursor) OR paginate;
        // either is fine, but the union of pages must cover all 12 ids.
        expect(seen.size).toBe(12)
        expect(pages).toBeGreaterThanOrEqual(1)
      })
    })

    describe('list', () => {
      it('returns scoped records', async () => {
        await adapter.add(rec({ id: 'a', scope: scopeA }))
        await adapter.add(rec({ id: 'b', scope: scopeB }))
        const out = await adapter.list(scopeA)
        // Non-empty guard: `every` on [] is vacuously true.
        expect(out.items.length).toBeGreaterThan(0)
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
        // Non-empty guard: `every` on [] is vacuously true.
        expect(out.items.length).toBeGreaterThan(0)
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

    describe('partial scope semantics', () => {
      it('search with a partial scope finds records added under sub-scopes', async () => {
        const sub1: MemoryScope = { tenantId: 't1', userId: 'u1' }
        const sub2: MemoryScope = { tenantId: 't1', userId: 'u2' }
        const other: MemoryScope = { tenantId: 't2', userId: 'u1' }
        await adapter.add(rec({ id: 'a', scope: sub1, text: 'apple' }))
        await adapter.add(rec({ id: 'b', scope: sub2, text: 'apple' }))
        await adapter.add(rec({ id: 'c', scope: other, text: 'apple' }))

        const out = await adapter.search({
          scope: { tenantId: 't1' },
          text: 'apple',
        })
        const ids = new Set(out.hits.map((h) => h.record.id))
        expect(ids.has('a')).toBe(true)
        expect(ids.has('b')).toBe(true)
        expect(ids.has('c')).toBe(false)
      })

      it('list with a partial scope returns records from sub-scopes', async () => {
        const sub1: MemoryScope = { tenantId: 't1', userId: 'u1' }
        const sub2: MemoryScope = { tenantId: 't1', userId: 'u2' }
        await adapter.add(rec({ id: 'a', scope: sub1 }))
        await adapter.add(rec({ id: 'b', scope: sub2 }))
        const out = await adapter.list({ tenantId: 't1' })
        expect(out.items.length).toBe(2)
      })

      it('clear with a partial scope wipes records from sub-scopes', async () => {
        const sub1: MemoryScope = { tenantId: 't1', userId: 'u1' }
        const sub2: MemoryScope = { tenantId: 't1', userId: 'u2' }
        const other: MemoryScope = { tenantId: 't2', userId: 'u1' }
        await adapter.add(rec({ id: 'a', scope: sub1 }))
        await adapter.add(rec({ id: 'b', scope: sub2 }))
        await adapter.add(rec({ id: 'c', scope: other }))
        await adapter.clear({ tenantId: 't1' })
        expect(await adapter.get('a', sub1)).toBeUndefined()
        expect(await adapter.get('b', sub2)).toBeUndefined()
        expect(await adapter.get('c', other)).toBeDefined()
      })

      it('delete by id keeps the record findable via the actual scope after the call', async () => {
        // NOT a partial-scope test, but it pins the srem-uses-record-scope fix.
        const subScope: MemoryScope = { tenantId: 't1', userId: 'u1' }
        await adapter.add(rec({ id: 'd', scope: subScope }))
        await adapter.delete(['d'], { tenantId: 't1' }) // wider than record scope
        expect(await adapter.get('d', subScope)).toBeUndefined()
        // After the delete, list({tenantId:'t1'}) should also not return it
        const listed = await adapter.list({ tenantId: 't1' })
        expect(listed.items.find((r) => r.id === 'd')).toBeUndefined()
      })

      it('add upsert with changed scope removes id from old scope index', async () => {
        const oldScope: MemoryScope = { tenantId: 't1', userId: 'u1' }
        const newScope: MemoryScope = { tenantId: 't1', userId: 'u2' }
        await adapter.add(rec({ id: 'm', scope: oldScope, text: 'original' }))
        await adapter.add(rec({ id: 'm', scope: newScope, text: 'rescoped' }))
        // Record is no longer findable via old scope
        expect(await adapter.get('m', oldScope)).toBeUndefined()
        expect(await adapter.get('m', newScope)).toBeDefined()
        // list under old scope shouldn't return it
        const oldList = await adapter.list(oldScope)
        expect(oldList.items.find((r) => r.id === 'm')).toBeUndefined()
        // list under new scope should
        const newList = await adapter.list(newScope)
        expect(newList.items.find((r) => r.id === 'm')).toBeDefined()
      })
    })

    describe('scope value safety', () => {
      // Defense-in-depth: scope values that happen to contain glob
      // metacharacters (*, ?, [, ], \) MUST NOT cross-match other tenants'
      // index buckets. The in-memory adapter doesn't use globs so this is
      // a no-op there; for the redis adapter it pins the escapeGlob fix on
      // findIndexKeysForScope's SCAN MATCH pattern. Without escaping, a
      // scope value like `tenantId: 't*'` would cause the SCAN to glob
      // every other tenant's index key and surface their records.
      it('does not cross-match scope values that contain glob metacharacters', async () => {
        const realTenant: MemoryScope = { tenantId: 'real-tenant' }
        const otherTenant: MemoryScope = { tenantId: 'tenant-x' }
        const attacker: MemoryScope = { tenantId: 't*' }
        await adapter.add(
          rec({ id: 'real', scope: realTenant, text: 'tenant data' }),
        )
        await adapter.add(
          rec({ id: 'other', scope: otherTenant, text: 'tenant data' }),
        )
        const out = await adapter.search({
          scope: attacker,
          text: 'tenant data',
        })
        // Neither tenant's records are leaked — the attacker's literal
        // `t*` scope must not glob-match `real-tenant` or `tenant-x`.
        expect(out.hits.find((h) => h.record.id === 'real')).toBeUndefined()
        expect(out.hits.find((h) => h.record.id === 'other')).toBeUndefined()
      })

      // EXACT-MATCH counterpart to the SCAN MATCH glob-escape test above. The
      // redis adapter's `scopeKey` joins scope values with `:`. Without
      // escaping, `{ tenantId: 'a:b' }` and `{ tenantId: 'a', userId: 'b' }`
      // would both serialize to `a:b:_:_:_:_` and silently merge two
      // different tenants' index buckets. The in-memory adapter is unaffected
      // because it does not serialize scope to strings — it uses
      // `scopeMatches` against the raw scope object — but the test still
      // pins the same isolation guarantee.
      //
      // We assert ONLY the isolation property (no cross-leak), not the
      // own-record retrieval, because ioredis-mock does not implement the
      // SCAN MATCH backslash-escape mechanism Redis uses. In a real Redis
      // deployment the escaped pattern correctly matches the literal key;
      // here we verify the security-critical half — that buckets do not
      // merge — and rely on the in-memory contract run for the
      // own-record-reachability half.
      it('does not cross-leak scope values that contain the segment delimiter', async () => {
        const colonTenant: MemoryScope = { tenantId: 'a:b' }
        const splitScope: MemoryScope = { tenantId: 'a', userId: 'b' }
        await adapter.add(
          rec({ id: 'colon', scope: colonTenant, text: 'colon data' }),
        )
        await adapter.add(
          rec({ id: 'split', scope: splitScope, text: 'split data' }),
        )
        // Querying the split scope must NOT surface the colon-scope record —
        // the previously-colliding bucket layout is now isolated.
        const splitOut = await adapter.search({
          scope: splitScope,
          text: 'data',
        })
        expect(splitOut.hits.find((h) => h.record.id === 'colon')).toBeUndefined()
        expect(splitOut.hits.find((h) => h.record.id === 'split')).toBeDefined()
        // get() uses an id+scope check via scopeMatches against the raw
        // scope object, so the own-record reachability half is also testable
        // here without relying on SCAN MATCH escape semantics.
        expect(await adapter.get('colon', colonTenant)).toBeDefined()
        expect(await adapter.get('split', splitScope)).toBeDefined()
        // And the cross-scope get must not leak either way.
        expect(await adapter.get('colon', splitScope)).toBeUndefined()
        expect(await adapter.get('split', colonTenant)).toBeUndefined()
      })

      it('does not cross-leak scope values that contain the escape character', async () => {
        // Backslash is the escape character used by both `escapeScopeValue`
        // (for `:`/`\`) and `escapeGlob` (for glob metacharacters). A naive
        // escape that didn't escape `\` itself would let
        // `tenantId: 'a\\backslash'` collide with another scope after
        // unescaping. Same isolation-only assertion shape as the colon test.
        const backslashTenant: MemoryScope = { tenantId: 'has\\backslash' }
        const otherTenant: MemoryScope = { tenantId: 'has' }
        await adapter.add(
          rec({ id: 'bs', scope: backslashTenant, text: 'bs data' }),
        )
        await adapter.add(
          rec({ id: 'plain', scope: otherTenant, text: 'plain data' }),
        )
        const out = await adapter.search({
          scope: otherTenant,
          text: 'data',
        })
        expect(out.hits.find((h) => h.record.id === 'plain')).toBeDefined()
        expect(out.hits.find((h) => h.record.id === 'bs')).toBeUndefined()
        // Own-record reachability via id+scope is testable without SCAN.
        expect(await adapter.get('bs', backslashTenant)).toBeDefined()
        expect(await adapter.get('plain', otherTenant)).toBeDefined()
      })

      // Underscore placeholder collision: the redis adapter uses literal `_`
      // as the placeholder for an UNSET scope key in `scopeKey`. Without
      // escaping `_` in `escapeScopeValue`, a user-supplied scope value of
      // literal `'_'` (e.g. `userId: '_'`) would build the same index key as
      // a scope with `userId` unset — opening a cross-leak surface on
      // `clear()` (which deletes by exact index key, not via `scopeMatches`).
      // The in-memory adapter is unaffected because it does not serialize
      // scope to strings, but the contract test still pins isolation across
      // both adapters.
      it('clear({tenantId}) cascades to records with userId="_" via partial-scope semantics', async () => {
        const baseTenant: MemoryScope = { tenantId: 't1' }
        const subWithUnderscore: MemoryScope = {
          tenantId: 't1',
          userId: '_',
        }
        await adapter.add(
          rec({ id: 'base', scope: baseTenant, text: 'base record' }),
        )
        await adapter.add(
          rec({ id: 'sub', scope: subWithUnderscore, text: 'sub record' }),
        )
        await adapter.clear(baseTenant)
        // Both records are wiped — `base` is directly under `baseTenant`, and
        // `sub` is wiped because partial-scope clear cascades across
        // sub-scopes (see "clear with a partial scope wipes records from
        // sub-scopes" above). The key insight is that this is the CONSISTENT
        // partial-scope contract, not an accidental key collision: the literal
        // underscore value is escaped so it indexes distinctly from "unset".
        expect(await adapter.get('base', baseTenant)).toBeUndefined()
        expect(await adapter.get('sub', subWithUnderscore)).toBeUndefined()
      })

      it('userId="_" does not collide with userId unset', async () => {
        // Same isolation-only assertion shape as the colon and backslash
        // tests above: ioredis-mock does not implement SCAN MATCH
        // backslash-escape, so we verify the security-critical half (no
        // cross-leak from the underscore-user scope into the no-user
        // bucket) via search, and the own-record reachability half via
        // `adapter.get`, which uses `scopeMatches` against the raw scope
        // object rather than SCAN MATCH.
        const noUserScope: MemoryScope = { tenantId: 't1' }
        const underscoreUserScope: MemoryScope = {
          tenantId: 't1',
          userId: '_',
        }
        const realUserScope: MemoryScope = {
          tenantId: 't1',
          userId: 'real',
        }
        await adapter.add(
          rec({ id: 'no-user', scope: noUserScope, text: 'orange' }),
        )
        await adapter.add(
          rec({ id: 'us', scope: underscoreUserScope, text: 'orange' }),
        )
        await adapter.add(
          rec({ id: 'real-user', scope: realUserScope, text: 'orange' }),
        )
        // Exact-match search for the underscore-user scope must NOT surface
        // the no-user record (which would have collided pre-fix) nor the
        // real-user record.
        const out = await adapter.search({
          scope: underscoreUserScope,
          text: 'orange',
        })
        expect(
          out.hits.find((h) => h.record.id === 'no-user'),
        ).toBeUndefined()
        expect(
          out.hits.find((h) => h.record.id === 'real-user'),
        ).toBeUndefined()
        // Own-record reachability via id+scope is testable without SCAN.
        expect(await adapter.get('no-user', noUserScope)).toBeDefined()
        expect(await adapter.get('us', underscoreUserScope)).toBeDefined()
        expect(await adapter.get('real-user', realUserScope)).toBeDefined()
        // The narrower (underscore-user) query against the broader (no-user)
        // record must NOT match — per `scopeMatches`, the query's defined
        // `userId: '_'` does not match a missing `userId`. This is the
        // partial-scope asymmetry; the converse (broader query, narrower
        // record) is the legitimate partial-scope cascade and is not
        // asserted here.
        expect(await adapter.get('no-user', underscoreUserScope)).toBeUndefined()
      })

      it('treats empty-string scope values as undefined (not as a distinct bucket)', async () => {
        // A scope value of `''` is equivalent to the key being unset — see
        // `scopeMatches` JSDoc. A record written with `{ tenantId: '' }`
        // would otherwise produce a degenerate "blank-tenant" bucket that
        // no normal query could reach. The empty-scope safety guard kicks
        // in for `{ tenantId: '' }` (since the only defined key is empty)
        // and turns clear/search/list into no-ops.
        await adapter.add(rec({ id: 'a', scope: scopeA, text: 'apples' }))
        await adapter.add(rec({ id: 'b', scope: scopeB, text: 'apples' }))
        const out = await adapter.search({
          scope: { tenantId: '' },
          text: 'apples',
        })
        expect(out.hits.length).toBe(0)
        const listed = await adapter.list({ tenantId: '' })
        expect(listed.items.length).toBe(0)
        // `clear({ tenantId: '' })` must NOT wipe real tenants.
        await adapter.clear({ tenantId: '' })
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
