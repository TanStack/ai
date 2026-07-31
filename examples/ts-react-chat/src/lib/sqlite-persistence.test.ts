/**
 * Proves the in-example `node:sqlite` backend satisfies the full
 * `AIPersistence` contract by running the shared conformance testkit from
 * `@tanstack/ai-persistence`. This is exactly how you would verify your own
 * hand-rolled adapter: point the testkit at your factory and keep it green.
 */
import { describe, expect, it } from 'vitest'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

// All seven stores are provided — the four chat state stores plus
// `generationRuns` + `artifacts` + `blobs` — so no STORE is skipped. One
// OPTIONAL `runs` method is genuinely missing here, and the suite requires the
// omission to be declared: `listByThread` (this example never renders a
// thread's past runs). Declaring it is what makes vitest report that case as
// SKIPPED; leaving it undeclared fails the suite, so a missing method can never
// read as a pass. `findActiveRun` and `listReclaimable` ARE implemented, so they
// stay under test.
//
// (Locks are not a store and the suite does not cover them: this backend has no
// distributed lock primitive, which is a separate `withLocks` concern.)
runPersistenceConformance(
  'ts-react-chat example (node:sqlite)',
  () => sqlitePersistence({ url: ':memory:', migrate: true }),
  { skipMethods: ['runs.listByThread'] },
)

// SQL-specific case the in-memory reference backend cannot express: a real
// query layer can get `NULL <= ?` wrong in ways JS's `undefined <= n`
// (`NaN <= n`, always false) never surfaces. This pins the SQLite backend's
// `detached_since IS NOT NULL` guard directly, independent of the shared
// conformance suite.
describe('sqlitePersistence runs.listReclaimable — SQL NULL handling', () => {
  it('never returns a run whose detached_since column is NULL, regardless of ttlMs', async () => {
    const persistence = sqlitePersistence({ url: ':memory:', migrate: true })
    try {
      const runs = persistence.stores.runs
      if (!runs.listReclaimable) {
        throw new Error('expected runs.listReclaimable to be implemented')
      }
      await runs.createOrResume({
        runId: 'null-detached-run',
        threadId: 'null-detached-thread',
        startedAt: 1,
      })
      // detachedSince is never set on this run, so the column stays NULL.

      for (const ttlMs of [0, -1, Number.MAX_SAFE_INTEGER]) {
        const reclaimable = await runs.listReclaimable({
          now: Date.now(),
          ttlMs,
        })
        expect(reclaimable.some((r) => r.runId === 'null-detached-run')).toBe(
          false,
        )
      }
    } finally {
      persistence.close()
    }
  })
})
