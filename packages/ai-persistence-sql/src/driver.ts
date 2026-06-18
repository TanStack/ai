/**
 * Minimal SQL driver contract the shared stores are written against. Each
 * backend (`-sqlite`, `-postgres`, `-cloudflare`, `-drizzle`, `-prisma`)
 * implements this over its client; the stores never see a concrete driver.
 */

export type Dialect = 'sqlite' | 'postgres'

export type SqlRow = Record<string, unknown>

export interface SqlDriver {
  readonly dialect: Dialect
  /** Run a statement that returns no rows (DDL, INSERT/UPDATE/DELETE). */
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Promise<void>
  /** Run a query and return all rows. */
  query: <T extends SqlRow = SqlRow>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<Array<T>>
  /** Run `fn` inside a transaction, passing a driver bound to the transaction. */
  transaction: <T>(fn: (tx: SqlDriver) => Promise<T>) => Promise<T>
}

/**
 * Positional placeholder for the dialect: `?` for SQLite, `$n` for Postgres.
 * `index` is 1-based to match Postgres `$1`, `$2`, …
 */
export function param(dialect: Dialect, index: number): string {
  return dialect === 'postgres' ? `$${index}` : '?'
}

/** Build N placeholders starting at `start` (1-based), e.g. `?, ?, ?`. */
export function params(dialect: Dialect, count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) =>
    param(dialect, start + i),
  ).join(', ')
}

/** Auto-incrementing integer primary-key column definition for the dialect. */
export function autoIncrementPk(dialect: Dialect): string {
  return dialect === 'postgres'
    ? 'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY'
    : 'INTEGER PRIMARY KEY AUTOINCREMENT'
}

/** JSON column type for the dialect. */
export function jsonColumn(dialect: Dialect): string {
  return dialect === 'postgres' ? 'JSONB' : 'TEXT'
}

/** Binary/blob column type for the dialect. */
export function blobColumn(dialect: Dialect): string {
  return dialect === 'postgres' ? 'BYTEA' : 'BLOB'
}

/**
 * 64-bit integer column for the dialect. Epoch-ms timestamps overflow Postgres
 * `INTEGER` (INT4, max ~2.1e9), so they must be `BIGINT`; SQLite `INTEGER` is
 * already 64-bit.
 */
export function bigIntColumn(dialect: Dialect): string {
  return dialect === 'postgres' ? 'BIGINT' : 'INTEGER'
}
