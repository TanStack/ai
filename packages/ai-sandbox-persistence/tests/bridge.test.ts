import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { getLocks, InMemoryLockStore } from '@tanstack/ai'
import { getSandboxStore } from '@tanstack/ai-sandbox'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { SqlDriver, SqlRow } from '@tanstack/ai-persistence-sql'
import { createSqlSandboxStore, withPersistenceBridge } from '../src/index'

/** Minimal capability context (provide/get key their WeakMap by this object). */
function fakeCtx() {
  return { capabilities: { markProvided: () => {} } }
}

function sqliteDriver(): SqlDriver {
  const db = new DatabaseSync(':memory:')
  const driver: SqlDriver = {
    dialect: 'sqlite',
    exec(sql, params = []) {
      db.prepare(sql).run(...(params as Array<never>))
      return Promise.resolve()
    },
    query<T extends SqlRow = SqlRow>(sql: string, params: ReadonlyArray<unknown> = []) {
      return Promise.resolve(db.prepare(sql).all(...(params as Array<never>)) as Array<T>)
    },
    transaction(fn) {
      return fn(driver)
    },
  }
  return driver
}

describe('createSqlSandboxStore', () => {
  it('round-trips upsert / get / delete', async () => {
    const store = createSqlSandboxStore(sqliteDriver())
    expect(await store.get('k')).toBeNull()
    await store.upsert({
      key: 'k',
      provider: 'docker',
      providerSandboxId: 'sb-1',
      threadId: 't1',
      latestRunId: 'r1',
      updatedAt: 123,
    })
    const got = await store.get('k')
    expect(got?.providerSandboxId).toBe('sb-1')
    expect(got?.threadId).toBe('t1')
    expect(got?.latestRunId).toBe('r1')

    await store.upsert({
      key: 'k',
      provider: 'docker',
      providerSandboxId: 'sb-2',
      threadId: 't1',
      updatedAt: 456,
    })
    expect((await store.get('k'))?.providerSandboxId).toBe('sb-2')

    await store.delete('k')
    expect(await store.get('k')).toBeNull()
  })
})

describe('withPersistenceBridge', () => {
  it('provides the durable LockStore and SandboxStore into the context', async () => {
    const persistence = memoryPersistence()
    const lock = new InMemoryLockStore()
    persistence.locks = lock
    const sandboxStore = createSqlSandboxStore(sqliteDriver())

    const mw = withPersistenceBridge({ persistence, sandboxStore })
    const ctx = fakeCtx() as unknown as Parameters<NonNullable<typeof mw.setup>>[0]
    await mw.setup!(ctx)

    expect(getLocks(ctx)).toBe(lock)
    expect(getSandboxStore(ctx)).toBe(sandboxStore)
  })

  it('declares only the capabilities it can provide', () => {
    const mw = withPersistenceBridge({})
    expect(mw.provides ?? []).toEqual([])
  })
})
