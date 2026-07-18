import { rm } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { prismaPersistence } from '../src/index'

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
    status TEXT NOT NULL,
    requested_at BIGINT NOT NULL,
    resolved_at BIGINT,
    payload_json TEXT NOT NULL,
    response_json TEXT
  );
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

afterAll(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()))
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

runPersistenceConformance(
  'prisma',
  async () => prismaPersistence(await makeTestClient()),
  // This backend has no distributed lock primitive.
  { skip: ['locks'] },
)
