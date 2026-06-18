/**
 * Test-only SqlDriver over Node's built-in `node:sqlite` (Node 22+). Lets the
 * shared SQL stores be runtime-verified here without depending on the
 * `@tanstack/ai-persistence-sqlite` package (which productionizes this same
 * adapter). Uses an in-memory database by default.
 */
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver, SqlRow } from '../src/driver'

export function createTestSqliteDriver(path = ':memory:'): SqlDriver {
  const db = new DatabaseSync(path)
  const driver: SqlDriver = {
    dialect: 'sqlite',
    exec(sql, params = []) {
      db.prepare(sql).run(...(params as Array<never>))
      return Promise.resolve()
    },
    query<T extends SqlRow = SqlRow>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) {
      const rows = db.prepare(sql).all(...(params as Array<never>))
      return Promise.resolve(rows as Array<T>)
    },
    // node:sqlite has no async transaction API; run statements directly. The
    // stores only group DDL here, which is acceptable for tests.
    transaction(fn) {
      return fn(driver)
    },
  }
  return driver
}
