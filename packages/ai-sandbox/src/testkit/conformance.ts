/**
 * Conformance suite for a {@link SandboxStore} implementation.
 *
 * A durable backend (`@tanstack/ai-persistence-drizzle` / `-prisma` /
 * `-cloudflare`) runs this against a fresh store to prove it satisfies the
 * get / upsert / delete contract `@tanstack/ai-sandbox`'s ensure algorithm
 * relies on — including insert-vs-overwrite and optional-field handling. The
 * in-memory reference store runs it too.
 *
 * Vitest is an OPTIONAL peer dependency: this module is imported only from test
 * files, which already run under Vitest.
 */
import { describe, expect, it } from 'vitest'
import type { SandboxRecord, SandboxStore } from '../store'

function makeRecord(overrides?: Partial<SandboxRecord>): SandboxRecord {
  return {
    key: 'thread-1',
    provider: 'fake',
    providerSandboxId: 'sb-1',
    threadId: 'thread-1',
    updatedAt: 1,
    ...overrides,
  }
}

/**
 * Assert `makeStore()` produces a spec-compliant {@link SandboxStore}. Each
 * `it` gets a fresh store, so implementations may share process state across
 * calls without cross-test bleed only if `makeStore` returns an isolated store.
 */
export function runSandboxStoreConformance(
  name: string,
  makeStore: () => SandboxStore | Promise<SandboxStore>,
): void {
  describe(`SandboxStore conformance: ${name}`, () => {
    it('returns null for a missing key', async () => {
      const store = await makeStore()
      expect(await store.get('absent')).toBeNull()
    })

    it('round-trips an upserted record with all fields', async () => {
      const store = await makeStore()
      const record = makeRecord({
        latestSnapshotId: 'snap-1',
        latestRunId: 'run-1',
      })
      await store.upsert(record)
      expect(await store.get(record.key)).toEqual(record)
    })

    it('omits absent optional fields on read', async () => {
      const store = await makeStore()
      const record = makeRecord()
      await store.upsert(record)
      const loaded = await store.get(record.key)
      expect(loaded).toEqual(record)
      expect(loaded && 'latestSnapshotId' in loaded).toBe(false)
      expect(loaded && 'latestRunId' in loaded).toBe(false)
    })

    it('overwrites an existing record on re-upsert', async () => {
      const store = await makeStore()
      await store.upsert(makeRecord({ latestSnapshotId: 'snap-1' }))
      await store.upsert(
        makeRecord({ providerSandboxId: 'sb-2', updatedAt: 2 }),
      )
      const loaded = await store.get('thread-1')
      expect(loaded?.providerSandboxId).toBe('sb-2')
      expect(loaded?.updatedAt).toBe(2)
      // The overwrite dropped latestSnapshotId — a durable store must clear it,
      // not retain the prior value.
      expect(loaded && 'latestSnapshotId' in loaded).toBe(false)
    })

    it('isolates records by key', async () => {
      const store = await makeStore()
      await store.upsert(makeRecord({ key: 'a', threadId: 'a' }))
      await store.upsert(
        makeRecord({ key: 'b', threadId: 'b', providerSandboxId: 'sb-b' }),
      )
      expect((await store.get('a'))?.providerSandboxId).toBe('sb-1')
      expect((await store.get('b'))?.providerSandboxId).toBe('sb-b')
    })

    it('deletes a record', async () => {
      const store = await makeStore()
      await store.upsert(makeRecord())
      await store.delete('thread-1')
      expect(await store.get('thread-1')).toBeNull()
    })

    it('delete of a missing key is a no-op', async () => {
      const store = await makeStore()
      await expect(store.delete('absent')).resolves.toBeUndefined()
    })
  })
}
