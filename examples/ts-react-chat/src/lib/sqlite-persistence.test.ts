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
import {
  runSandboxCheckpointForkConformance,
  runSandboxCheckpointStoreConformance,
} from '@tanstack/ai-sandbox/testkit'
import { sqlitePersistence, sqliteSandboxSnapshots } from './sqlite-persistence'

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

runSandboxCheckpointStoreConformance(
  'ts-react-chat example (node:sqlite)',
  (options) =>
    sqliteSandboxSnapshots({
      url: ':memory:',
      migrate: true,
      ...options,
    }).checkpoints,
)

runSandboxCheckpointForkConformance(
  'ts-react-chat example (node:sqlite)',
  () => {
    const snapshots = sqliteSandboxSnapshots({
      url: ':memory:',
      migrate: true,
    })
    return snapshots
  },
)

describe('sqliteSandboxSnapshots fork transaction', () => {
  it('uses one durable writer lease across two SQLite connections', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tanstack-sqlite-lease-'))
    const file = join(dir, 'snapshots.db')
    const first = sqliteSandboxSnapshots({ url: file, migrate: true })
    const second = sqliteSandboxSnapshots({ url: file, migrate: true })
    try {
      const writer = await first.checkpoints.acquireWriter('thread')
      await expect(
        second.checkpoints.acquireWriter('thread'),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_CONFLICT' })
      await writer.release()
      const replacement = await second.checkpoints.acquireWriter('thread')
      await expect(
        first.checkpoints.append({
          checkpoint: {
            id: 'stale',
            threadId: 'thread',
            parentCheckpointId: null,
            createdAt: 1,
            reason: 'named',
            files: [],
            conversation: [],
            artifacts: [],
          },
          expectedHeadId: null,
          writer,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
      await replacement.release()
    } finally {
      first.close()
      second.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('deletes dependent rows and permits the checkpoint id to be reused', async () => {
    const snapshots = sqliteSandboxSnapshots({ url: ':memory:', migrate: true })
    const writer = await snapshots.checkpoints.acquireWriter('thread')
    const checkpoint = {
      id: 'reusable',
      threadId: 'thread',
      parentCheckpointId: null,
      createdAt: 1,
      reason: 'named' as const,
      files: [
        {
          path: 'a.txt',
          kind: 'file' as const,
          blobKey: `sandbox-files/sha256/${'a'.repeat(64)}`,
          size: 1,
        },
      ],
      conversation: [{ role: 'user' as const, content: 'one' }],
      artifacts: [],
    }
    try {
      await snapshots.checkpoints.append({
        checkpoint,
        expectedHeadId: null,
        writer,
      })
      await snapshots.checkpoints.deleteHead({
        threadId: 'thread',
        checkpointId: 'reusable',
        writer,
      })
      await expect(
        snapshots.checkpoints.append({
          checkpoint,
          expectedHeadId: null,
          writer,
        }),
      ).resolves.toEqual({ headId: 'reusable' })
    } finally {
      snapshots.close()
    }
  })

  it('rejects a fork whose source blob reference is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tanstack-sqlite-ref-'))
    const file = join(dir, 'snapshots.db')
    const snapshots = sqliteSandboxSnapshots({ url: file, migrate: true })
    try {
      const key = `sandbox-files/sha256/${'b'.repeat(64)}`
      const sourceWriter = await snapshots.checkpoints.acquireWriter('source')
      await snapshots.checkpoints.append({
        checkpoint: {
          id: 'source',
          threadId: 'source',
          parentCheckpointId: null,
          createdAt: 1,
          reason: 'named',
          files: [{ path: 'a.txt', kind: 'file', blobKey: key, size: 1 }],
          conversation: [],
          artifacts: [],
        },
        expectedHeadId: null,
        writer: sourceWriter,
      })
      const inspector = new DatabaseSync(file)
      inspector
        .prepare(
          'DELETE FROM sandbox_checkpoint_blob_references WHERE blob_key = ?',
        )
        .run(key)
      inspector.close()
      const writer = await snapshots.checkpoints.acquireWriter('destination')
      await expect(
        snapshots.checkpoints.forkFromCheckpoint({
          sourceThreadId: 'source',
          sourceCheckpointId: 'source',
          destinationThreadId: 'destination',
          destinationCheckpointId: 'destination',
          createdAt: 2,
          writer,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
      expect(
        await snapshots.persistence.stores.messages.loadThread('destination'),
      ).toEqual([])
      expect(await snapshots.checkpoints.getHead('destination')).toBeNull()
    } finally {
      snapshots.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each([
    {
      path: 'file/child',
      kind: 'file',
      blobKey: `sandbox-files/sha256/${'c'.repeat(64)}`,
      size: 1,
    },
    {
      path: 'C:/absolute.txt',
      kind: 'file',
      blobKey: `sandbox-files/sha256/${'c'.repeat(64)}`,
      size: 1,
    },
    {
      path: 'bad',
      kind: 'other',
      blobKey: `sandbox-files/sha256/${'c'.repeat(64)}`,
      size: 1,
    },
    { path: 'directory', kind: 'dir', blobKey: 'forbidden' },
  ])('rejects invalid checkpoint entry $path', async (invalid) => {
    const snapshots = sqliteSandboxSnapshots({ url: ':memory:', migrate: true })
    try {
      const writer = await snapshots.checkpoints.acquireWriter('thread')
      const files =
        invalid.path === 'file/child'
          ? [
              {
                path: 'file',
                kind: 'file' as const,
                blobKey: `sandbox-files/sha256/${'d'.repeat(64)}`,
                size: 1,
              },
              invalid,
            ]
          : [invalid]
      const checkpoint = {
        id: `invalid-${invalid.path}`,
        threadId: 'thread',
        parentCheckpointId: null,
        createdAt: 1,
        reason: 'named' as const,
        files: [],
        conversation: [],
        artifacts: [],
      }
      Reflect.set(checkpoint, 'files', files)
      await expect(
        snapshots.checkpoints.append({
          checkpoint,
          expectedHeadId: null,
          writer,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
    } finally {
      snapshots.close()
    }
  })

  it.each([
    ['files', null],
    ['files', 'not-an-array'],
    ['files', [null]],
    ['files', [1]],
    ['artifacts', null],
    ['artifacts', 'not-an-array'],
    ['artifacts', [null]],
    ['artifacts', [1]],
  ])('rejects malformed checkpoint %s values', async (field, value) => {
    const snapshots = sqliteSandboxSnapshots({ url: ':memory:', migrate: true })
    try {
      const writer = await snapshots.checkpoints.acquireWriter('thread')
      const checkpoint = {
        id: `malformed-${field}-${String(value)}`,
        threadId: 'thread',
        parentCheckpointId: null,
        createdAt: 1,
        reason: 'named' as const,
        files: [],
        conversation: [],
        artifacts: [],
      }
      Reflect.set(checkpoint, field, value)
      await expect(
        snapshots.checkpoints.append({
          checkpoint,
          expectedHeadId: null,
          writer,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
    } finally {
      snapshots.close()
    }
  })

  it('rolls back the destination when checkpoint storage fails after transcript staging', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tanstack-sqlite-fork-'))
    const file = join(dir, 'snapshots.db')
    const snapshots = sqliteSandboxSnapshots({ url: file, migrate: true })
    try {
      const sourceWriter = await snapshots.checkpoints.acquireWriter('source')
      const blobKey = `sandbox-files/sha256/${'a'.repeat(64)}`
      await snapshots.checkpoints.append({
        checkpoint: {
          id: 'source-root',
          threadId: 'source',
          parentCheckpointId: null,
          createdAt: 1,
          reason: 'named',
          files: [{ path: 'a.txt', kind: 'file', blobKey, size: 1 }],
          conversation: [{ role: 'user', content: 'source' }],
          artifacts: [],
        },
        expectedHeadId: null,
        writer: sourceWriter,
      })
      const triggerDb = new DatabaseSync(file)
      triggerDb.exec(`
        CREATE TRIGGER fail_fork_checkpoint
        BEFORE INSERT ON sandbox_checkpoints
        WHEN NEW.checkpoint_id = 'fork-root'
        BEGIN SELECT RAISE(ABORT, 'forced checkpoint failure'); END;
      `)
      triggerDb.close()
      const destinationWriter =
        await snapshots.checkpoints.acquireWriter('destination')
      await expect(
        snapshots.checkpoints.forkFromCheckpoint({
          sourceThreadId: 'source',
          sourceCheckpointId: 'source-root',
          destinationThreadId: 'destination',
          destinationCheckpointId: 'fork-root',
          createdAt: 2,
          writer: destinationWriter,
        }),
      ).rejects.toThrow('forced checkpoint failure')
      expect(
        await snapshots.persistence.stores.messages.loadThread('destination'),
      ).toEqual([])
      expect(await snapshots.checkpoints.list('destination')).toEqual([])
      expect(await snapshots.checkpoints.getHead('destination')).toBeNull()
      expect(await snapshots.checkpoints.listBlobReferences()).toEqual([
        { key: blobKey, references: 1 },
      ])
    } finally {
      snapshots.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

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
