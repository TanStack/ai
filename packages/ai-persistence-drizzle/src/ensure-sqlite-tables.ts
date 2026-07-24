/**
 * Derive `CREATE TABLE IF NOT EXISTS` statements from a user-supplied (or
 * default) SQLite schema. Used by the Node convenience factory so local/dev
 * can bootstrap without shipping versioned migrations from this package.
 *
 * Production apps should emit the schema with `tanstack-ai-drizzle-schema` and
 * generate migrations via their own drizzle-kit journal instead of relying on
 * runtime table creation for schema evolution.
 */
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { TanstackAiSqliteSchema } from './schema-contract'

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

function createTableSql(table: SQLiteTable): string {
  const config = getTableConfig(table)
  const columnSql = config.columns.map((column) => {
    const parts = [`${quoteIdent(column.name)} ${column.getSQLType()}`]
    if (column.primary) parts.push('PRIMARY KEY')
    if (column.notNull && !column.primary) parts.push('NOT NULL')
    return parts.join(' ')
  })

  for (const primaryKey of config.primaryKeys) {
    const cols = primaryKey.columns.map((column) => quoteIdent(column.name))
    columnSql.push(`PRIMARY KEY(${cols.join(', ')})`)
  }

  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(config.name)} (${columnSql.join(', ')})`
}

function createIndexSql(table: SQLiteTable): Array<string> {
  const config = getTableConfig(table)
  const statements: Array<string> = []
  for (const index of config.indexes) {
    const name = index.config.name
    // Emit only plain named-column indexes (not raw SQL expressions); leave
    // anything fancier to drizzle-kit migrations.
    const cols = index.config.columns
      .map((column) =>
        'name' in column && typeof column.name === 'string'
          ? quoteIdent(column.name)
          : null,
      )
      .filter((column): column is string => column !== null)
    if (!name || cols.length !== index.config.columns.length) continue
    const unique = index.config.unique ? 'UNIQUE ' : ''
    statements.push(
      `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdent(name)} ON ${quoteIdent(config.name)} (${cols.join(', ')})`,
    )
  }
  return statements
}

/**
 * Create missing tables (and their indexes) for every table in `schema`.
 * Idempotent. Does not alter existing tables — use drizzle-kit migrations for
 * evolution.
 */
export function ensureSqliteTables(
  exec: (sql: string) => void,
  schema: TanstackAiSqliteSchema,
): void {
  for (const table of Object.values(schema)) {
    exec(createTableSql(table))
    for (const indexSql of createIndexSql(table)) exec(indexSql)
  }
}
