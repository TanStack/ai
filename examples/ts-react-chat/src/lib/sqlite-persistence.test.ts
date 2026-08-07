/**
 * Proves the in-example `node:sqlite` backend satisfies the full
 * `AIPersistence` contract by running the shared conformance testkit from
 * `@tanstack/ai-persistence`. This is exactly how you would verify your own
 * hand-rolled adapter: point the testkit at your factory and keep it green.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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

// `CREATE TABLE IF NOT EXISTS` does not alter a table that already exists, so a
// `.data/*.db` written by an earlier version of this example has none of the
// durable-run columns. That file used to break hard AND early: `createRunStore`
// prepares its `listReclaimable` statement eagerly and `node:sqlite` resolves
// column names at prepare time, so the factory threw `no such column:
// detached_since` before serving a single request. This pins the additive
// migration against a genuinely old file rather than a fresh one.
describe('sqlitePersistence migrate — an existing pre-durability database', () => {
  it('adds the missing runs columns instead of throwing at prepare time', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tanstack-sqlite-migrate-'))
    const file = join(dir, 'old.db')
    try {
      // A `runs` table exactly as it shipped BEFORE the durable-run fields.
      const old = new DatabaseSync(file)
      old.exec(`
        CREATE TABLE runs (
          run_id text PRIMARY KEY NOT NULL,
          thread_id text NOT NULL,
          status text NOT NULL,
          started_at integer NOT NULL,
          finished_at integer,
          error text
        );
      `)
      old.close()

      // Opening it must migrate rather than throw...
      const persistence = sqlitePersistence({ url: file, migrate: true })
      try {
        const runs = persistence.stores.runs
        await runs.createOrResume({
          runId: 'migrated-run',
          threadId: 'migrated-thread',
          startedAt: 1,
        })

        // ...and every added column must actually work, not merely exist. These
        // are the fields takeover and the reaper depend on.
        await runs.update('migrated-run', {
          sandboxKey: 'sandbox-abc',
          detachedSince: 500,
          cancelRequested: true,
          driverEpoch: 2,
        })
        expect(await runs.get('migrated-run')).toMatchObject({
          sandboxKey: 'sandbox-abc',
          detachedSince: 500,
          cancelRequested: true,
          driverEpoch: 2,
        })

        // The eagerly-prepared statement is the one that used to throw.
        if (!runs.listReclaimable) {
          throw new Error('expected runs.listReclaimable to be implemented')
        }
        const reclaimable = await runs.listReclaimable({
          now: 1_000,
          ttlMs: 100,
        })
        expect(reclaimable.some((r) => r.runId === 'migrated-run')).toBe(true)

        // Pre-existing rows survive the migration; the new columns read back as
        // absent rather than as a coerced falsy default.
        const fresh = await runs.get('migrated-run')
        expect(fresh?.threadId).toBe('migrated-thread')
      } finally {
        persistence.close()
      }

      // Idempotent: opening the already-migrated file again is a no-op.
      const again = sqlitePersistence({ url: file, migrate: true })
      again.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
