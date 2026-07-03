/**
 * Versioned schema migrations.
 *
 * Raw drivers run these on first use (opt-out at the backend level). Each
 * migration is applied at most once, tracked in `_tanstack_ai_migrations`.
 * Idempotent: re-running `migrate` is a no-op once all versions are applied.
 *
 * JSON is stored as large text (TEXT, or LONGTEXT on MySQL) so reads don't
 * depend on a driver's JSONB return shape; bytes are stored base64-encoded in
 * a text column for the same portability reason. Epoch-ms timestamps use
 * {@link bigIntColumn}.
 */
import {
  bigIntColumn,
  identifier,
  insertDoNothingPrefix,
  insertDoNothingSuffix,
  param,
  stringKeyColumn,
  textColumn,
} from './driver'
import type { Dialect, SqlDriver } from './driver'

interface Migration {
  version: number
  up: (dialect: Dialect) => Array<string>
}

/** DDL for schema v1. */
function v1(dialect: Dialect): Array<string> {
  const ts = bigIntColumn(dialect)
  const key = stringKeyColumn(dialect)
  const text = textColumn(dialect)
  const metadataKey = identifier(dialect, 'key')
  const usageKey = identifier(dialect, 'usage')
  return [
    `CREATE TABLE IF NOT EXISTS runs (
      run_id ${key} PRIMARY KEY,
      thread_id ${key} NOT NULL,
      status TEXT NOT NULL,
      started_at ${ts} NOT NULL,
      finished_at ${ts},
      error ${text},
      ${usageKey} ${text}
    )`,
    `CREATE TABLE IF NOT EXISTS public_events (
      run_id ${key} NOT NULL,
      seq INTEGER NOT NULL,
      event ${text} NOT NULL,
      PRIMARY KEY (run_id, seq)
    )`,
    `CREATE TABLE IF NOT EXISTS internal_events (
      run_id ${key} NOT NULL,
      namespace ${key} NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload ${text} NOT NULL,
      PRIMARY KEY (run_id, namespace, seq)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      thread_id ${key} PRIMARY KEY,
      messages ${text} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS interrupts (
      interrupt_id ${key} PRIMARY KEY,
      run_id ${key} NOT NULL,
      thread_id ${key} NOT NULL,
      status TEXT NOT NULL,
      requested_at ${ts} NOT NULL,
      resolved_at ${ts},
      payload ${text} NOT NULL,
      response ${text}
    )`,
    `CREATE TABLE IF NOT EXISTS metadata (
      scope ${key} NOT NULL,
      ${metadataKey} ${key} NOT NULL,
      value ${text} NOT NULL,
      PRIMARY KEY (scope, ${metadataKey})
    )`,
  ]
}

const MIGRATIONS: ReadonlyArray<Migration> = [{ version: 1, up: v1 }]

/** Raw DDL strings for a dialect (every migration, in order) — for users who manage schema themselves. */
export function ddl(dialect: Dialect): Array<string> {
  return MIGRATIONS.flatMap((m) => m.up(dialect))
}

/**
 * Apply any not-yet-applied migrations. Idempotent and transactional per
 * migration. Tracks applied versions in `_tanstack_ai_migrations`.
 */
export async function migrate(driver: SqlDriver): Promise<void> {
  await driver.exec(
    `CREATE TABLE IF NOT EXISTS _tanstack_ai_migrations (
      version INTEGER PRIMARY KEY,
      applied_at ${bigIntColumn(driver.dialect)} NOT NULL
    )`,
  )
  const rows = await driver.query<{ version: number }>(
    'SELECT version FROM _tanstack_ai_migrations',
  )
  const applied = new Set(rows.map((r) => Number(r.version)))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    await driver.transaction(async (tx) => {
      for (const statement of migration.up(tx.dialect)) {
        await tx.exec(statement)
      }
      await tx.exec(
        `${insertDoNothingPrefix(
          tx.dialect,
        )} _tanstack_ai_migrations (version, applied_at) VALUES (${param(
          tx.dialect,
          1,
        )}, ${param(tx.dialect, 2)})${insertDoNothingSuffix(tx.dialect, [
          'version',
        ])}`,
        [migration.version, Date.now()],
      )
    })
  }
}
