/**
 * Node-only SQLite convenience factory for TanStack AI persistence.
 *
 * Schema-first: pass your schema (or accept {@link createDefaultSqliteSchema}),
 * and optionally bootstrap tables from that schema at runtime. This package
 * does **not** ship versioned SQL migrations — production apps should emit the
 * schema with `tanstack-ai-drizzle-schema` and migrate via their own drizzle-kit
 * journal.
 *
 * Uses Node's built-in `node:sqlite` (`DatabaseSync`). That module is still a
 * release candidate in some Node versions; pin a release that documents the API
 * you rely on, or use {@link drizzlePersistence} with a stable driver.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { createDefaultSqliteSchema } from './default-sqlite-schema'
import { ensureSqliteTables } from './ensure-sqlite-tables'
import { drizzlePersistence } from './index'
import type { TanstackAiSqliteSchema } from './schema-contract'

export { createDefaultSqliteSchema } from './default-sqlite-schema'
export { ensureSqliteTables } from './ensure-sqlite-tables'

export interface SqlitePersistenceOptions {
  /** `:memory:`, a filesystem path, or a `file:`-prefixed filesystem path. */
  url: string
  /**
   * Schema tables the stores operate on. Defaults to
   * {@link createDefaultSqliteSchema}. Prefer a project-owned copy emitted by
   * `tanstack-ai-drizzle-schema` when you use drizzle-kit for migrations.
   */
  schema?: TanstackAiSqliteSchema
  /**
   * When true (default), create missing tables derived from `schema` via
   * `CREATE TABLE IF NOT EXISTS`. This is a local bootstrap convenience, not a
   * migration system — set `false` when your drizzle-kit migrations already
   * created the tables.
   */
  ensureTables?: boolean
}

/**
 * Build persistence over Node's built-in SQLite driver with stock defaults.
 *
 * @example Zero-config local file
 * ```ts
 * const persistence = sqlitePersistence({
 *   url: 'file:.data/ai.sqlite',
 * })
 * ```
 *
 * @example Project-owned schema (after `tanstack-ai-drizzle-schema` + kit migrate)
 * ```ts
 * import { schema } from './db/tanstack-ai-schema'
 *
 * const persistence = sqlitePersistence({
 *   url: 'file:.data/ai.sqlite',
 *   schema,
 *   ensureTables: false,
 * })
 * ```
 */
export function sqlitePersistence(options: SqlitePersistenceOptions) {
  const schema = options.schema ?? createDefaultSqliteSchema()
  const filename = normalizeSqliteUrl(options.url)
  ensureParentDirectory(filename)
  const sqlite = new DatabaseSync(filename)
  try {
    if (options.ensureTables !== false) {
      ensureSqliteTables((sql) => sqlite.exec(sql), schema)
    }
  } catch (error) {
    sqlite.close()
    throw error
  }

  const db = drizzle((sql, params, method) => {
    const statement = sqlite.prepare(sql)
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

  const persistence = drizzlePersistence(db, { schema })
  let closed = false
  return {
    ...persistence,
    close() {
      if (closed) return
      sqlite.close()
      closed = true
    },
  }
}

function normalizeSqliteUrl(url: string): string {
  if (url === ':memory:' || url === 'file::memory:') return ':memory:'
  if (url.startsWith('file://')) return validateFilename(fileURLToPath(url))
  if (url.startsWith('file:')) {
    return validateFilename(url.slice('file:'.length))
  }
  const isWindowsPath = /^[A-Za-z]:[\\/]/.test(url)
  if (!isWindowsPath && /^[A-Za-z][A-Za-z\d+.-]*:/.test(url)) {
    throw new Error(`Unsupported SQLite URL scheme: ${url}`)
  }
  return validateFilename(url)
}

function validateFilename(filename: string): string {
  if (filename.length === 0 || filename.includes('\0')) {
    throw new Error('SQLite URL must identify a non-empty filesystem path')
  }
  return filename
}

function ensureParentDirectory(filename: string): void {
  if (filename === ':memory:') return
  const parent = dirname(filename)
  if (parent !== '.') mkdirSync(parent, { recursive: true })
}
