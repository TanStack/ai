/**
 * Prisma-backed state persistence for TanStack AI.
 *
 * Add the provider-neutral {@link prismaModels} fragment to a Prisma multi-file
 * schema, run Prisma's normal migration workflow for your selected provider,
 * then pass the generated client to {@link prismaPersistence}.
 */
import { resolveDelegates } from './model-contract'
import {
  createArtifactStore,
  createBlobStore,
  createInterruptStore,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './stores'
import type { PrismaModelMap } from './model-contract'
import type { PrismaClient } from '@prisma/client'

export { prismaModels, prismaModelsFilename } from './models'
export { PrismaModelError } from './model-contract'
export type { PrismaModelMap } from './model-contract'

export interface PrismaPersistenceOptions {
  /**
   * Rename the TanStack AI models in your copy of the fragment — for example
   * to avoid a collision with an existing `Message` or `Run` model — and map
   * each store to the renamed client delegate here. Values are the camelCase
   * client accessor names: `model ChatMessage` → `{ messages: 'chatMessage' }`.
   * Keep the field names and types from the fragment; database table and
   * column names are already yours via `@@map` / `@map`.
   */
  models?: PrismaModelMap
}

/**
 * Wire TanStack AI persistence stores over a migrated Prisma client.
 *
 * No `locks` store is returned: this backend has no distributed lock primitive,
 * and bundling an `InMemoryLockStore` would silently hand multi-instance
 * deployments a lock that does not lock across instances. Consumers that need a
 * lock (e.g. `withSandbox`) transparently fall back to an in-process
 * `InMemoryLockStore`; for cross-instance locking use a distributed backend such
 * as the Cloudflare Durable Object lock (`@tanstack/ai-persistence-cloudflare`).
 */
export function prismaPersistence(
  prisma: PrismaClient,
  options?: PrismaPersistenceOptions,
) {
  const delegates = resolveDelegates(prisma, options?.models)
  return {
    stores: {
      messages: createMessageStore(delegates),
      runs: createRunStore(delegates),
      interrupts: createInterruptStore(delegates),
      metadata: createMetadataStore(delegates),
      artifacts: createArtifactStore(delegates),
      blobs: createBlobStore(delegates),
    },
  }
}
