/**
 * Assemble a {@link ChatPersistence} backed by SQL stores over a {@link SqlDriver}.
 *
 * By default the schema is migrated on first use (`migrate: true`); pass
 * `migrate: false` to manage the schema yourself (call {@link migrate}/{@link ddl}).
 *
 * Migration runs lazily and exactly once, gated at the DRIVER level: the stores
 * are built on a wrapper whose every `exec`/`query`/`transaction` first awaits
 * the (idempotent, memoized) migration. This is why it composes correctly with
 * `EventLog.read`, which returns an async iterable synchronously — the gate fires
 * when the generator calls `query`, not when `read` is invoked. Migration itself
 * runs on the RAW driver to avoid recursing through the gate.
 */
import { migrate as runMigrations } from './migrations'
import {
  createApprovalStore,
  createArtifactStore,
  createEventLog,
  createMessageStore,
  createRunStore,
} from './stores'
import type { SqlDriver } from './driver'
import type { ChatPersistence, PersistenceMode } from '@tanstack/ai-persistence'

export interface SqlPersistenceOptions {
  mode?: PersistenceMode
  /** Run schema migrations on first use (default true). Set false to self-manage. */
  migrate?: boolean
}

export function createSqlPersistence(
  driver: SqlDriver,
  opts?: SqlPersistenceOptions,
): ChatPersistence {
  const shouldMigrate = opts?.migrate ?? true

  let migrated: Promise<void> | undefined
  const ensureSchema = (): Promise<void> => {
    if (!shouldMigrate) return Promise.resolve()
    migrated ??= runMigrations(driver) // runs on the RAW driver — no recursion
    return migrated
  }

  const gated: SqlDriver = {
    dialect: driver.dialect,
    async exec(sql, params) {
      await ensureSchema()
      return driver.exec(sql, params)
    },
    async query(sql, params) {
      await ensureSchema()
      return driver.query(sql, params)
    },
    async transaction(fn) {
      await ensureSchema()
      return driver.transaction(fn)
    },
  }

  return {
    mode: opts?.mode ?? 'agent',
    messages: createMessageStore(gated),
    runs: createRunStore(gated),
    events: createEventLog(gated),
    approvals: createApprovalStore(gated),
    artifacts: createArtifactStore(gated),
  }
}
