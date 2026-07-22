/** Node-only SQLite convenience factory for TanStack AI persistence. */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { sqliteMigrations } from './migrations'
import { applySqliteMigrations } from './sqlite-migrations'
import { drizzlePersistence } from './index'

export { SqliteMigrationError } from './sqlite-migrations'

export interface SqlitePersistenceOptions {
  /** `:memory:`, a filesystem path, or a `file:`-prefixed filesystem path. */
  url: string
  /** Apply the bundled TanStack AI migrations before creating stores. */
  migrate?: boolean
}

/** Build persistence over Node's built-in SQLite driver. */
export function sqlitePersistence(options: SqlitePersistenceOptions) {
  const filename = normalizeSqliteUrl(options.url)
  ensureParentDirectory(filename)
  const sqlite = new DatabaseSync(filename)
  try {
    if (options.migrate) applySqliteMigrations(sqlite, sqliteMigrations)
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

  const persistence = drizzlePersistence(db)
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
