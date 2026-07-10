/**
 * Prisma-backed state persistence for TanStack AI.
 *
 * Add the provider-neutral {@link prismaModels} fragment to a Prisma multi-file
 * schema, run Prisma's normal migration workflow for your selected provider,
 * then pass the generated client to {@link prismaPersistence}.
 */
import { InMemoryLockStore } from '@tanstack/ai'
import {
  createArtifactStore,
  createBlobStore,
  createInterruptStore,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './stores'
import type { LockStore } from '@tanstack/ai'
import type { PrismaClient } from '@prisma/client'

export { prismaModels, prismaModelsFilename } from './models'

/** Wire TanStack AI persistence stores over a migrated Prisma client. */
export function prismaPersistence(prisma: PrismaClient) {
  const locks: LockStore = new InMemoryLockStore()
  return {
    stores: {
      messages: createMessageStore(prisma),
      runs: createRunStore(prisma),
      interrupts: createInterruptStore(prisma),
      metadata: createMetadataStore(prisma),
      artifacts: createArtifactStore(prisma),
      blobs: createBlobStore(prisma),
      locks,
    },
  }
}
