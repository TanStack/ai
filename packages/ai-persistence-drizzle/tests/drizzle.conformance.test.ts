import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import {
  runInterruptStoreConformance,
  runPersistenceConformance,
} from '@tanstack/ai-persistence/testkit'
import { drizzlePersistence } from '../src/index'
import { sqlitePersistence } from '../src/sqlite'
import type { InterruptConformanceHarness } from '@tanstack/ai-persistence/testkit'

const cleanup: Array<() => void> = []

function createNativeDrizzleDatabase(database: DatabaseSync) {
  return drizzle((sql, params, method) => {
    const statement = database.prepare(sql)
    if (method === 'run') {
      statement.run(...params)
      return Promise.resolve({ rows: [] })
    }
    if (method === 'get') {
      const row = statement.get(...params)
      return Promise.resolve({ rows: row ? Object.values(row) : [] })
    }
    const rows = statement.all(...params)
    return Promise.resolve({ rows: rows.map((row) => Object.values(row)) })
  })
}

function createSqliteHarness(): Promise<InterruptConformanceHarness> {
  const directory = mkdtempSync(join(tmpdir(), 'tanstack-ai-drizzle-cas-'))
  const filename = join(directory, 'state.sqlite')
  let now = Date.parse('2026-07-13T10:00:00.000Z')
  const openConnections: Array<ReturnType<typeof sqlitePersistence>> = []

  const open = () => {
    const persistence = sqlitePersistence({
      url: filename,
      migrate: true,
      clock: () => now,
    })
    openConnections.push(persistence)
    return persistence
  }
  const persistence = open()

  cleanup.push(() => {
    for (const connection of openConnections.splice(0)) connection.close()
    rmSync(directory, { recursive: true, force: true })
  })

  return Promise.resolve({
    getStore: () => persistence.stores.interrupts,
    advanceBy(milliseconds) {
      now += milliseconds
    },
    async inspect(interruptedRunId) {
      const statuses = (
        await persistence.stores.interrupts.listByRun(interruptedRunId)
      ).map((row) => row.status)
      const database = new DatabaseSync(filename)
      try {
        const batch = database
          .prepare(
            'SELECT COUNT(*) AS count FROM interrupt_batches WHERE interrupted_run_id = ?',
          )
          .get(interruptedRunId)
        return {
          statuses,
          batchCount: typeof batch?.count === 'number' ? batch.count : -1,
        }
      } finally {
        database.close()
      }
    },
    failTransitionOnce(interruptId) {
      const database = new DatabaseSync(filename)
      try {
        database.exec(`
          CREATE TRIGGER fail_interrupt_transition
          BEFORE UPDATE OF status ON interrupts
          WHEN OLD.interrupt_id = '${interruptId}' AND NEW.status <> OLD.status
          BEGIN
            SELECT RAISE(ABORT, 'injected interrupt transition failure');
          END;
        `)
      } finally {
        database.close()
      }
    },
    reopen: () => Promise.resolve(open().stores.interrupts),
  })
}

runPersistenceConformance('drizzle-sqlite', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)

runInterruptStoreConformance(createSqliteHarness)

describe('drizzlePersistence interrupt transactions', () => {
  it('rejects an implicit non-atomic interrupt store', () => {
    const database = new DatabaseSync(':memory:')
    cleanup.push(() => database.close())

    expect(() =>
      drizzlePersistence(createNativeDrizzleDatabase(database)),
    ).toThrow(/interrupt.*transaction executor/i)
  })

  it('allows callers to explicitly omit interrupts', () => {
    const database = new DatabaseSync(':memory:')
    cleanup.push(() => database.close())

    const persistence = drizzlePersistence(
      createNativeDrizzleDatabase(database),
      {
        interrupts: false,
      },
    )

    expect('interrupts' in persistence.stores).toBe(false)
    expect(persistence.stores.runs).toBeDefined()
  })
})

afterAll(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})
