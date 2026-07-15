import { rm } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { canonicalizeInterruptResolutions } from '@tanstack/ai'
import {
  runInterruptStoreConformance,
  runPersistenceConformance,
  type InterruptConformanceHarness,
} from '@tanstack/ai-persistence/testkit'
import { prismaPersistence } from '../src/index'
import { resolveDelegates } from '../src/model-contract'
import { createInterruptStore } from '../src/stores'
import type { RunInterruptTransaction } from '../src/stores'
import type { InterruptStore } from '@tanstack/ai-persistence'

const clients: Array<PrismaClient> = []
const temporaryDirectories: Array<string> = []

const sqliteTestSchema = `
  CREATE TABLE messages (
    thread_id TEXT NOT NULL PRIMARY KEY,
    messages_json TEXT NOT NULL
  );
  CREATE TABLE runs (
    run_id TEXT NOT NULL PRIMARY KEY,
    thread_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at BIGINT NOT NULL,
    finished_at BIGINT,
    error TEXT,
    usage_json TEXT
  );
  CREATE TABLE interrupts (
    interrupt_id TEXT NOT NULL PRIMARY KEY,
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    generation INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    requested_at BIGINT NOT NULL,
    resolved_at BIGINT,
    payload_json TEXT NOT NULL,
    binding_json TEXT,
    schema_hash TEXT,
    response_json TEXT
  );
  CREATE INDEX interrupts_thread_status_idx
    ON interrupts(thread_id, status);
  CREATE INDEX interrupts_run_generation_status_idx
    ON interrupts(run_id, generation, status);
  CREATE TABLE interrupt_batches (
    interrupted_run_id TEXT NOT NULL PRIMARY KEY,
    thread_id TEXT NOT NULL,
    generation INTEGER NOT NULL,
    expected_interrupt_ids_json TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    canonical_resolutions TEXT NOT NULL,
    resolutions_json TEXT NOT NULL,
    continuation_run_id TEXT NOT NULL,
    committed_at BIGINT NOT NULL
  );
  CREATE INDEX interrupt_batches_thread_idx
    ON interrupt_batches(thread_id);
  CREATE TABLE metadata (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (scope, key)
  );
  CREATE TABLE artifacts (
    artifact_id TEXT NOT NULL PRIMARY KEY,
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    external_url TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE blobs (
    key TEXT NOT NULL PRIMARY KEY,
    content_type TEXT,
    size BIGINT,
    etag TEXT,
    custom_metadata_json TEXT,
    created_at BIGINT,
    updated_at BIGINT,
    body BLOB
  );
`

function initializeSqliteTestDatabase(path: string): void {
  const database = new DatabaseSync(path)
  try {
    database.exec(sqliteTestSchema)
  } finally {
    database.close()
  }
}

/** Create a PrismaClient over a fresh initialized temporary SQLite database. */
async function makeTestClient(): Promise<PrismaClient> {
  const dir = mkdtempSync(join(tmpdir(), 'tanstack-ai-prisma-'))
  temporaryDirectories.push(dir)
  const dbPath = join(dir, 'state.db').replace(/\\/g, '/')
  initializeSqliteTestDatabase(dbPath)
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  })
  clients.push(prisma)
  return prisma
}

async function makeSharedTestClients(): Promise<{
  clients: readonly [PrismaClient, PrismaClient]
  dbPath: string
}> {
  const dir = mkdtempSync(join(tmpdir(), 'tanstack-ai-prisma-interrupts-'))
  temporaryDirectories.push(dir)
  const dbPath = join(dir, 'state.db').replace(/\\/g, '/')
  initializeSqliteTestDatabase(dbPath)
  const first = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  })
  const second = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  })
  clients.push(first, second)
  return { clients: [first, second], dbPath }
}

function createTestInterruptStore(
  prisma: PrismaClient,
  clock: () => number,
): InterruptStore {
  const delegates = resolveDelegates(prisma)
  const runTransaction: RunInterruptTransaction = (operation) =>
    prisma.$transaction((transaction) =>
      operation(resolveDelegates(transaction)),
    )
  return createInterruptStore(delegates, runTransaction, clock)
}

