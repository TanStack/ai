import { rm } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { PrismaModelError, prismaPersistence } from '../src/index'

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

async function makeTestClient(): Promise<PrismaClient> {
  const dir = mkdtempSync(join(tmpdir(), 'tanstack-ai-prisma-mapping-'))
  temporaryDirectories.push(dir)
  const dbPath = join(dir, 'state.db').replace(/\\/g, '/')
  const database = new DatabaseSync(dbPath)
  try {
    database.exec(sqliteTestSchema)
  } finally {
    database.close()
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  })
  clients.push(prisma)
  return prisma
}

/**
 * A client whose TanStack AI model delegates live under renamed accessors, as
 * generated from a fragment whose models were renamed to avoid collisions
 * (e.g. `model ChatMessage`). Aliasing the canonical delegates is faithful:
 * a delegate is bound to its model, not to the property it hangs off.
 */
async function makeRenamedClient(): Promise<PrismaClient> {
  const prisma = await makeTestClient()
  const renamed = {
    chatMessage: prisma.message,
    chatRun: prisma.run,
    chatInterrupt: prisma.interrupt,
    chatMetadata: prisma.metadata,
    chatArtifact: prisma.artifact,
    chatBlob: prisma.blob,
  }
  return renamed as unknown as PrismaClient
}

const renamedModels = {
  messages: 'chatMessage',
  runs: 'chatRun',
  interrupts: 'chatInterrupt',
  metadata: 'chatMetadata',
  artifacts: 'chatArtifact',
  blobs: 'chatBlob',
}

afterAll(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()))
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

// The full store contract must hold when every model is reached through a
// renamed delegate.
runPersistenceConformance('prisma (renamed models)', async () =>
  prismaPersistence(await makeRenamedClient(), { models: renamedModels }),
)

describe('prismaPersistence model mapping', () => {
  it('rejects a mapping that points at missing delegates', async () => {
    const prisma = await makeTestClient()
    expect(() =>
      prismaPersistence(prisma, { models: { messages: 'chatMessage' } }),
    ).toThrow(PrismaModelError)
    expect(() =>
      prismaPersistence(prisma, { models: { messages: 'chatMessage' } }),
    ).toThrow(/`messages` maps to `client\.chatMessage`/)
  })

  it('lists every unresolved model in one error', async () => {
    const prisma = await makeRenamedClient()
    // Default names resolve nothing on a fully renamed client.
    expect(() => prismaPersistence(prisma)).toThrow(
      /messages[\s\S]*runs[\s\S]*interrupts[\s\S]*metadata[\s\S]*artifacts[\s\S]*blobs/,
    )
  })

  it('supports partial maps over an otherwise canonical client', async () => {
    const prisma = await makeTestClient()
    const persistence = prismaPersistence(prisma, {
      models: { messages: 'message' },
    })
    await persistence.stores.messages.saveThread('thread-1', [
      { role: 'user', content: 'hello' },
    ])
    expect(
      await persistence.stores.messages.loadThread('thread-1'),
    ).toHaveLength(1)
  })
})
