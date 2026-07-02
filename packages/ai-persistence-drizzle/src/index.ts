/**
 * Drizzle backend (bring-your-own). A Drizzle `db` exposes its underlying client
 * at `db.$client`: a `better-sqlite3`/`node:sqlite`-shaped handle for the sqlite
 * dialect, or a node-postgres `Pool` for the postgres dialect. This adapter
 * unwraps `$client` and persists over it through the shared SQL stores — so it
 * reuses the exact, tested driver logic rather than re-deriving SQL through
 * Drizzle's query builder.
 *
 * Schema: the tables are the same as the raw SQL backend. Re-export `ddl` so you
 * can apply them with your own Drizzle migration workflow (`migrate: false`),
 * or let the backend auto-migrate.
 */
import { createSqlPersistence, ddl } from '@tanstack/ai-persistence-sql'
import type {
  Dialect,
  SqlDriver,
  SqlPersistence,
  SqlRow,
} from '@tanstack/ai-persistence-sql'
import type { PersistenceMode } from '@tanstack/ai-persistence'

export { ddl }

/** SQLite-shaped client (node:sqlite DatabaseSync / better-sqlite3 Database). */
interface SqliteClient {
  prepare: (sql: string) => {
    run: (...params: Array<unknown>) => unknown
    all: (...params: Array<unknown>) => Array<unknown>
  }
}
/** node-postgres Pool-shaped client. */
interface PgClient {
  query: (
    sql: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

/** A Drizzle db exposing its underlying driver client. */
export interface DrizzleDb {
  $client: unknown
}

function sqliteDriver(client: SqliteClient): SqlDriver {
  const driver: SqlDriver = {
    dialect: 'sqlite',
    exec(sql, params = []) {
      client.prepare(sql).run(...params)
      return Promise.resolve()
    },
    query<T extends SqlRow = SqlRow>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) {
      return Promise.resolve(client.prepare(sql).all(...params) as Array<T>)
    },
    transaction(fn) {
      return fn(driver)
    },
  }
  return driver
}

function pgDriver(client: PgClient): SqlDriver {
  const driver: SqlDriver = {
    dialect: 'postgres',
    async exec(sql, params = []) {
      await client.query(sql, params)
    },
    async query<T extends SqlRow = SqlRow>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) {
      return (await client.query(sql, params)).rows as Array<T>
    },
    // Without a dedicated connection we can't BEGIN/COMMIT; stores use
    // constraints plus reconciliation for CAS when this is a pass-through.
    transaction(fn) {
      return fn(driver)
    },
  }
  return driver
}

export interface DrizzlePersistenceOptions {
  db: DrizzleDb
  dialect: Dialect
  mode?: PersistenceMode
  /** Run migrations on first use (default true). Set false to use drizzle-kit. */
  migrate?: boolean
}

/** Drizzle-backed {@link SqlPersistence}. */
export function drizzlePersistence(
  opts: DrizzlePersistenceOptions,
): SqlPersistence {
  const driver =
    opts.dialect === 'postgres'
      ? pgDriver(opts.db.$client as PgClient)
      : sqliteDriver(opts.db.$client as SqliteClient)
  return createSqlPersistence(driver, {
    mode: opts.mode,
    migrate: opts.migrate,
  })
}