function withTransitionFailure(dbPath: string, interruptId: string): void {
  const database = new DatabaseSync(dbPath)
  try {
    database.exec(`
      CREATE TRIGGER fail_next_interrupt_transition
      BEFORE UPDATE ON interrupts
      WHEN OLD.status = 'pending' AND NEW.interrupt_id = '${interruptId}'
      BEGIN
        SELECT RAISE(ABORT, 'Injected transition failure');
      END;
    `)
  } finally {
    database.close()
  }
}

afterAll(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()))
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

runPersistenceConformance('prisma', async () =>
  prismaPersistence(await makeTestClient()),
)

runInterruptStoreConformance(async (): Promise<InterruptConformanceHarness> => {
  let now = Date.parse('2026-07-13T10:00:00.000Z')
  const shared = await makeSharedTestClients()
  const first = createTestInterruptStore(shared.clients[0], () => now)
  const second = createTestInterruptStore(shared.clients[1], () => now)
  let commitCount = 0
  const store: InterruptStore = {
    create: (record) => first.create(record),
    resolve: (interruptId, response) => first.resolve(interruptId, response),
    cancel: (interruptId) => first.cancel(interruptId),
    get: (interruptId) => first.get(interruptId),
    list: (threadId) => first.list(threadId),
    listPending: (threadId) => first.listPending(threadId),
    listByRun: (runId) => first.listByRun(runId),
    listPendingByRun: (runId) => first.listPendingByRun(runId),
    openInterruptBatch: (input) => first.openInterruptBatch(input),
    commitInterruptResolutions: (input) => {
      const target = commitCount++ % 2 === 0 ? first : second
      return target.commitInterruptResolutions(input)
    },
    getInterruptRecoveryState: (input) =>
      first.getInterruptRecoveryState(input),
  }

  return {
    getStore: () => store,
    advanceBy: (milliseconds) => {
      now += milliseconds
    },
    inspect: async (interruptedRunId) => {
      const database = new DatabaseSync(shared.dbPath, { readOnly: true })
      try {
        const statuses = database
          .prepare(
            'SELECT status FROM interrupts WHERE run_id = ? ORDER BY interrupt_id',
          )
          .all(interruptedRunId)
          .map((row) => {
            if (typeof row.status !== 'string') {
              throw new TypeError('Expected a string interrupt status.')
            }
            return row.status
          })
        const batch = database
          .prepare(
            'SELECT COUNT(*) AS count FROM interrupt_batches WHERE interrupted_run_id = ?',
          )
          .get(interruptedRunId)
        if (typeof batch?.count !== 'number') {
          throw new TypeError('Expected a numeric interrupt batch count.')
        }
        return { statuses, batchCount: batch.count }
      } finally {
        database.close()
      }
    },
    failTransitionOnce: (interruptId) => {
      withTransitionFailure(shared.dbPath, interruptId)
    },
    reopen: async () => {
      const reopened = new PrismaClient({
        datasources: { db: { url: `file:${shared.dbPath}` } },
      })
      clients.push(reopened)
      return createTestInterruptStore(reopened, () => now)
    },
  }
})

