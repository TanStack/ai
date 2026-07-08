/**
 * Postgres backend. Wraps a `pg`-style pool in the shared `SqlDriver` and
 * assembles a `SqlPersistence` via `@tanstack/ai-persistence-sql`.
 *
 * - convenience: `postgresPersistence({ connectionString })` lazily creates a
 *   `pg.Pool` (the `pg` package is an optional peer, imported on first use).
 * - BYO: pass `{ client }` — any pool exposing `query(sql, params) => { rows }`
 *   and `connect() => client` (node-postgres `Pool`).
 */
import { createSqlPersistence } from '@tanstack/ai-persistence-sql'
import type {
  SqlDriver,
  SqlPersistence,
  SqlRow,
} from '@tanstack/ai-persistence-sql'
import type { PersistenceMode } from '@tanstack/ai-persistence'

/** Minimal node-postgres surface the driver relies on. */
export interface PgQueryable {
  query: (
    sql: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}
export interface PgPool extends PgQueryable {
  connect: () => Promise<PgPoolClient>
}
export interface PgPoolClient extends PgQueryable {
  release: () => void
}

export interface PostgresDriverOptions {
  connectionString?: string
  /** Bring-your-own pool (node-postgres `Pool`). */
  client?: PgPool
}

/**
 * Build a driver over a queryable. When `pool` is provided, `transaction`
 * acquires a dedicated connection for BEGIN/COMMIT; otherwise (inside a
 * transaction's bound client) it runs the callback directly.
 */
function makeDriver(queryable: PgQueryable, pool: PgPool | null): SqlDriver {
  const driver: SqlDriver = {
    dialect: 'postgres',
    async exec(sql, params = []) {
      await queryable.query(sql, params)
    },
    async query<T extends SqlRow = SqlRow>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) {
      const result = await queryable.query(sql, params)
      return result.rows as Array<T>
    },
    async transaction(fn) {
      if (!pool) return fn(driver)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(makeDriver(client, null))
        await client.query('COMMIT')
        return result
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },
  }
  return driver
}

/** Build a {@link SqlDriver} backed by Postgres (pool resolved lazily). */
export function createPostgresDriver(opts: PostgresDriverOptions): SqlDriver {
  let poolPromise: Promise<PgPool> | undefined
  const getPool = (): Promise<PgPool> => {
    if (opts.client) return Promise.resolve(opts.client)
    poolPromise ??= (async () => {
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: opts.connectionString })
      // Adapt the real pg Pool to our minimal interface (no cast needed):
      // both `query(sql, params) => { rows }` and `connect()` already match.
      return {
        query: (sql, params) => pool.query(sql, params as Array<unknown>),
        connect: async () => {
          const client = await pool.connect()
          return {
            query: (sql, params) => client.query(sql, params as Array<unknown>),
            release: () => client.release(),
          }
        },
      }
    })()
    return poolPromise
  }

  return {
    dialect: 'postgres',
    async exec(sql, params) {
      const pool = await getPool()
      await makeDriver(pool, pool).exec(sql, params)
    },
    async query(sql, params) {
      const pool = await getPool()
      return makeDriver(pool, pool).query(sql, params)
    },
    async transaction(fn) {
      const pool = await getPool()
      return makeDriver(pool, pool).transaction(fn)
    },
  }
}

export interface PostgresPersistenceOptions extends PostgresDriverOptions {
  mode?: PersistenceMode
  /** Run migrations on first use (default false). */
  migrate?: boolean
}

/** Postgres-backed {@link SqlPersistence}. */
export function postgresPersistence(
  opts: PostgresPersistenceOptions,
): SqlPersistence {
  const driver = createPostgresDriver({
    connectionString: opts.connectionString,
    client: opts.client,
  })
  return createSqlPersistence(driver, {
    mode: opts.mode,
    migrate: opts.migrate,
  })
}
