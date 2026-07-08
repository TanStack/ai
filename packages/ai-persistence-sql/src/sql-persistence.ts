/**
 * Assemble a {@link SqlPersistence} backed by SQL stores over a {@link SqlDriver}.
 *
 * By default the schema is not migrated; pass `migrate: true` to run lazy
 * migrations on first use. If you manage the schema yourself, apply
 * {@link migrate}/{@link ddl} outside this persistence wrapper.
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
  createEventLog,
  createInternalEventStore,
  createInterruptStore,
  createLegacyEventLog,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './stores'
import type { SqlDriver } from './driver'
import type {
  AIPersistence,
  ApprovalStore,
  MessageStore,
  PersistenceMode,
  RunStore,
} from '@tanstack/ai-persistence'
import type { LegacyEventLog } from './stores'

export interface SqlPersistenceOptions {
  mode?: PersistenceMode
  /** Run schema migrations on first use (default false). */
  migrate?: boolean
}

export type SqlPersistence = AIPersistence & {
  /** @deprecated Use stores.messages. */
  messages: MessageStore
  /** @deprecated Use stores.runs. */
  runs: RunStore
  /** @deprecated Use stores.publicEvents. */
  events: LegacyEventLog
  /** @deprecated Use stores.interrupts. */
  approvals: ApprovalStore
  /** @deprecated Use feature-based configuration instead of mode. */
  mode: PersistenceMode
}

export function createSqlPersistence(
  driver: SqlDriver,
  opts?: SqlPersistenceOptions,
): SqlPersistence {
  const shouldMigrate = opts?.migrate ?? false

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

  const messages = createMessageStore(gated)
  const runs = createRunStore(gated)
  const publicEvents = createEventLog(gated)
  const internalEvents = createInternalEventStore(gated)
  const interrupts = createInterruptStore(gated)
  const metadata = createMetadataStore(gated)
  const approvals = createApprovalStore(gated)
  return {
    stores: {
      messages,
      runs,
      publicEvents,
      internalEvents,
      interrupts,
      metadata,
    },
    messages,
    runs,
    events: createLegacyEventLog(gated),
    approvals,
    mode: opts?.mode ?? 'agent',
  }
}
