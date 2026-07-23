import { rm } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runSandboxStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { createPrismaSandboxStore } from '../src/index'

const clients: Array<PrismaClient> = []
const temporaryDirectories: Array<string> = []

const sandboxTestSchema = `
  CREATE TABLE sandboxes (
    key TEXT NOT NULL PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_sandbox_id TEXT NOT NULL,
    latest_snapshot_id TEXT,
    thread_id TEXT NOT NULL,
    latest_run_id TEXT,
    updated_at BIGINT NOT NULL
  );
`

function initializeSqliteTestDatabase(path: string): void {
  const database = new DatabaseSync(path)
  try {
    database.exec(sandboxTestSchema)
  } finally {
    database.close()
  }
}

/** A PrismaClient over a fresh initialized temporary SQLite database. */
async function makeTestClient(): Promise<PrismaClient> {
  const dir = mkdtempSync(join(tmpdir(), 'tanstack-ai-prisma-sandbox-'))
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

runSandboxStoreConformance('prisma', async () =>
  createPrismaSandboxStore(await makeTestClient()),
)
