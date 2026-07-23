/**
 * Durable {@link SandboxStore} over a Prisma client.
 *
 * Backs `@tanstack/ai-sandbox`'s resume-or-create ensure. Epoch-ms `updatedAt`
 * is stored as a provider-neutral `BigInt`. Multi-instance correctness
 * additionally needs a distributed lock; this store only persists the mapping.
 *
 * The `Sandbox` delegate is resolved LAZILY, on first use. `prismaPersistence`
 * always includes this store, but a chat-only client whose schema omits the
 * `Sandbox` model never triggers resolution (it only runs when `withSandbox`
 * uses the store), so those clients keep working.
 */
import { resolveSandboxDelegate } from './model-contract'
import type { SandboxDelegate, SandboxRow } from './model-contract'
import type { PrismaClient } from '@prisma/client'
import type { SandboxRecord, SandboxStore } from '@tanstack/ai'

function mapSandbox(row: SandboxRow): SandboxRecord {
  return {
    key: row.key,
    provider: row.provider,
    providerSandboxId: row.providerSandboxId,
    ...(row.latestSnapshotId != null
      ? { latestSnapshotId: row.latestSnapshotId }
      : {}),
    threadId: row.threadId,
    ...(row.latestRunId != null ? { latestRunId: row.latestRunId } : {}),
    updatedAt: Number(row.updatedAt),
  }
}

/** Options for {@link createPrismaSandboxStore}. */
export interface PrismaSandboxStoreOptions {
  /**
   * Client accessor name for the sandbox model if you renamed it in your copy
   * of the fragment (default `sandbox`, i.e. `model Sandbox`).
   */
  model?: string
}

/** Wire a durable {@link SandboxStore} over a migrated Prisma client. */
export function createPrismaSandboxStore(
  prisma: PrismaClient,
  options?: PrismaSandboxStoreOptions,
): SandboxStore {
  // Resolve the delegate on first use so a chat-only client without the
  // `Sandbox` model isn't rejected at construction time.
  let delegate: SandboxDelegate | undefined
  const sandbox = (): SandboxDelegate =>
    (delegate ??= resolveSandboxDelegate(prisma, options?.model))
  return {
    async get(key) {
      const row = await sandbox().findUnique({ where: { key } })
      return row ? mapSandbox(row) : null
    },
    async upsert(record) {
      const fields = {
        provider: record.provider,
        providerSandboxId: record.providerSandboxId,
        latestSnapshotId: record.latestSnapshotId ?? null,
        threadId: record.threadId,
        latestRunId: record.latestRunId ?? null,
        updatedAt: BigInt(record.updatedAt),
      }
      await sandbox().upsert({
        where: { key: record.key },
        create: { key: record.key, ...fields },
        update: fields,
      })
    },
    async delete(key) {
      await sandbox().deleteMany({ where: { key } })
    },
  }
}
