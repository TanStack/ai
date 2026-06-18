import { describe, expect, it } from 'vitest'
import { createPostgresDriver } from '../src/index'
import type { PgPool, PgPoolClient } from '../src/index'

/** A fake pg pool recording SQL, returning canned rows, tracking tx control. */
function fakePool() {
  const calls: Array<{ sql: string; params?: ReadonlyArray<unknown> }> = []
  let nextRows: Array<Record<string, unknown>> = []
  let released = false
  const client: PgPoolClient = {
    query: (sql, params) => {
      calls.push({ sql, params })
      return Promise.resolve({ rows: sql.startsWith('SELECT') ? nextRows : [] })
    },
    release: () => {
      released = true
    },
  }
  const pool: PgPool = {
    query: (sql, params) => {
      calls.push({ sql, params })
      return Promise.resolve({ rows: sql.startsWith('SELECT') ? nextRows : [] })
    },
    connect: () => Promise.resolve(client),
  }
  return {
    pool,
    calls,
    setRows: (rows: Array<Record<string, unknown>>) => {
      nextRows = rows
    },
    wasReleased: () => released,
  }
}

describe('createPostgresDriver (BYO pool)', () => {
  it('forwards sql + params and returns rows', async () => {
    const f = fakePool()
    f.setRows([{ run_id: 'r1' }])
    const driver = createPostgresDriver({ client: f.pool })

    await driver.exec('INSERT INTO runs (run_id) VALUES ($1)', ['r1'])
    const rows = await driver.query('SELECT * FROM runs WHERE run_id = $1', [
      'r1',
    ])

    expect(rows).toEqual([{ run_id: 'r1' }])
    expect(f.calls[0]).toEqual({
      sql: 'INSERT INTO runs (run_id) VALUES ($1)',
      params: ['r1'],
    })
    expect(driver.dialect).toBe('postgres')
  })

  it('wraps a transaction in BEGIN/COMMIT on a dedicated connection', async () => {
    const f = fakePool()
    const driver = createPostgresDriver({ client: f.pool })
    await driver.transaction(async (tx) => {
      await tx.exec('UPDATE runs SET status = $1', ['done'])
    })
    const sqls = f.calls.map((c) => c.sql)
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls).toContain('UPDATE runs SET status = $1')
    expect(sqls[sqls.length - 1]).toBe('COMMIT')
    expect(f.wasReleased()).toBe(true)
  })

  it('rolls back and rethrows on error', async () => {
    const f = fakePool()
    const driver = createPostgresDriver({ client: f.pool })
    await expect(
      driver.transaction(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(f.calls.map((c) => c.sql)).toContain('ROLLBACK')
    expect(f.wasReleased()).toBe(true)
  })
})
