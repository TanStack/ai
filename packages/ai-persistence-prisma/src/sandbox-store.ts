/**
 * Durable {@link SandboxStore} over a Prisma client.
 *
 * Backs `@tanstack/ai-sandbox`'s resume-or-create ensure. Independent of the
 * chat stores — pass it to `withSandboxPersistence`, not `prismaPersistence`.
 * Epoch-ms `updatedAt` is stored as a provider-neutral `BigInt`. Multi-instance
 * correctness additionally needs a distributed lock; this store only persists
 * the mapping.
 */
import { resolveSandboxDelegate } from './model-contract'
import type { SandboxRow } from './model-contract'
import type { PrismaClient } from '@prisma/client'
import type { SandboxRecord, SandboxStore } from '@tanstack/ai-sandbox'

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
  const sandbox = resolveSandboxDelegate(prisma, options?.model)
  return {
    async get(key) {
      const row = await sandbox.findUnique({ where: { key } })
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
      await sandbox.upsert({
        where: { key: record.key },
        create: { key: record.key, ...fields },
        update: fields,
      })
    },
    async delete(key) {
      await sandbox.deleteMany({ where: { key } })
    },
  }
}
