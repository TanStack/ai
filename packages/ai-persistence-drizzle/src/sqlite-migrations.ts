import type { DatabaseSync } from 'node:sqlite'
import type { SqliteMigration } from './migrations'

const MIGRATIONS_TABLE = '__tanstack_ai_migrations'

/** Error raised when a bundled SQLite migration cannot be applied atomically. */
export class SqliteMigrationError extends Error {
  readonly migrationId: string

  constructor(migrationId: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`Failed to apply SQLite migration "${migrationId}": ${detail}`, {
      cause,
    })
    this.name = 'SqliteMigrationError'
    this.migrationId = migrationId
  }
}

/**
 * Apply ordered migrations with each migration SQL and bookkeeping insert in
 * the same transaction. A failed migration leaves no partial schema changes or
 * applied marker, so retrying after the underlying issue is corrected is safe.
 */
export function applySqliteMigrations(
  database: DatabaseSync,
  migrations: ReadonlyArray<SqliteMigration>,
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      migration_id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)

  const findApplied = database.prepare(
    `SELECT migration_id FROM ${MIGRATIONS_TABLE} WHERE migration_id = ?`,
  )
  const recordApplied = database.prepare(
    `INSERT INTO ${MIGRATIONS_TABLE} (migration_id, applied_at) VALUES (?, ?)`,
  )

  for (const migration of migrations) {
    database.exec('BEGIN IMMEDIATE')
    try {
      if (findApplied.get(migration.id) !== undefined) {
        database.exec('COMMIT')
        continue
      }
      database.exec(migration.sql)
      recordApplied.run(migration.id, Date.now())
      database.exec('COMMIT')
    } catch (error) {
      try {
        database.exec('ROLLBACK')
      } catch (rollbackError) {
        throw new SqliteMigrationError(
          migration.id,
          new AggregateError(
            [error, rollbackError],
            'Migration failed and its transaction could not be rolled back.',
          ),
        )
      }
      throw new SqliteMigrationError(migration.id, error)
    }
  }
}
