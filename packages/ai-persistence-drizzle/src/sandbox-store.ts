/**
 * Durable {@link SandboxStore} over a Drizzle sqlite database.
 *
 * Backs `@tanstack/ai-sandbox`'s resume-or-create ensure: maps a compound
 * sandbox key to the provider sandbox (and latest snapshot) that should be
 * resumed. Independent of the chat stores — pass it to `withSandboxPersistence`,
 * not `drizzlePersistence`. Multi-instance correctness additionally needs a
 * distributed lock (e.g. the Cloudflare Durable Object lock); this store only
 * persists the mapping.
 */
import { eq } from 'drizzle-orm'
import { schema } from './schema'
import type { SandboxRecord, SandboxStore } from '@tanstack/ai-sandbox'
import type { DrizzleSqliteDb } from './stores'

function mapSandbox(row: typeof schema.sandboxes.$inferSelect): SandboxRecord {
  return {
    key: row.key,
    provider: row.provider,
    providerSandboxId: row.providerSandboxId,
    ...(row.latestSnapshotId != null
      ? { latestSnapshotId: row.latestSnapshotId }
      : {}),
    threadId: row.threadId,
    ...(row.latestRunId != null ? { latestRunId: row.latestRunId } : {}),
    updatedAt: row.updatedAt,
  }
}

/** Wire a durable {@link SandboxStore} over the bundled `sandboxes` table. */
export function createDrizzleSandboxStore(db: DrizzleSqliteDb): SandboxStore {
  const { sandboxes } = schema
  return {
    async get(key) {
      const rows = await db
        .select()
        .from(sandboxes)
        .where(eq(sandboxes.key, key))
      const row = rows[0]
      return row ? mapSandbox(row) : null
    },
    async upsert(record) {
      const values = {
        key: record.key,
        provider: record.provider,
        providerSandboxId: record.providerSandboxId,
        latestSnapshotId: record.latestSnapshotId ?? null,
        threadId: record.threadId,
        latestRunId: record.latestRunId ?? null,
        updatedAt: record.updatedAt,
      }
      await db
        .insert(sandboxes)
        .values(values)
        .onConflictDoUpdate({
          target: sandboxes.key,
          set: {
            provider: values.provider,
            providerSandboxId: values.providerSandboxId,
            latestSnapshotId: values.latestSnapshotId,
            threadId: values.threadId,
            latestRunId: values.latestRunId,
            updatedAt: values.updatedAt,
          },
        })
    },
    async delete(key) {
      await db.delete(sandboxes).where(eq(sandboxes.key, key))
    },
  }
}
