/**
 * Versioned schema migrations.
 *
 * Raw drivers run these on first use (opt-out at the backend level). Each
 * migration is applied at most once, tracked in `_tanstack_ai_migrations`.
 * Idempotent: re-running `migrate` is a no-op once all versions are applied.
 *
 * JSON is stored as TEXT in BOTH dialects (the stores stringify/parse) so reads
 * don't depend on a driver's JSONB return shape; bytes are stored base64-encoded
 * in a TEXT column for the same portability reason. Epoch-ms timestamps use
 * {@link bigIntColumn}.
 */
import { bigIntColumn, param } from './driver'
import type { Dialect, SqlDriver } from './driver'

interface Migration {
  version: number
  up: (dialect: Dialect) => Array<string>
}

/** DDL for schema v1. */
function v1(dialect: Dialect): Array<string> {
  const ts = bigIntColumn(dialect)
  return [
    `CREATE TABLE IF NOT EXISTS message_threads (
      thread_id TEXT PRIMARY KEY,
      messages TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at ${ts} NOT NULL,
      finished_at ${ts},
      error TEXT,
      usage TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS run_events (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event TEXT NOT NULL,
      PRIMARY KEY (run_id, seq)
    )`,
    `CREATE TABLE IF NOT EXISTS approvals (
      approval_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_at ${ts} NOT NULL,
      resolved_at ${ts},
      payload TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS artifacts (
      artifact_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      bytes_b64 TEXT,
      external_url TEXT,
      created_at ${ts} NOT NULL
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
        `INSERT INTO _tanstack_ai_migrations (version, applied_at) VALUES (${param(
          tx.dialect,
          1,
        )}, ${param(tx.dialect, 2)})`,
        [migration.version, Date.now()],
      )
    })
  }
}