describe('Prisma interrupt persistence hardening', () => {
  it('upgrades a pending legacy row to a safe generic binding', async () => {
    const shared = await makeSharedTestClients()
    const database = new DatabaseSync(shared.dbPath)
    try {
      database
        .prepare(
          `INSERT INTO interrupts (
            interrupt_id, run_id, thread_id, generation, status, requested_at,
            payload_json, binding_json, schema_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        )
        .run(
          'legacy-pending',
          'legacy-run',
          'legacy-thread',
          0,
          'pending',
          1,
          JSON.stringify({
            id: 'legacy-pending',
            reason: 'confirmation',
            toolName: 'must-not-be-guessed',
          }),
        )
    } finally {
      database.close()
    }

    const store = createTestInterruptStore(shared.clients[0], () => 2)
    await expect(
      store.getInterruptRecoveryState({
        threadId: 'legacy-thread',
        interruptedRunId: 'legacy-run',
        knownGeneration: 0,
      }),
    ).resolves.toMatchObject({ state: 'pending' })

    const verification = new DatabaseSync(shared.dbPath, { readOnly: true })
    try {
      const row = verification
        .prepare(
          'SELECT binding_json AS bindingJson, schema_hash AS schemaHash FROM interrupts WHERE interrupt_id = ?',
        )
        .get('legacy-pending')
      expect(row?.schemaHash).toBe('legacy:unknown')
      expect(JSON.parse(String(row?.bindingJson))).toEqual({
        generation: 0,
        interruptId: 'legacy-pending',
        interruptedRunId: 'legacy-run',
        kind: 'generic',
        responseSchemaHash: 'legacy:unknown',
      })
    } finally {
      verification.close()
    }
  })

  it('rejects persisted rows whose payload ID does not match the row ID', async () => {
    const shared = await makeSharedTestClients()
    const store = createTestInterruptStore(shared.clients[0], () => 1)
    await store.create({
      interruptId: 'row-id',
      runId: 'row-run',
      threadId: 'row-thread',
      status: 'pending',
      requestedAt: 1,
      payload: { id: 'different-id', reason: 'confirmation' },
    })
    await expect(store.get('row-id')).rejects.toThrow(/corrupt|match/i)
  })

  it('requires replay correlation to match the stored winner exactly', async () => {
    const shared = await makeSharedTestClients()
    const store = createTestInterruptStore(shared.clients[0], () => 1)
    const opened = await store.openInterruptBatch({
      threadId: 'replay-thread',
      interruptedRunId: 'replay-run',
      descriptors: [{ id: 'replay-int', reason: 'confirmation' }],
      bindings: [
        {
          interruptId: 'replay-int',
          kind: 'generic',
          responseSchemaHash: 'sha256:replay',
        },
      ],
    })
    const candidate = canonicalizeInterruptResolutions([
      { interruptId: 'replay-int', status: 'resolved', payload: true },
    ])
    const input = {
      threadId: 'replay-thread',
      interruptedRunId: 'replay-run',
      continuationRunId: 'continuation-winner',
      expectedGeneration: opened.generation,
      expectedInterruptIds: ['replay-int'],
      resolutions: candidate.resolutions,
      fingerprint: candidate.fingerprint,
      canonicalResolutions: candidate.canonicalResolutions,
    }
    await expect(
      store.commitInterruptResolutions(input),
    ).resolves.toMatchObject({ status: 'committed' })
    await expect(
      store.commitInterruptResolutions({
        ...input,
        continuationRunId: 'continuation-loser',
        expectedGeneration: opened.generation + 1,
      }),
    ).resolves.toMatchObject({ status: 'conflict' })
  })

  it('rejects a stored batch whose generation diverges from its rows', async () => {
    const shared = await makeSharedTestClients()
    const store = createTestInterruptStore(shared.clients[0], () => 1)
    const opened = await store.openInterruptBatch({
      threadId: 'corrupt-thread',
      interruptedRunId: 'corrupt-run',
      descriptors: [{ id: 'corrupt-int', reason: 'confirmation' }],
      bindings: [
        {
          interruptId: 'corrupt-int',
          kind: 'generic',
          responseSchemaHash: 'sha256:corrupt',
        },
      ],
    })
    const candidate = canonicalizeInterruptResolutions([
      { interruptId: 'corrupt-int', status: 'cancelled' },
    ])
    await store.commitInterruptResolutions({
      threadId: 'corrupt-thread',
      interruptedRunId: 'corrupt-run',
      continuationRunId: 'corrupt-continuation',
      expectedGeneration: opened.generation,
      expectedInterruptIds: ['corrupt-int'],
      resolutions: candidate.resolutions,
      fingerprint: candidate.fingerprint,
      canonicalResolutions: candidate.canonicalResolutions,
    })

    const database = new DatabaseSync(shared.dbPath)
    try {
      database
        .prepare(
          'UPDATE interrupt_batches SET generation = ? WHERE interrupted_run_id = ?',
        )
        .run(opened.generation + 1, 'corrupt-run')
    } finally {
      database.close()
    }

    await expect(
      store.getInterruptRecoveryState({
        threadId: 'corrupt-thread',
        interruptedRunId: 'corrupt-run',
        knownGeneration: opened.generation,
      }),
    ).rejects.toThrow(/corrupt|correlation/i)
  })
})
