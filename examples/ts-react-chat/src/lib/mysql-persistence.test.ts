import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { createMysqlPersistence } from './mysql-persistence'
import type { Pool, PoolConnection } from 'mysql2/promise'

function createFakePool() {
  const calls: Array<string> = []
  let inserted = false
  const connection = {
    async execute(sql: string) {
      calls.push(sql)
      if (sql.includes('SELECT seq, event FROM public_events')) {
        return [
          inserted
            ? [
                {
                  seq: 1,
                  event: JSON.stringify({
                    type: EventType.TEXT_MESSAGE_CONTENT,
                    messageId: 'm1',
                    delta: 'hi',
                    timestamp: 1,
                  }),
                },
              ]
            : [],
          [],
        ]
      }
      if (sql.includes('SELECT MAX(seq) AS max_seq')) {
        return [[{ max_seq: 0 }], []]
      }
      if (sql.includes('INSERT INTO public_events')) {
        inserted = true
      }
      return [[], []]
    },
    async beginTransaction() {
      calls.push('BEGIN')
    },
    async commit() {
      calls.push('COMMIT')
    },
    async rollback() {
      calls.push('ROLLBACK')
    },
    release() {
      calls.push('RELEASE')
    },
  } as unknown as PoolConnection
  const pool = {
    async getConnection() {
      return connection
    },
    async execute(sql: string) {
      calls.push(sql)
      return [[], []]
    },
  } as unknown as Pool
  return { calls, pool }
}

describe('createMysqlPersistence', () => {
  it('sets READ COMMITTED before beginning store transactions', async () => {
    const { calls, pool } = createFakePool()

    const persistence = createMysqlPersistence(pool)
    await persistence.stores.publicEvents!.append({
      runId: 'run-1',
      expectedSeq: 0,
      event: {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm1',
        delta: 'hi',
        timestamp: 1,
      },
    })

    const beginIndex = calls.indexOf('BEGIN')
    expect(beginIndex).toBeGreaterThan(0)
    expect(calls[beginIndex - 1]).toBe(
      'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
    )
  })

  it('rejects undefined bind parameter values before mysql2 execution', async () => {
    const { pool } = createFakePool()
    const persistence = createMysqlPersistence(pool)

    await expect(
      persistence.stores.metadata!.set('scope', 'key', undefined),
    ).rejects.toThrow('Unsupported MySQL bind parameter value')
  })
})
