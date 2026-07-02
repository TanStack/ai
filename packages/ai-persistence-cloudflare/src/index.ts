/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare backend. D1 (SQLite-compatible) backs the shared SQL stores; an
 * optional Durable Object namespace can back the distributed lock.
 *
 * COMPILE-VERIFIED ONLY: this package type-checks against real `@cloudflare`
 * types but is not runtime-verified here (it needs a Workers runtime). The D1
 * driver itself is unit-tested against a fake D1 so the adapter logic is
 * covered.
 */
import { createSqlPersistence } from '@tanstack/ai-persistence-sql'
import type {
  SqlDriver,
  SqlPersistence,
  SqlRow,
} from '@tanstack/ai-persistence-sql'
import type { PersistenceMode } from '@tanstack/ai-persistence'
import type { LockStore } from '@tanstack/ai'

/** Build a {@link SqlDriver} over a Cloudflare D1 database (SQLite dialect). */
export function createD1Driver(d1: D1Database): SqlDriver {
  const driver: SqlDriver = {
    dialect: 'sqlite',
    async exec(sql, params = []) {
      await d1
        .prepare(sql)
        .bind(...(params as Array<never>))
        .run()
    },
    async query<T extends SqlRow = SqlRow>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) {
      const result = await d1
        .prepare(sql)
        .bind(...(params as Array<never>))
        .all<T>()
      return result.results
    },
    // D1 has no interactive transaction API (only batch); stores use
    // constraints plus reconciliation for CAS when this is a pass-through.
    transaction(fn) {
      return fn(driver)
    },
  }
  return driver
}

export interface CloudflarePersistenceOptions {
  d1: D1Database
  /** Optional Durable Object namespace for the distributed lock (see {@link createDurableObjectLockStore}). */
  durableObjects?: DurableObjectNamespace
  mode?: PersistenceMode
  /** Run migrations on first use (default true). */
  migrate?: boolean
}

export type CloudflarePersistence = SqlPersistence & {
  /** @deprecated Use stores.locks. */
  locks?: LockStore
}

/** Cloudflare-backed {@link CloudflarePersistence} (D1 SQL stores). */
export function cloudflarePersistence(
  opts: CloudflarePersistenceOptions,
): CloudflarePersistence {
  const persistence = createSqlPersistence(createD1Driver(opts.d1), {
    mode: opts.mode,
    migrate: opts.migrate,
  }) as CloudflarePersistence
  if (opts.durableObjects) {
    const locks = createDurableObjectLockStore(opts.durableObjects)
    persistence.stores.locks = locks
    persistence.locks = locks
  }
  return persistence
}

/**
 * Distributed lock over a Durable Object namespace. The companion DO class must
 * implement a `fetch` that serializes by holding the single-threaded DO; this
 * acquires by calling the DO keyed by the lock name. COMPILE-VERIFIED ONLY.
 */
export function createDurableObjectLockStore(
  ns: DurableObjectNamespace,
): LockStore {
  return {
    async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const stub = ns.get(ns.idFromName(key))
      // Acquire: the DO returns 200 once it holds the turn for this key.
      await stub.fetch('https://lock/acquire')
      try {
        return await fn()
      } finally {
        await stub.fetch('https://lock/release')
      }
    },
  }
}
