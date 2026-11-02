// Kiira stand-in for the app's `@/db` module. Not used at runtime.
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { Pool } from 'pg'

const sqlite = new DatabaseSync(':memory:')

export const db = drizzle(async () => {
  sqlite.exec('select 1')
  return { rows: [] }
})

export const pool = new Pool({
  connectionString: 'postgres://127.0.0.1/kiira',
})
