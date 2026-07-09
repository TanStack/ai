import { readFile, readdir } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { prismaPersistence } from '../src/index'

const migrationsDir = fileURLToPath(
  new URL('../prisma/migrations', import.meta.url),
)

const clients: Array<PrismaClient> = []

/** Read every generated migration's DDL, in journal order, as raw statements. */
async function migrationStatements(): Promise<Array<string>> {
  const entries = await readdir(migrationsDir, { withFileTypes: true })
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const statements: Array<string> = []
  for (const dir of dirs) {
    const sql = await readFile(
      join(migrationsDir, dir, 'migration.sql'),
      'utf8',
    )
    for (const raw of sql.split(';')) {
      const statement = raw
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim()
      if (statement) statements.push(statement)
    }
  }
  return statements
}

/** Create a PrismaClient over a fresh temp sqlite file with migrations applied. */
async function makeTestClient(): Promise<PrismaClient> {
  const dir = mkdtempSync(join(tmpdir(), 'tanstack-ai-prisma-'))
  const dbPath = join(dir, 'state.db').replace(/\\/g, '/')
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  })
  clients.push(prisma)
  for (const statement of await migrationStatements()) {
    await prisma.$executeRawUnsafe(statement)
  }
  return prisma
}

afterAll(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()))
})

runPersistenceConformance('prisma', async () =>
  prismaPersistence(await makeTestClient()),
)
