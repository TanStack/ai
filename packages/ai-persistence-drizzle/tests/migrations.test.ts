import { DatabaseSync } from 'node:sqlite'
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
        'messages',
        'metadata',
        'runs',
      ]),
    )
    expect(
      database
        .prepare('SELECT migration_id FROM __tanstack_ai_migrations')
        .all(),
    ).toEqual([{ migration_id: '0000_tanstack_ai_initial' }])
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
