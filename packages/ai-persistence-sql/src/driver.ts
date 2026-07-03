/**
 * Minimal SQL driver contract the shared stores are written against. Each
 * backend (`-sqlite`, `-postgres`, `-cloudflare`, `-drizzle`, `-prisma`)
 * implements this over its client; the stores never see a concrete driver.
 */

export type Dialect = 'sqlite' | 'postgres' | 'mysql'

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
 * Positional placeholder for the dialect: `?` for SQLite/MySQL, `$n` for Postgres.
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
  if (dialect === 'postgres')
    return 'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY'
  if (dialect === 'mysql') return 'BIGINT AUTO_INCREMENT PRIMARY KEY'
  return 'INTEGER PRIMARY KEY AUTOINCREMENT'
}

/** JSON column type for the dialect. */
export function jsonColumn(dialect: Dialect): string {
  return dialect === 'postgres' ? 'JSONB' : 'TEXT'
}

/** Large text payload column type for the dialect. */
export function textColumn(dialect: Dialect): string {
  return dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'
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
  return dialect === 'sqlite' ? 'INTEGER' : 'BIGINT'
}

/** Bounded text key column for dialects that cannot index unrestricted TEXT. */
export function stringKeyColumn(dialect: Dialect): string {
  return dialect === 'mysql'
    ? 'VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin'
    : 'TEXT'
}

/** Quote an identifier for the target dialect. */
export function identifier(dialect: Dialect, name: string): string {
  if (dialect === 'mysql') return `\`${name.replaceAll('`', '``')}\``
  if (dialect === 'postgres') return `"${name.replaceAll('"', '""')}"`
  return `"${name.replaceAll('"', '""')}"`
}

/** Insert prefix for idempotent writes that should do nothing on unique conflicts. */
export function insertDoNothingPrefix(dialect: Dialect): string {
  void dialect
  return 'INSERT INTO'
}

/** Insert suffix for idempotent writes that should do nothing on unique conflicts. */
export function insertDoNothingSuffix(
  dialect: Dialect,
  conflictColumns: ReadonlyArray<string>,
): string {
  if (dialect === 'mysql') {
    const noopColumn = conflictColumns[0]
    return ` ON DUPLICATE KEY UPDATE ${noopColumn} = ${noopColumn}`
  }
  return ` ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING`
}

/** Upsert suffix for insert-or-update writes. */
export function upsertUpdateSuffix(
  dialect: Dialect,
  conflictColumns: ReadonlyArray<string>,
  assignments: ReadonlyArray<string>,
): string {
  if (dialect === 'mysql') {
    return ` ON DUPLICATE KEY UPDATE ${assignments.join(', ')}`
  }
  return ` ON CONFLICT (${conflictColumns.join(
    ', ',
  )}) DO UPDATE SET ${assignments.join(', ')}`
}
