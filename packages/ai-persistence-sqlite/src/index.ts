/**
 * SQLite backend. Wraps a SQLite client in the shared `SqlDriver` and assembles
 * a `SqlPersistence` via `@tanstack/ai-persistence-sql`.
 *
 * Two client paths:
 * - convenience: `sqlitePersistence({ path })` lazily opens a `node:sqlite`
 *   `DatabaseSync` (built in to Node 22+, zero dependency).
 * - BYO: pass `{ db }` — an existing `node:sqlite` `DatabaseSync` OR a
 *   `better-sqlite3` `Database` (both expose `prepare(sql).run/all(...params)`).
 */
import { createRequire } from 'node:module'
import { createSqlPersistence } from '@tanstack/ai-persistence-sql'
import type {
  SqlDriver,
  SqlPersistence,
  SqlRow,
} from '@tanstack/ai-persistence-sql'
import type { PersistenceMode } from '@tanstack/ai-persistence'

/** The subset of a SQLite client the driver needs (node:sqlite & better-sqlite3 both satisfy it). */
interface SqliteClient {
  prepare: (sql: string) => {
    run: (...params: Array<unknown>) => unknown
    all: (...params: Array<unknown>) => Array<unknown>
  }
}

export interface SqliteDriverOptions {
  /** File path (or ':memory:'). Used when `db` is not provided. */
  path?: string
  /** Bring-your-own SQLite handle (node:sqlite DatabaseSync or better-sqlite3 Database). */
  db?: SqliteClient
}

type DatabaseSyncConstructor = new (path: string) => SqliteClient

function loadNodeSqliteDatabaseSync(): DatabaseSyncConstructor {
  try {
    const require = createRequire(import.meta.url)
    const sqlite = require('node:sqlite') as {
      DatabaseSync?: DatabaseSyncConstructor
    }
    if (typeof sqlite.DatabaseSync === 'function') {
      return sqlite.DatabaseSync
    }
  } catch {
    // Throw the package-level guidance below.
  }
  throw new Error(
    'sqlitePersistence({ path }) requires node:sqlite, available in Node 22+. Pass sqlitePersistence({ db }) with a compatible SQLite handle on older Node versions.',
  )
}

/** Build a {@link SqlDriver} backed by SQLite. */
export function createSqliteDriver(opts?: SqliteDriverOptions): SqlDriver {
  const client: SqliteClient =
    opts?.db ?? new (loadNodeSqliteDatabaseSync())(opts?.path ?? ':memory:')

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
    // SQLite clients here are synchronous; statements already run in order, so a
    // plain pass-through is sufficient (no async interleaving to isolate).
    transaction(fn) {
      return fn(driver)
    },
  }
  return driver
}

export interface SqlitePersistenceOptions extends SqliteDriverOptions {
  mode?: PersistenceMode
  /** Run migrations on first use (default false). */
  migrate?: boolean
}

/** SQLite-backed {@link SqlPersistence}. */
export function sqlitePersistence(
  opts?: SqlitePersistenceOptions,
): SqlPersistence {
  const driver = createSqliteDriver({ path: opts?.path, db: opts?.db })
  return createSqlPersistence(driver, {
    mode: opts?.mode,
    migrate: opts?.migrate,
  })
}
