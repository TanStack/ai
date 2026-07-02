/**
 * Bridge between the sandbox layer and persistence (agent mode).
 *
 * - {@link createSqlSandboxStore} — a durable, SQL-backed `SandboxStore` so the
 *   sandbox `ensure` algorithm can resume the same provider sandbox across
 *   processes (the in-memory default only resumes within one process).
 * - {@link withPersistenceBridge} — middleware that provides the durable
 *   `LockStore` (from an `AIPersistence`) and/or a durable `SandboxStore` into
 *   the capabilities `withSandbox` optionally requires. Ordered BETWEEN
 *   `withPersistence` and `withSandbox`.
 *
 * This package depends on both sides so neither core package has to: persistence
 * stays sandbox-free, and ai-sandbox doesn't force a SQL dependency.
 */
import { defineChatMiddleware } from '@tanstack/ai'
import {
  LocksCapability,
  SandboxStoreCapability,
  provideLocks,
  provideSandboxStore,
} from '@tanstack/ai-sandbox'
import { param } from '@tanstack/ai-persistence-sql'
import type { SqlDriver } from '@tanstack/ai-persistence-sql'
import type { SandboxRecord, SandboxStore } from '@tanstack/ai-sandbox'
import type { ChatMiddleware } from '@tanstack/ai'
import type { AIPersistence } from '@tanstack/ai-persistence'

/** Durable, SQL-backed {@link SandboxStore}. Creates its table lazily on first use. */
export function createSqlSandboxStore(driver: SqlDriver): SandboxStore {
  const p = (i: number) => param(driver.dialect, i)
  let ready: Promise<void> | undefined
  const ensure = (): Promise<void> => {
    ready ??= driver.exec(
      `CREATE TABLE IF NOT EXISTS sandbox_instances (
        key TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_sandbox_id TEXT NOT NULL,
        latest_snapshot_id TEXT,
        thread_id TEXT NOT NULL,
        latest_run_id TEXT,
        updated_at ${driver.dialect === 'postgres' ? 'BIGINT' : 'INTEGER'} NOT NULL
      )`,
    )
    return ready
  }

  return {
    async get(key) {
      await ensure()
      const rows = await driver.query(
        `SELECT * FROM sandbox_instances WHERE key = ${p(1)}`,
        [key],
      )
      const row = rows[0]
      if (!row) return null
      const record: SandboxRecord = {
        key: String(row.key),
        provider: String(row.provider),
        providerSandboxId: String(row.provider_sandbox_id),
        threadId: String(row.thread_id),
        updatedAt: Number(row.updated_at),
        ...(row.latest_snapshot_id != null
          ? { latestSnapshotId: String(row.latest_snapshot_id) }
          : {}),
        ...(row.latest_run_id != null
          ? { latestRunId: String(row.latest_run_id) }
          : {}),
      }
      return record
    },
    async upsert(record) {
      await ensure()
      // Use `excluded.*` (not re-bound params) in the UPDATE so the statement
      // works on BOTH sqlite (positional `?`, no reuse) and postgres.
      await driver.exec(
        `INSERT INTO sandbox_instances
          (key, provider, provider_sandbox_id, latest_snapshot_id, thread_id, latest_run_id, updated_at)
         VALUES (${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)})
         ON CONFLICT (key) DO UPDATE SET
          provider = excluded.provider,
          provider_sandbox_id = excluded.provider_sandbox_id,
          latest_snapshot_id = excluded.latest_snapshot_id,
          thread_id = excluded.thread_id,
          latest_run_id = excluded.latest_run_id,
          updated_at = excluded.updated_at`,
        [
          record.key,
          record.provider,
          record.providerSandboxId,
          record.latestSnapshotId ?? null,
          record.threadId,
          record.latestRunId ?? null,
          record.updatedAt,
        ],
      )
    },
    async delete(key) {
      await ensure()
      await driver.exec(`DELETE FROM sandbox_instances WHERE key = ${p(1)}`, [
        key,
      ])
    },
  }
}

export interface PersistenceBridgeOptions {
  /** Source of the durable `LockStore` (uses `persistence.stores.locks` when present). */
  persistence?: AIPersistence
  /** Durable sandbox store (e.g. {@link createSqlSandboxStore}). */
  sandboxStore?: SandboxStore
}

/**
 * Wire durable sandbox capabilities into the stack. Provides `LocksCapability`
 * when the persistence aggregate carries a lock store, and `SandboxStoreCapability`
 * when a durable sandbox store is supplied. Place after `withPersistence` and
 * before `withSandbox`.
 */
export function withPersistenceBridge(
  opts: PersistenceBridgeOptions,
): ChatMiddleware {
  const lock = opts.persistence?.stores.locks
  const provides = [
    ...(lock ? [LocksCapability] : []),
    ...(opts.sandboxStore ? [SandboxStoreCapability] : []),
  ]
  return defineChatMiddleware({
    name: 'persistence-bridge',
    provides,
    setup(ctx) {
      if (lock) provideLocks(ctx, lock)
      if (opts.sandboxStore) provideSandboxStore(ctx, opts.sandboxStore)
    },
  })
}
