import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { sqliteMigrations } from '../src/migrations'
import { applySqliteMigrations } from '../src/sqlite-migrations'

const databases: Array<DatabaseSync> = []

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  databases.push(database)
  return database
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe('sqlite migrations', () => {
  it('exposes an ordered canonical manifest and applies it idempotently', () => {
    expect(sqliteMigrations.map((migration) => migration.id)).toEqual([
      '0000_tanstack_ai_initial',
      '0001_tanstack_ai_interrupt_batches',
    ])

    const database = createDatabase()
    applySqliteMigrations(database, sqliteMigrations)
    applySqliteMigrations(database, sqliteMigrations)

    const tableNames = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    expect(tableNames).toEqual(
      expect.arrayContaining([
        '__tanstack_ai_migrations',
        'artifacts',
        'blobs',
        'interrupts',
        'interrupt_batches',
        'messages',
        'metadata',
        'runs',
      ]),
    )
    expect(
      database
        .prepare('SELECT migration_id FROM __tanstack_ai_migrations')
        .all(),
    ).toEqual([
      { migration_id: '0000_tanstack_ai_initial' },
      { migration_id: '0001_tanstack_ai_interrupt_batches' },
    ])
  })

  it('ships byte-identical nonempty generated and runtime migration assets', () => {
    const migration = sqliteMigrations[1]
    expect(migration?.sql.trim()).not.toBe('')
    expect(migration?.sql).toBe(
      readFileSync(
        new URL(
          '../drizzle/0001_tanstack_ai_interrupt_batches.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
  })

  it('backfills safe legacy interrupt identity and creates durable indexes', () => {
    const database = createDatabase()
    const initialMigration = sqliteMigrations[0]
    expect(initialMigration).toBeDefined()
    if (!initialMigration) return
    applySqliteMigrations(database, [initialMigration])
    database
      .prepare(
        `INSERT INTO interrupts
          (interrupt_id, run_id, thread_id, status, requested_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'pending-int',
        'pending-run',
        'thread-legacy',
        'pending',
        1,
        '{"id":"pending-int","reason":"confirmation"}',
      )
    database
      .prepare(
        `INSERT INTO interrupts
          (interrupt_id, run_id, thread_id, status, requested_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'resolved-int',
        'resolved-run',
        'thread-legacy',
        'resolved',
        2,
        '{"id":"resolved-int","reason":"confirmation"}',
      )

    applySqliteMigrations(database, sqliteMigrations)

    expect(
      database
        .prepare(
          `SELECT interrupt_id, generation, binding_json, response_schema_hash
           FROM interrupts ORDER BY interrupt_id`,
        )
        .all(),
    ).toEqual([
      {
        interrupt_id: 'pending-int',
        generation: 1,
        binding_json:
          '{"kind":"generic","interruptId":"pending-int","interruptedRunId":"pending-run","generation":1,"responseSchemaHash":"legacy:unknown"}',
        response_schema_hash: 'legacy:unknown',
      },
      {
        interrupt_id: 'resolved-int',
        generation: 0,
        binding_json:
          '{"kind":"generic","interruptId":"resolved-int","interruptedRunId":"resolved-run","generation":0,"responseSchemaHash":"legacy:unknown"}',
        response_schema_hash: 'legacy:unknown',
      },
    ])

    const indexes = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('interrupts', 'interrupt_batches') ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    expect(indexes).toEqual(
      expect.arrayContaining([
        'interrupt_batches_continuation_run_id_unique',
        'interrupts_run_status_requested_at_idx',
        'interrupts_thread_status_requested_at_idx',
      ]),
    )
  })

  it('rolls back migration SQL and bookkeeping together, then permits retry', () => {
    const database = createDatabase()
    const failingMigration = {
      id: '0000_retry_test',
      filename: '0000_retry_test.sql',
      sql: `
        CREATE TABLE retry_target (id INTEGER PRIMARY KEY);
        CREATE TRIGGER reject_migration_bookkeeping
        BEFORE INSERT ON __tanstack_ai_migrations
        BEGIN
          SELECT RAISE(ABORT, 'bookkeeping failed');
        END;
      `,
    }

    expect(() => applySqliteMigrations(database, [failingMigration])).toThrow(
      'bookkeeping failed',
    )
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'retry_target'",
        )
        .get(),
    ).toBeUndefined()
    expect(
      database
        .prepare('SELECT migration_id FROM __tanstack_ai_migrations')
        .all(),
    ).toEqual([])

    applySqliteMigrations(database, [
      {
        ...failingMigration,
        sql: 'CREATE TABLE retry_target (id INTEGER PRIMARY KEY);',
      },
    ])

    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'retry_target'",
        )
        .get(),
    ).toEqual({ name: 'retry_target' })
    expect(
      database
        .prepare('SELECT migration_id FROM __tanstack_ai_migrations')
        .all(),
    ).toEqual([{ migration_id: '0000_retry_test' }])
  })
})
